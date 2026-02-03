import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StatusType = 'ativo' | 'bloqueado' | 'pendente' | 'pago' | 'vencido' | 'aberto';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  ativo: { label: 'Ativo', className: 'bg-success text-success-foreground' },
  bloqueado: { label: 'Bloqueado', className: 'bg-destructive text-destructive-foreground' },
  pendente: { label: 'Pendente', className: 'bg-warning text-warning-foreground' },
  pago: { label: 'Pago', className: 'bg-success text-success-foreground' },
  vencido: { label: 'Vencido', className: 'bg-destructive text-destructive-foreground' },
  aberto: { label: 'Aberto', className: 'bg-primary text-primary-foreground' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  const normalizedStatus = status.toLowerCase() as StatusType;
  const config = statusConfig[normalizedStatus] || { 
    label: status, 
    className: 'bg-muted text-muted-foreground' 
  };

  return (
    <Badge className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
};
