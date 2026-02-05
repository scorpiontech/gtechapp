import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Receipt, Unlock, Wifi, Calendar, CreditCard } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';

const Dashboard: React.FC = () => {
  const { cliente } = useAuth();
  const navigate = useNavigate();

  if (!cliente) {
    return null;
  }

  const quickActions = [
    {
      icon: FileText,
      label: 'Meu Contrato',
      description: 'Consultar detalhes',
      to: '/contrato',
      color: 'text-primary',
    },
    {
      icon: Receipt,
      label: '2ª Via Boleto',
      description: 'Emitir boletos',
      to: '/boletos',
      color: 'text-primary',
    },
    {
      icon: Unlock,
      label: 'Desbloqueio',
      description: 'Liberar conexão',
      to: '/desbloqueio',
      color: 'text-primary',
    },
  ];

  return (
    <AppLayout>
      <div className="p-4 space-y-6">
        {/* Greeting Card */}
        <Card className="bg-primary text-primary-foreground overflow-hidden">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <p className="text-primary-foreground/80 text-sm">Olá,</p>
                <h2 className="text-xl font-bold truncate max-w-[200px]">
                  {cliente.nome.split(' ')[0]}
                </h2>
              </div>
              <StatusBadge 
                status={cliente.bloqueado ? 'bloqueado' : 'ativo'} 
                className={cliente.bloqueado ? '' : 'bg-primary-foreground/20 text-primary-foreground'}
              />
            </div>
          </CardContent>
        </Card>

        {/* Info Cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center">
                <Wifi className="h-5 w-5 text-accent-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Plano</p>
                <p className="font-semibold text-sm truncate">{cliente.plano_nome || cliente.plano || 'Não informado'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-accent-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Valor</p>
                <p className="font-semibold text-sm">
                  {cliente.valor_plano 
                    ? new Intl.NumberFormat('pt-BR', { 
                        style: 'currency', 
                        currency: 'BRL' 
                      }).format(cliente.valor_plano)
                    : 'Não informado'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-2">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center">
                <Calendar className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Vencimento</p>
                <p className="font-semibold text-sm">{cliente.vencimento ? `Todo dia ${cliente.vencimento}` : 'Não informado'}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">Acesso rápido</h3>
          <div className="space-y-2">
            {quickActions.map((action) => (
              <Card
                key={action.to}
                className="cursor-pointer hover:bg-accent/50 transition-colors active:scale-[0.98]"
                onClick={() => navigate(action.to)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-accent flex items-center justify-center shrink-0">
                    <action.icon className={`h-6 w-6 ${action.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{action.label}</p>
                    <p className="text-sm text-muted-foreground">{action.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
