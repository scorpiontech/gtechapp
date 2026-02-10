import React, { useState } from 'react';
import { Headphones, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type ChamadoStatus = 'idle' | 'loading' | 'success' | 'error';

const Chamados: React.FC = () => {
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
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha o assunto e a descrição do chamado.',
        variant: 'destructive',
      });
      return;
    }

    if (subject.length > 255) {
      toast({
        title: 'Assunto muito longo',
        description: 'O assunto deve ter no máximo 255 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    try {
      const { data, error } = await supabase.functions.invoke('mikweb-chamados', {
        body: {
          customer_id: cliente.id,
          subject: subject.trim(),
          message: message.trim(),
          priority,
        },
      });

      if (error) throw error;

      if (data.success) {
        setStatus('success');
        toast({
          title: 'Chamado aberto!',
          description: 'Seu chamado técnico foi registrado com sucesso.',
        });
      } else {
        setStatus('error');
        setErrorMessage(data.error || 'Não foi possível abrir o chamado.');
        toast({
          title: 'Erro',
          description: data.error || 'Falha ao abrir chamado.',
          variant: 'destructive',
        });
      }
    } catch {
      setStatus('error');
      setErrorMessage('Erro ao conectar com o servidor.');
      toast({
        title: 'Erro',
        description: 'Erro de conexão. Tente novamente.',
        variant: 'destructive',
      });
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
    <AppLayout title="Chamados" showBack>
      <div className="p-4 space-y-4">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Headphones className="h-5 w-5" />
              Abrir Chamado Técnico
            </CardTitle>
            <CardDescription>
              Descreva o problema que você está enfrentando e nossa equipe técnica irá analisar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status === 'idle' && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="subject">Assunto *</Label>
                  <Input
                    id="subject"
                    placeholder="Ex: Internet lenta, Sem conexão..."
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={255}
                  />
                  <p className="text-xs text-muted-foreground text-right">{subject.length}/255</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Prioridade</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="B">Baixa</SelectItem>
                      <SelectItem value="M">Média</SelectItem>
                      <SelectItem value="A">Alta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Descrição detalhada *</Label>
                  <Textarea
                    id="message"
                    placeholder="Descreva em detalhes o problema que está enfrentando..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    maxLength={2000}
                  />
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
                  <p className="text-sm text-muted-foreground mt-1">
                    Nossa equipe técnica irá analisar e entrar em contato.
                  </p>
                </div>
                <Button variant="outline" onClick={resetForm}>
                  Abrir novo chamado
                </Button>
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
                  <Button variant="outline" onClick={resetForm}>
                    Voltar
                  </Button>
                  <Button onClick={handleSubmit}>Tentar novamente</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Chamados;
