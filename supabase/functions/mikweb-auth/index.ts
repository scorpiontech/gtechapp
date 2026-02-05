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
        JSON.stringify({ success: false, error: 'CPF/CNPJ é obrigatório' }),
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

    const authHeaders = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };

    console.log('Token length:', apiToken.length);
    
    // Buscar cliente na API MikWeb usando o parâmetro search
    const cpfLimpo = cpf.replace(/\D/g, '');
    // A API MikWeb usa 'search' para filtrar clientes, não 'cpf_cnpj'
    const url = `https://api.mikweb.com.br/v1/admin/customers?search=${cpfLimpo}`;
    console.log('Fetching customers URL:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: authHeaders,
    });

    const responseText = await response.text();
    console.log('MikWeb API response status:', response.status);

    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao consultar dados', details: responseText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const data = JSON.parse(responseText);
    const clientes = data.customers || data.data || [];
    
    console.log('Total customers returned:', clientes.length);
    if (clientes.length > 0) {
      console.log('First customer CPF:', clientes[0].cpf_cnpj);
      console.log('Looking for CPF:', cpfLimpo);
      // Log available fields for debugging
      console.log('Customer fields:', Object.keys(clientes[0]).join(', '));
    }
    
    if (!Array.isArray(clientes) || clientes.length === 0) {
      console.log('No customers found in API response');
      return new Response(
        JSON.stringify({ success: false, error: 'CPF/CNPJ não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Filtrar pelo CPF/CNPJ exato
    const clienteEncontrado = clientes.find((c: any) => {
      const cpfCliente = (c.cpf_cnpj || '').replace(/\D/g, '');
      return cpfCliente === cpfLimpo;
    });

    if (!clienteEncontrado) {
      return new Response(
        JSON.stringify({ success: false, error: 'CPF/CNPJ não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // A busca por search retorna dados limitados, precisamos buscar o cliente por ID para obter todos os dados
    const clienteId = clienteEncontrado.id;
    console.log('Found customer ID:', clienteId);
    console.log('Fetching full customer details...');
    
    const detailsUrl = `https://api.mikweb.com.br/v1/admin/customers/${clienteId}`;
    const detailsResponse = await fetch(detailsUrl, {
      method: 'GET',
      headers: authHeaders,
    });
    
    if (!detailsResponse.ok) {
      console.log('Customer details fetch failed:', detailsResponse.status);
      // Fallback para usar os dados da busca inicial se não conseguir buscar detalhes
      const cliente = clienteEncontrado;
      return new Response(
        JSON.stringify({ 
          success: true, 
          cliente: {
            id: cliente.id,
            nome: cliente.full_name,
            cpf_cnpj: cliente.cpf_cnpj,
            email: cliente.email,
            celular: cliente.cell_phone_number_1,
            telefone: cliente.phone_number,
            endereco: cliente.street,
            numero: cliente.number,
            bairro: cliente.neighborhood,
            cidade: cliente.city,
            estado: cliente.state,
            cep: cliente.zip_code,
            status: cliente.status,
            data_cadastro: cliente.customer_since,
            login: cliente.login,
            plano: cliente.plan_id,
            plano_nome: null,
            valor_plano: null,
            vencimento: cliente.due_day,
            bloqueado: cliente.financial_status === 'B' || cliente.status === 'Bloqueado',
            servidor: cliente.server?.name,
            contrato_id: cliente.customer_contract_ids?.[0] || null,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const detailsData = await detailsResponse.json();
    const cliente = detailsData.customer || detailsData;
    
    console.log('Customer details loaded');
    console.log('Plan object:', cliente.plan ? JSON.stringify(cliente.plan) : 'null');
    console.log('Due day:', cliente.due_day);

    // Verificar status financeiro para determinar se está bloqueado
    const isBloqueado = cliente.financial_status === 'B' || cliente.status === 'Bloqueado';

    // Extrair dados do plano do objeto plan retornado pela API
    const planoNome = cliente.plan?.name || null;
    const valorPlano = cliente.plan?.value ? parseFloat(cliente.plan.value) : null;
    const vencimento = cliente.due_day || null;
    
    console.log('Extracted plano_nome:', planoNome);
    console.log('Extracted valor_plano:', valorPlano);
    console.log('Extracted vencimento:', vencimento);

    return new Response(
      JSON.stringify({ 
        success: true, 
        cliente: {
          id: cliente.id,
          nome: cliente.full_name,
          cpf_cnpj: cliente.cpf_cnpj,
          email: cliente.email,
          celular: cliente.cell_phone_number_1,
          telefone: cliente.phone_number,
          endereco: cliente.street,
          numero: cliente.number,
          bairro: cliente.neighborhood,
          cidade: cliente.city,
          estado: cliente.state,
          cep: cliente.zip_code,
          status: cliente.status,
          data_cadastro: cliente.customer_since,
          login: cliente.login,
          plano: cliente.plan?.id || cliente.plan_id,
          plano_nome: planoNome,
          valor_plano: valorPlano,
          vencimento: vencimento,
          bloqueado: isBloqueado,
          servidor: cliente.server?.name,
          contrato_id: cliente.customer_contract_ids?.[0] || null,
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
