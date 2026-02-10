import React, { useState, useEffect, useCallback } from 'react';
import { Headphones, Loader2, CheckCircle, XCircle, RefreshCw, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type ChamadoStatus = 'idle' | 'loading' | 'success' | 'error';

interface Chamado {
  id: number;
  subject: string;
  message: string;
  status: string;
  status_code: string;
  priority: string;
  priority_code: string;
  created_at: string | null;
  updated_at: string | null;
  finalized_in: string | null;
  technical: string | null;
  called_type: string | null;
}

const statusStyles: Record<string, string> = {
  'Novo': 'bg-primary text-primary-foreground',
  'Aguardando Cliente': 'bg-warning text-warning-foreground',
  'Aguardando Resposta': 'bg-secondary text-secondary-foreground',
  'Finalizado': 'bg-success text-success-foreground',
};

const priorityStyles: Record<string, string> = {
  'Alta': 'bg-destructive text-destructive-foreground',
  'Média': 'bg-warning text-warning-foreground',
  'Baixa': 'bg-muted text-muted-foreground',
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

const ChamadoForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const { cliente } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<ChamadoStatus>('idle');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('B');
  const [errorMessage, setErrorMessage] = useState('');

  if (!cliente) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast({ title: 'Campos obrigatórios', description: 'Preencha o assunto e a descrição.', variant: 'destructive' });
      return;
    }
    if (subject.length > 255) {
      toast({ title: 'Assunto muito longo', description: 'Máximo 255 caracteres.', variant: 'destructive' });
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const { data, error } = await supabase.functions.invoke('mikweb-chamados', {
        body: { customer_id: cliente.id, subject: subject.trim(), message: message.trim(), priority },
      });
      if (error) throw error;
      if (data.success) {
        setStatus('success');
        toast({ title: 'Chamado aberto!', description: 'Seu chamado foi registrado com sucesso.' });
        onSuccess();
      } else {
        setStatus('error');
        setErrorMessage(data.error || 'Não foi possível abrir o chamado.');
      }
    } catch {
      setStatus('error');
      setErrorMessage('Erro ao conectar com o servidor.');
    }
  };

  const resetForm = () => {
    setStatus('idle');
    setSubject('');
    setMessage('');
    setPriority('B');
    setErrorMessage('');
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2 text-lg">
          <Headphones className="h-5 w-5" />
          Abrir Chamado Técnico
        </CardTitle>
        <CardDescription>Descreva o problema e nossa equipe irá analisar.</CardDescription>
      </CardHeader>
      <CardContent>
        {status === 'idle' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Assunto *</Label>
              <Input id="subject" placeholder="Ex: Internet lenta, Sem conexão..." value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={255} />
              <p className="text-xs text-muted-foreground text-right">{subject.length}/255</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="B">Baixa</SelectItem>
                  <SelectItem value="M">Média</SelectItem>
                  <SelectItem value="A">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Descrição detalhada *</Label>
              <Textarea id="message" placeholder="Descreva em detalhes o problema..." value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={2000} />
              <p className="text-xs text-muted-foreground text-right">{message.length}/2000</p>
            </div>
            <Button type="submit" className="w-full h-12 text-base">
              <Headphones className="h-5 w-5 mr-2" />
              Enviar Chamado
            </Button>
          </form>
        )}
        {status === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground">Enviando chamado...</p>
          </div>
        )}
        {status === 'success' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-success" />
            </div>
            <div>
              <p className="font-semibold text-success">Chamado aberto com sucesso!</p>
              <p className="text-sm text-muted-foreground mt-1">Nossa equipe irá analisar e entrar em contato.</p>
            </div>
            <Button variant="outline" onClick={resetForm}>Abrir novo chamado</Button>
          </div>
        )}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <p className="font-semibold text-destructive">Falha ao abrir chamado</p>
              <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetForm}>Voltar</Button>
              <Button onClick={handleSubmit}>Tentar novamente</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const ChamadosList: React.FC = () => {
  const { cliente } = useAuth();
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchChamados = useCallback(async () => {
    if (!cliente) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('mikweb-list-chamados', {
        body: { customer_id: cliente.id },
      });
      if (fnError) throw fnError;
      if (data.success) {
        setChamados(data.chamados || []);
      } else {
        setError(data.error || 'Erro ao carregar chamados.');
      }
    } catch {
      setError('Erro ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  }, [cliente]);

  useEffect(() => {
    fetchChamados();
  }, [fetchChamados]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchChamados}>
            <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (chamados.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8">
          <Headphones className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum chamado encontrado.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{chamados.length} chamado(s)</p>
        <Button variant="ghost" size="sm" onClick={fetchChamados}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      {chamados.map((chamado) => (
        <Card
          key={chamado.id}
          className="cursor-pointer transition-shadow hover:shadow-md"
          onClick={() => setExpandedId(expandedId === chamado.id ? null : chamado.id)}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-medium text-sm leading-tight flex-1">{chamado.subject}</h3>
              <Badge className={cn('text-[10px] shrink-0', statusStyles[chamado.status] || 'bg-muted text-muted-foreground')}>
                {chamado.status}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(chamado.created_at)}
              </span>
              <Badge variant="outline" className={cn('text-[10px]', priorityStyles[chamado.priority])}>
                {chamado.priority}
              </Badge>
            </div>
            {expandedId === chamado.id && (
              <div className="mt-3 pt-3 border-t border-border space-y-2 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Descrição</p>
                  <p className="text-foreground whitespace-pre-wrap">{chamado.message}</p>
                </div>
                {chamado.technical && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Técnico</p>
                    <p className="text-foreground">{chamado.technical}</p>
                  </div>
                )}
                {chamado.finalized_in && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Finalizado em</p>
                    <p className="text-foreground">{formatDate(chamado.finalized_in)}</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Última atualização: {formatDate(chamado.updated_at)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const Chamados: React.FC = () => {
  const [activeTab, setActiveTab] = useState('list');
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <AppLayout title="Chamados" showBack>
      <div className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="list">Meus Chamados</TabsTrigger>
            <TabsTrigger value="new">Novo Chamado</TabsTrigger>
          </TabsList>
          <TabsContent value="list">
            <ChamadosList key={refreshKey} />
          </TabsContent>
          <TabsContent value="new">
            <ChamadoForm onSuccess={() => { setRefreshKey(k => k + 1); setActiveTab('list'); }} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Chamados;
