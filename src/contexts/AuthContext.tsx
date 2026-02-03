import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { MikWebCliente, AuthState } from '@/types/mikweb';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType extends AuthState {
  login: (cpf: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    cliente: null,
    loading: true,
  });

  // Verificar se há sessão salva ao iniciar
  useEffect(() => {
    const savedCliente = localStorage.getItem('gtech_cliente');
    if (savedCliente) {
      try {
        const cliente = JSON.parse(savedCliente);
        setState({
          isAuthenticated: true,
          cliente,
          loading: false,
        });
      } catch {
        localStorage.removeItem('gtech_cliente');
        setState(prev => ({ ...prev, loading: false }));
      }
    } else {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  const login = useCallback(async (cpf: string): Promise<{ success: boolean; error?: string }> => {
    setState(prev => ({ ...prev, loading: true }));
    
    try {
      const { data, error } = await supabase.functions.invoke('mikweb-auth', {
        body: { cpf: cpf.replace(/\D/g, '') },
      });

      if (error) {
        setState(prev => ({ ...prev, loading: false }));
        return { success: false, error: 'Erro ao conectar com o servidor' };
      }

      if (!data.success) {
        setState(prev => ({ ...prev, loading: false }));
        return { success: false, error: data.error || 'CPF não encontrado' };
      }

      const cliente = data.cliente;
      localStorage.setItem('gtech_cliente', JSON.stringify(cliente));
      
      setState({
        isAuthenticated: true,
        cliente,
        loading: false,
      });

      return { success: true };
    } catch (err) {
      setState(prev => ({ ...prev, loading: false }));
      return { success: false, error: 'Erro de conexão' };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('gtech_cliente');
    setState({
      isAuthenticated: false,
      cliente: null,
      loading: false,
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
