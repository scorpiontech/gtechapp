import React, { useState, useEffect } from 'react';
import { Copy, ExternalLink, Loader2, AlertCircle, Receipt, QrCode, Barcode, CheckCircle2, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MikWebBoleto } from '@/types/mikweb';

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  // Handle "YYYY-MM-DD" format
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const Boletos: React.FC = () => {
  const { cliente } = useAuth();
  const { toast } = useToast();
  const [boletos, setBoletos] = useState<MikWebBoleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

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
      } catch {
        setError('Erro ao conectar com o servidor');
      } finally {
        setLoading(false);
      }
    };
    fetchBoletos();
  }, [cliente]);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copiado!', description: `${label} copiado para a área de transferência.` });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível copiar.', variant: 'destructive' });
    }
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
              const isPago = boleto.status === 'pago';
              const isCancelado = boleto.status === 'cancelado';
              const isExpanded = expandedId === boleto.id;
              const hasPaymentOptions = !isPago && !isCancelado;

              return (
                <Card
                  key={boleto.id}
                  className={`transition-all ${isPago ? 'opacity-70' : ''} ${isCancelado ? 'opacity-50' : ''}`}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Header: date + status */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Vencimento</p>
                          <p className="font-semibold">{formatDate(boleto.vencimento)}</p>
                        </div>
                      </div>
                      <StatusBadge status={boleto.status} />
                    </div>

                    {/* Value */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Valor</p>
                        <p className="text-xl font-bold text-primary">
                          {formatCurrency(boleto.valor)}
                        </p>
                      </div>
                      {isPago && boleto.data_pagamento && (
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Pago em</p>
                          <p className="text-sm font-medium flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {formatDate(boleto.data_pagamento)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Referência */}
                    {boleto.referencia && (
                      <p className="text-xs text-muted-foreground truncate">
                        Ref: {boleto.referencia}
                      </p>
                    )}

                    {/* Payment options for open billings */}
                    {hasPaymentOptions && (
                      <div className="space-y-2 pt-1">
                        {/* Expand/collapse payment methods */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setExpandedId(isExpanded ? null : boleto.id)}
                        >
                          {isExpanded ? 'Ocultar opções' : 'Opções de pagamento'}
                        </Button>

                        {isExpanded && (
                          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                            {/* PIX Copia e Cola */}
                            {boleto.pix_copy_paste && (
                              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <QrCode className="h-4 w-4 text-primary" />
                                  PIX Copia e Cola
                                </div>
                                <p className="text-xs text-muted-foreground break-all font-mono bg-background rounded p-2 max-h-20 overflow-y-auto">
                                  {boleto.pix_copy_paste}
                                </p>
                                <Button
                                  size="sm"
                                  className="w-full"
                                  onClick={() => copyToClipboard(boleto.pix_copy_paste!, 'Código PIX')}
                                >
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copiar código PIX
                                </Button>
                              </div>
                            )}

                            {/* Código de barras / Linha digitável */}
                            {boleto.linha_digitavel && (
                              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                  <Barcode className="h-4 w-4 text-primary" />
                                  Código de Barras
                                </div>
                                <p className="text-xs text-muted-foreground break-all font-mono bg-background rounded p-2">
                                  {boleto.linha_digitavel}
                                </p>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full"
                                  onClick={() => copyToClipboard(boleto.linha_digitavel!, 'Linha digitável')}
                                >
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copiar linha digitável
                                </Button>
                              </div>
                            )}

                            {/* Link do boleto */}
                            {boleto.link_boleto && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={() => window.open(boleto.link_boleto!, '_blank')}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Abrir boleto PDF
                              </Button>
                            )}

                            {/* No payment options available */}
                            {!boleto.pix_copy_paste && !boleto.linha_digitavel && !boleto.link_boleto && (
                              <p className="text-xs text-muted-foreground text-center py-2">
                                Nenhuma opção de pagamento disponível para esta fatura.
                              </p>
                            )}
                          </div>
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
