// Tipos para integração com API MikWeb

export interface MikWebCliente {
  id: number;
  nome: string;
  cpf_cnpj: string;
  email: string;
  celular: string;
  telefone: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  status: string;
  data_cadastro: string;
  data_ativacao: string;
  login: string;
  plano: string;
  plano_nome: string;
  valor_plano: number;
  vencimento: number;
  bloqueado: boolean;
  conexao_id?: number;
  conexao_login?: string;
}

export interface MikWebContrato {
  id: number;
  cliente_id: number;
  plano_id: number;
  plano_nome: string;
  valor: number;
  vencimento: number;
  data_inicio: string;
  data_fim?: string;
  status: string;
  velocidade_download: string;
  velocidade_upload: string;
}

export interface MikWebBoleto {
  id: number;
  cliente_id: number;
  valor: number;
  valor_pago?: number | null;
  vencimento: string;
  data_pagamento?: string | null;
  data_emissao: string;
  status: string;
  situation_id?: number;
  referencia?: string | null;
  linha_digitavel?: string | null;
  codigo_barras?: string | null;
  link_boleto?: string | null;
  nosso_numero?: string | null;
  pix_qr_code?: string | null;
  pix_copy_paste?: string | null;
}

export interface MikWebConexao {
  id: number;
  cliente_id: number;
  login: string;
  senha?: string;
  ip?: string;
  mac?: string;
  status: string;
  bloqueado: boolean;
  motivo_bloqueio?: string;
  online: boolean;
}

export interface AuthState {
  isAuthenticated: boolean;
  cliente: MikWebCliente | null;
  loading: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
