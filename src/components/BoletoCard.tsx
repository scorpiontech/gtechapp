import React, { useState } from 'react';
import {
  Copy, ExternalLink, Calendar, QrCode, Barcode,
  CheckCircle2, AlertTriangle, Clock, Ban, CircleDollarSign,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/StatusBadge';
import { MikWebBoleto } from '@/types/mikweb';

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

type StatusKey = 'pago' | 'vencido' | 'aberto' | 'cancelado';

const statusVisual: Record<StatusKey, {
  icon: React.ElementType;
  border: string;
  bg: string;
  accent: string;
}> = {
  pago: {
    icon: CheckCircle2,
    border: 'border-l-4 border-l-success',
    bg: 'bg-success/5',
    accent: 'text-success',
  },
  vencido: {
    icon: AlertTriangle,
    border: 'border-l-4 border-l-destructive',
    bg: 'bg-destructive/5',
    accent: 'text-destructive',
  },
  aberto: {
    icon: Clock,
    border: 'border-l-4 border-l-primary',
    bg: 'bg-primary/5',
    accent: 'text-primary',
  },
  cancelado: {
    icon: Ban,
    border: 'border-l-4 border-l-muted-foreground',
    bg: 'bg-muted/30',
    accent: 'text-muted-foreground',
  },
};

const defaultVisual = {
  icon: CircleDollarSign,
  border: 'border-l-4 border-l-border',
  bg: '',
  accent: 'text-muted-foreground',
};

interface BoletoCardProps {
  boleto: MikWebBoleto;
  onCopy: (text: string, label: string) => void;
}

export const BoletoCard: React.FC<BoletoCardProps> = ({ boleto, onCopy }) => {
  const [expanded, setExpanded] = useState(false);

  const status = boleto.status as StatusKey;
  const visual = statusVisual[status] || defaultVisual;
  const StatusIcon = visual.icon;
  const isPago = status === 'pago';
  const isCancelado = status === 'cancelado';
  const hasPaymentOptions = !isPago && !isCancelado;

  return (
    <Card className={`transition-all overflow-hidden ${visual.border} ${isCancelado ? 'opacity-50' : ''}`}>
      <CardContent className={`p-4 space-y-3 ${visual.bg}`}>
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-full p-2 bg-background shadow-sm ${visual.accent}`}>
              <StatusIcon className="h-5 w-5" />
            </div>
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
            <p className={`text-xl font-bold ${visual.accent}`}>
              {formatCurrency(boleto.valor)}
            </p>
          </div>
          {isPago && boleto.data_pagamento && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Pago em</p>
              <p className="text-sm font-medium flex items-center gap-1 text-success">
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

        {/* Payment options */}
        {hasPaymentOptions && (
          <div className="space-y-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Ocultar opções' : 'Opções de pagamento'}
            </Button>

            {expanded && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                {boleto.pix_copy_paste && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <QrCode className="h-4 w-4 text-primary" />
                      PIX Copia e Cola
                    </div>
                    <p className="text-xs text-muted-foreground break-all font-mono bg-background rounded p-2 max-h-20 overflow-y-auto">
                      {boleto.pix_copy_paste}
                    </p>
                    <Button size="sm" className="w-full" onClick={() => onCopy(boleto.pix_copy_paste!, 'Código PIX')}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar código PIX
                    </Button>
                  </div>
                )}

                {boleto.linha_digitavel && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Barcode className="h-4 w-4 text-primary" />
                      Código de Barras
                    </div>
                    <p className="text-xs text-muted-foreground break-all font-mono bg-background rounded p-2">
                      {boleto.linha_digitavel}
                    </p>
                    <Button variant="outline" size="sm" className="w-full" onClick={() => onCopy(boleto.linha_digitavel!, 'Linha digitável')}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar linha digitável
                    </Button>
                  </div>
                )}

                {boleto.link_boleto && (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => window.open(boleto.link_boleto!, '_blank')}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir boleto PDF
                  </Button>
                )}

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
};
