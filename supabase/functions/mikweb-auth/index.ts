import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cpf } = await req.json();

    if (!cpf) {
      return new Response(
        JSON.stringify({ success: false, error: 'CPF é obrigatório' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const apiToken = Deno.env.get('MIKWEB_API_TOKEN');
    if (!apiToken) {
      console.error('MIKWEB_API_TOKEN not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Configuração do servidor incompleta' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Buscar cliente na API MikWeb filtrando por CPF
    const response = await fetch(`https://api.mikweb.com.br/v1/admin/clientes?cpf_cnpj=${cpf}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('MikWeb API error:', response.status, await response.text());
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao consultar dados' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const data = await response.json();

    // A API retorna um array de clientes
    const clientes = data.clientes || data.data || data;
    
    if (!Array.isArray(clientes) || clientes.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'CPF não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Pegar o primeiro cliente encontrado
    const cliente = clientes[0];

    return new Response(
      JSON.stringify({ 
        success: true, 
        cliente: {
          id: cliente.id,
          nome: cliente.nome,
          cpf_cnpj: cliente.cpf_cnpj,
          email: cliente.email,
          celular: cliente.celular,
          telefone: cliente.telefone,
          endereco: cliente.endereco,
          numero: cliente.numero,
          bairro: cliente.bairro,
          cidade: cliente.cidade,
          estado: cliente.estado,
          cep: cliente.cep,
          status: cliente.status,
          data_cadastro: cliente.data_cadastro,
          data_ativacao: cliente.data_ativacao,
          login: cliente.login,
          plano: cliente.plano,
          plano_nome: cliente.plano_nome,
          valor_plano: cliente.valor_plano,
          vencimento: cliente.vencimento,
          bloqueado: cliente.bloqueado === true || cliente.bloqueado === 1 || cliente.status === 'Bloqueado',
          conexao_id: cliente.conexao_id,
          conexao_login: cliente.conexao_login,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
