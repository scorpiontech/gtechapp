import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertCircle, Receipt, Filter, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/AppLayout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BoletoCard } from '@/components/BoletoCard';
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
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [contratoFilter, setContratoFilter] = useState<string>('todos');

  // Build contract options from client data and boleto data
  const contratoOptions = useMemo(() => {
    const contratos = cliente?.contratos || [];
    // If client has contracts, use them
    if (contratos.length > 0) {
      return contratos.map((c) => ({
        id: c.id,
        label: c.plano_nome || `Contrato #${c.id}`,
      }));
    }
    // Fallback: extract unique contract IDs from boletos
    const ids = [...new Set(boletos.map((b) => b.contrato_id).filter(Boolean))] as number[];
    return ids.map((id) => ({ id, label: `Contrato #${id}` }));
  }, [cliente?.contratos, boletos]);

  const filteredBoletos = useMemo(() => {
    let result = boletos;
    if (contratoFilter !== 'todos') {
      const cid = Number(contratoFilter);
      result = result.filter((b) => b.contrato_id === cid);
    }
    if (statusFilter !== 'todos') {
      result = result.filter((b) => b.status === statusFilter);
    }
    return result;
  }, [boletos, statusFilter, contratoFilter]);

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
        {/* Filtro */}
        {!loading && !error && boletos.length > 0 && (
          <div className="flex flex-col gap-3">
            {/* Filtro por contrato */}
            {contratoOptions.length > 1 && (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <Select value={contratoFilter} onValueChange={setContratoFilter}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Filtrar contrato" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os contratos</SelectItem>
                    {contratoOptions.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Filtro por status */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Filtrar status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="aberto">Aberto</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              {(statusFilter !== 'todos' || contratoFilter !== 'todos') && (
                <span className="text-xs text-muted-foreground">
                  {filteredBoletos.length} de {boletos.length}
                </span>
              )}
            </div>
          </div>
        )}

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
                <p className="text-sm text-muted-foreground">Não há boletos disponíveis no momento.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && !error && boletos.length > 0 && (
          <div className="space-y-3">
            {filteredBoletos.length === 0 ? (
              <Card>
                <CardContent className="p-6 flex flex-col items-center gap-4 text-center">
                  <Receipt className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Nenhum boleto com status "{statusFilter}".
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredBoletos.map((boleto) => (
                <BoletoCard key={boleto.id} boleto={boleto} onCopy={copyToClipboard} />
              ))
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Boletos;
