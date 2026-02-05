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

    const cliente = clienteEncontrado;

    // Log plan_id and due_day from customer
    console.log('Customer plan_id:', cliente.plan_id);
    console.log('Customer due_day:', cliente.due_day);

    // Buscar dados do plano se existir plan_id
    let planoData: any = null;
    if (cliente.plan_id) {
      try {
        const planUrl = `https://api.mikweb.com.br/v1/admin/plans/${cliente.plan_id}`;
        console.log('Fetching plan:', cliente.plan_id);
        const planResponse = await fetch(planUrl, {
          method: 'GET',
          headers: authHeaders,
        });
        
        if (planResponse.ok) {
          const planText = await planResponse.text();
          console.log('Plan response:', planText.substring(0, 300));
          const planJson = JSON.parse(planText);
          planoData = planJson.plan || planJson.data || planJson;
        } else {
          console.log('Plan fetch failed:', planResponse.status);
        }
      } catch (err) {
        console.error('Error fetching plan:', err);
      }
    }

    // Buscar dados do contrato se existir
    let contratoData: any = null;
    const contractIds = cliente.customer_contract_ids || [];
    
    if (contractIds.length > 0) {
      const contractId = contractIds[0];
      console.log('Fetching contract:', contractId);
      
      try {
        const contractUrl = `https://api.mikweb.com.br/v1/admin/customer_contracts/${contractId}`;
        const contractResponse = await fetch(contractUrl, {
          method: 'GET',
          headers: authHeaders,
        });
        
        if (contractResponse.ok) {
          const contractText = await contractResponse.text();
          console.log('Contract response:', contractText.substring(0, 300));
          const contractJson = JSON.parse(contractText);
          contratoData = contractJson.customer_contract || contractJson.data || contractJson;
        } else {
          console.log('Contract fetch failed:', contractResponse.status);
        }
      } catch (err) {
        console.error('Error fetching contract:', err);
      }
    }

    // Verificar status financeiro para determinar se está bloqueado
    const isBloqueado = cliente.financial_status === 'B' || cliente.status === 'Bloqueado';

    // Extrair dados do plano - priorizar contrato, depois plano direto, depois cliente
    const planoNome = contratoData?.plan?.name || planoData?.name || cliente.plan?.name || null;
    const valorPlano = contratoData?.plan?.value || contratoData?.value || planoData?.value || cliente.plan?.value || null;
    const vencimento = contratoData?.due_day || cliente.due_day || null;

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
          plano: contratoData?.plan?.id || cliente.plan?.id,
          plano_nome: planoNome,
          valor_plano: valorPlano,
          vencimento: vencimento,
          bloqueado: isBloqueado,
          servidor: cliente.server?.name,
          contrato_id: contractIds[0] || null,
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
