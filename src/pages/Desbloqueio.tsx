import React, { useState } from 'react';
import { Unlock, Loader2, CheckCircle, XCircle, AlertTriangle, Wifi } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

type DesbloqueioStatus = 'idle' | 'loading' | 'success' | 'error';

const Desbloqueio: React.FC = () => {
  const { cliente } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<DesbloqueioStatus>('idle');
  const [message, setMessage] = useState('');
  const [contratoInfo, setContratoInfo] = useState<{ id?: number; plano?: string } | null>(null);

  if (!cliente) return null;

  const accessStatus = (cliente?.access_status || '').toLowerCase();
  const isBloqueado = accessStatus === 'b' || accessStatus === 'access_blocked' || accessStatus === 'access_pending' || cliente?.bloqueado === true;

  const statusLabel = (() => {
    switch (accessStatus) {
      case 'l':
      case 'access_activated': return 'Conexão liberada';
      case 'b':
      case 'access_blocked': return 'Conexão bloqueada';
      case 'ca':
      case 'access_pending': return 'Bloqueio parcial';
      case 'cm': return 'Bloqueio total';
      default: return cliente?.bloqueado ? 'Conexão bloqueada' : 'Conexão ativa';
    }
  })();

  const handleDesbloqueio = async () => {
    setStatus('loading');
    setMessage('');

    try {
      let authToken = localStorage.getItem('gtech_auth_token');

      // Se não há token (ex: sessão criada antes da atualização), renovar via mikweb-auth
      if (!authToken && cliente?.cpf_cnpj) {
        try {
          const cpf = String(cliente.cpf_cnpj).replace(/\D/g, '');
          const { data: authData } = await supabase.functions.invoke('mikweb-auth', { body: { cpf } });
          if (authData?.success && authData?.auth_token) {
            authToken = authData.auth_token;
            localStorage.setItem('gtech_auth_token', authData.auth_token);
            if (authData.cliente) localStorage.setItem('gtech_cliente', JSON.stringify(authData.cliente));
          }
        } catch (e) {
          console.warn('Falha ao renovar token:', e);
        }
      }

      const { data, error } = await supabase.functions.invoke('mikweb-desbloqueio', {
        body: { cliente_id: cliente.id, contrato_id: (cliente as any).contrato_id || null, auth_token: authToken },
      });

      // Edge function pode retornar erro com payload (ex: 401). Priorizar data.error.
      if (data && data.success === false) {
        setStatus('error');
        setMessage(data.error || 'Não foi possível realizar o desbloqueio.');
        toast({ title: 'Erro', description: data.error || 'Falha ao desbloquear.', variant: 'destructive' });
        return;
      }

      if (error) throw error;

      if (data.success) {
        setStatus('success');
        setMessage(data.message || 'Desbloqueio realizado com sucesso!');
        setContratoInfo({ id: data.contrato_id, plano: data.contrato_plano });
        toast({
          title: 'Sucesso!',
          description: 'Sua conexão foi desbloqueada.',
        });
      } else {
        setStatus('error');
        setMessage(data.error || 'Não foi possível realizar o desbloqueio.');
        toast({
          title: 'Erro',
          description: data.error || 'Falha ao desbloquear.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      setStatus('error');
      setMessage('Erro ao conectar com o servidor.');
      toast({
        title: 'Erro',
        description: 'Erro de conexão. Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const resetStatus = () => {
    setStatus('idle');
    setMessage('');
    setContratoInfo(null);
  };

  return (
    <AppLayout title="Autodesbloqueio" showBack>
      <div className="p-4 space-y-4">
        {/* Status atual */}
        <Card className={isBloqueado ? 'border-destructive/50 bg-destructive/5' : 'border-success/50 bg-success/5'}>
          <CardContent className="p-4 flex items-center gap-4">
            <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
              isBloqueado ? 'bg-destructive/10' : 'bg-success/10'
            }`}>
              <Wifi className={`h-6 w-6 ${isBloqueado ? 'text-destructive' : 'text-success'}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status atual</p>
              <p className={`font-semibold ${isBloqueado ? 'text-destructive' : 'text-success'}`}>
                {statusLabel}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Card principal de desbloqueio */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Unlock className="h-5 w-5" />
              Autodesbloqueio
            </CardTitle>
            <CardDescription>
              Ao solicitar o desbloqueio, o boleto vencido será ajustado para o dia seguinte e sua conexão será liberada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {status === 'idle' && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="w-full h-12 text-base">
                    <Unlock className="h-5 w-5 mr-2" />
                    Solicitar Desbloqueio
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Autodesbloqueio</AlertDialogTitle>
                    <AlertDialogDescription>
                      Ao confirmar, o boleto vencido terá seu vencimento alterado para amanhã e a situação será ajustada para "em observação". Sua conexão será liberada automaticamente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDesbloqueio}>
                      Confirmar Desbloqueio
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {status === 'loading' && (
              <div className="flex flex-col items-center gap-4 py-6">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground">Processando desbloqueio...</p>
              </div>
            )}

            {status === 'success' && (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-success" />
                </div>
                <div>
                  <p className="font-semibold text-success">Desbloqueio realizado!</p>
                  <p className="text-sm text-muted-foreground mt-1">{message}</p>
                  {contratoInfo?.id && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Contrato #{contratoInfo.id}{contratoInfo.plano ? ` — ${contratoInfo.plano}` : ''}
                    </p>
                  )}
                </div>
                <Button variant="outline" onClick={resetStatus}>
                  Voltar
                </Button>
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                  <XCircle className="h-8 w-8 text-destructive" />
                </div>
                <div>
                  <p className="font-semibold text-destructive">Falha no desbloqueio</p>
                  <p className="text-sm text-muted-foreground mt-1">{message}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={resetStatus}>
                    Voltar
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button>Tentar novamente</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Autodesbloqueio</AlertDialogTitle>
                        <AlertDialogDescription>
                          Ao confirmar, o boleto vencido terá seu vencimento alterado para amanhã e a situação será ajustada para "em observação". Sua conexão será liberada automaticamente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDesbloqueio}>
                          Confirmar Desbloqueio
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Aviso importante */}
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-warning-foreground">Importante</p>
              <p className="text-muted-foreground mt-1">
                O autodesbloqueio é temporário. O boleto vencido será ajustado com vencimento para o dia seguinte. 
                Caso não seja pago, a conexão poderá ser bloqueada novamente.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Desbloqueio;
