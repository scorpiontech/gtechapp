import React, { useState, useEffect } from 'react';
import { Copy, ExternalLink, Loader2, AlertCircle, Receipt } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MikWebBoleto } from '@/types/mikweb';

const Boletos: React.FC = () => {
  const { cliente } = useAuth();
  const { toast } = useToast();
  const [boletos, setBoletos] = useState<MikWebBoleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBoletos = async () => {
      if (!cliente) return;

      try {
        const { data, error: fnError } = await supabase.functions.invoke('mikweb-boletos', {
          body: { cliente_id: cliente.id },
        });

        if (fnError) throw fnError;

        if (data.success) {
          setBoletos(data.boletos || []);
        } else {
          setError(data.error || 'Erro ao carregar boletos');
        }
      } catch (err) {
        setError('Erro ao conectar com o servidor');
      } finally {
        setLoading(false);
      }
    };

    fetchBoletos();
  }, [cliente]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Copiado!',
        description: 'Código copiado para a área de transferência.',
      });
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível copiar o código.',
        variant: 'destructive',
      });
    }
  };

  const openBoleto = (url: string) => {
    window.open(url, '_blank');
  };

  const getBoletoStatus = (boleto: MikWebBoleto): string => {
    const vencimento = new Date(boleto.vencimento);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // Garantir que status seja tratado como string
    const statusStr = String(boleto.status || '').toLowerCase();
    
    if (statusStr === 'pago' || statusStr === 'paid' || statusStr === 'p') return 'pago';
    if (statusStr === 'cancelado' || statusStr === 'canceled' || statusStr === 'c') return 'cancelado';
    if (vencimento < hoje) return 'vencido';
    return 'aberto';
  };

  if (!cliente) return null;

  return (
    <AppLayout title="Boletos" showBack>
      <div className="p-4 space-y-4">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Carregando boletos...</p>
          </div>
        )}

        {error && (
          <Card className="border-destructive/50">
            <CardContent className="p-6 flex flex-col items-center gap-4 text-center">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <div>
                <p className="font-semibold">Erro ao carregar</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Tentar novamente
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !error && boletos.length === 0 && (
          <Card>
            <CardContent className="p-6 flex flex-col items-center gap-4 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-semibold">Nenhum boleto encontrado</p>
                <p className="text-sm text-muted-foreground">
                  Não há boletos disponíveis no momento.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && !error && boletos.length > 0 && (
          <div className="space-y-3">
            {boletos.map((boleto) => {
              const status = getBoletoStatus(boleto);
              const isPago = status === 'pago';

              return (
                <Card key={boleto.id} className={isPago ? 'opacity-60' : ''}>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Vencimento</p>
                        <p className="font-semibold">
                          {new Date(boleto.vencimento).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <StatusBadge status={status} />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Valor</p>
                        <p className="text-xl font-bold text-primary">
                          {new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          }).format(boleto.valor)}
                        </p>
                      </div>
                    </div>

                    {!isPago && (
                      <div className="flex gap-2">
                        {boleto.linha_digitavel && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => copyToClipboard(boleto.linha_digitavel!)}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copiar código
                          </Button>
                        )}
                        {boleto.link_boleto && (
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => openBoleto(boleto.link_boleto!)}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Ver boleto
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Boletos;
