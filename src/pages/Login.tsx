import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { CPFInput } from '@/components/CPFInput';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import gtechLogo from '@/assets/gtech-logo.png';

const Login: React.FC = () => {
  const [cpf, setCpf] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const docDigits = cpf.replace(/\D/g, '');
  const isValidDoc = docDigits.length === 11 || docDigits.length === 14;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isValidDoc) {
      toast({
        title: 'Documento inválido',
        description: 'Digite um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    const result = await login(cpf);
    setIsSubmitting(false);

    if (result.success) {
      toast({
        title: 'Bem-vindo!',
        description: 'Login realizado com sucesso.',
      });
      navigate('/dashboard');
    } else {
      toast({
        title: 'Erro no login',
        description: result.error || 'CPF não encontrado em nossa base.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center space-y-4">
          <img 
            src={gtechLogo} 
            alt="GTech" 
            className="h-20 w-auto"
          />
          <p className="text-muted-foreground text-center">
            Área do Cliente
          </p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-center">Entrar</CardTitle>
            <CardDescription className="text-center">
              Digite seu CPF para acessar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF ou CNPJ</Label>
                <CPFInput
                  value={cpf}
                  onChange={setCpf}
                  disabled={isSubmitting}
                  className="h-12 text-lg"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base font-semibold"
                disabled={!isValidDoc || isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verificando...
                  </>
                ) : (
                  'Acessar'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground">
          Problemas para acessar? Entre em contato com nosso suporte.
        </p>
      </div>
    </div>
  );
};

export default Login;
