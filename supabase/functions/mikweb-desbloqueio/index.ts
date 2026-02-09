import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_PER_MONTH = 1;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cliente_id, contrato_id } = await req.json();

    if (!cliente_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID do cliente é obrigatório' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const apiToken = Deno.env.get('MIKWEB_API_TOKEN');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!apiToken || !supabaseUrl || !supabaseKey) {
      console.error('Missing env vars');
      return new Response(
        JSON.stringify({ success: false, error: 'Configuração do servidor incompleta' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 0. Verificar limite de uso (máx 1 vez por mês)
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data: logs, error: logError } = await supabase
      .from('desbloqueio_logs')
      .select('id, created_at')
      .eq('cliente_id', cliente_id)
      .gte('created_at', firstOfMonth)
      .order('created_at', { ascending: false });

    if (logError) {
      console.error('Error checking logs:', logError);
    }

    const usageCount = logs?.length || 0;
    console.log(`Cliente ${cliente_id} - desbloqueios este mês: ${usageCount}`);

    if (usageCount >= MAX_PER_MONTH) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Você já utilizou o autodesbloqueio ${usageCount} vez(es) este mês. O limite é de ${MAX_PER_MONTH} vez por mês. Entre em contato com o suporte para mais informações.`,
          limit_reached: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeaders = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };

    // 1. Buscar todos os boletos do cliente
    let allBillings: any[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const response = await fetch(
        `https://api.mikweb.com.br/v1/admin/billings?customer_id=${cliente_id}&page=${page}&per_page=${perPage}`,
        { method: 'GET', headers: authHeaders }
      );

      if (!response.ok) {
        console.error('Error fetching billings:', response.status);
        break;
      }

      const data = await response.json();
      const pageBillings = data.billings || data.data || [];
      if (!Array.isArray(pageBillings) || pageBillings.length === 0) break;
      allBillings = allBillings.concat(pageBillings);
      if (pageBillings.length < perPage) break;
      page++;
      if (page > 20) break;
    }

    console.log(`Total billings fetched: ${allBillings.length}`);

    // Log sample billing structure for debugging
    if (allBillings.length > 0) {
      console.log('Sample billing fields:', Object.keys(allBillings[0]).join(', '));
      console.log('Sample billing:', JSON.stringify({
        id: allBillings[0].id,
        situation_id: allBillings[0].situation_id,
        situation_name: allBillings[0].situation_name,
        situation: allBillings[0].situation,
        due_day: allBillings[0].due_day,
        value: allBillings[0].value,
      }));
    }

    // 2. Encontrar boleto(s) vencido(s)
    const boletosVencidos = allBillings.filter((b: any) => {
      const sitName = (b.situation_name || b.situation?.name || '').toLowerCase().trim();
      return sitName === 'em atraso' || sitName === 'atrasado';
    });

    console.log(`Boletos vencidos encontrados: ${boletosVencidos.length}`);
    boletosVencidos.forEach((b: any) => {
      console.log(`Boleto vencido: id=${b.id}, value=${b.value}, due_day=${b.due_day}, situation_name=${b.situation_name || b.situation?.name}`);
    });

    if (boletosVencidos.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum boleto vencido encontrado para realizar o desbloqueio.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Data do dia seguinte
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const newDueDay = tomorrow.toISOString().split('T')[0];

    // 4. Atualizar SOMENTE os boletos vencidos (um por um)
    const updateResults: any[] = [];

    for (const boleto of boletosVencidos) {
      const boletoId = boleto.id;
      console.log(`Atualizando boleto ${boletoId} - valor: ${boleto.value}, vencimento: ${boleto.due_day}`);

      // Tentar primeiro com billing (endpoint padrão MikWeb)
      let updateResponse = await fetch(
        `https://api.mikweb.com.br/v1/admin/billings/${boletoId}`,
        {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({
            due_day: newDueDay,
            situation_id: 5,
          }),
        }
      );

      // Se 404, tentar endpoint alternativo
      if (updateResponse.status === 404) {
        console.log(`Boleto ${boletoId} not found on /billings/, trying PATCH...`);
        updateResponse = await fetch(
          `https://api.mikweb.com.br/v1/admin/billings/${boletoId}`,
          {
            method: 'PATCH',
            headers: authHeaders,
            body: JSON.stringify({
              due_day: newDueDay,
              situation_id: 5,
            }),
          }
        );
      }

      const updateText = await updateResponse.text();
      console.log(`Boleto ${boletoId} update: ${updateResponse.status} - ${updateText}`);

      updateResults.push({
        boleto_id: boletoId,
        success: updateResponse.ok,
        status: updateResponse.status,
      });
    }

    const allSuccess = updateResults.every((r) => r.success);

    if (!allSuccess) {
      console.warn('Some billing updates failed (proceeding with access unlock):', JSON.stringify(updateResults.filter((r) => !r.success)));
    }

    // 5. Liberar acesso via PUT no contrato do cliente
    // Primeiro, buscar o ID correto do contrato
    let actualContractId: number | null = null;

    // Tentar buscar contratos do cliente para encontrar o ID correto
    console.log(`Buscando contratos do cliente ${cliente_id}...`);
    const contractsResponse = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts?customer_id=${cliente_id}`,
      { method: 'GET', headers: authHeaders }
    );

    if (contractsResponse.ok) {
      const contractsData = await contractsResponse.json();
      const contracts = contractsData.customer_contracts || contractsData.contracts || contractsData.data || [];
      if (Array.isArray(contracts) && contracts.length > 0) {
        // Usar o primeiro contrato ativo
        const activeContract = contracts.find((c: any) => c.status === 'active') || contracts[0];
        actualContractId = activeContract.id;
        console.log(`Contrato encontrado: id=${actualContractId}, status=${activeContract.status}, access_status=${activeContract.access_status}`);
      }
    } else {
      console.error('Erro ao buscar contratos:', contractsResponse.status);
    }

    // Fallback: usar o contrato_id enviado pelo frontend
    if (!actualContractId && contrato_id) {
      actualContractId = contrato_id;
      console.log(`Usando contrato_id do frontend: ${actualContractId}`);
    }

    if (!actualContractId) {
      console.error('Nenhum contrato encontrado para o cliente');
      return new Response(
        JSON.stringify({ success: false, error: 'Não foi possível encontrar o contrato do cliente. Entre em contato com o suporte.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar dados completos do contrato para enviar junto com a atualização
    console.log(`Buscando dados completos do contrato ${actualContractId}...`);
    const contractDetailResponse = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts/${actualContractId}`,
      { method: 'GET', headers: authHeaders }
    );

    let contractUpdateBody: any = { access_status: 'access_activated' };

    if (contractDetailResponse.ok) {
      const contractDetail = await contractDetailResponse.json();
      const contract = contractDetail.customer_contract || contractDetail;
      console.log(`Contrato detalhes obtidos, campos: ${Object.keys(contract).join(', ')}`);

      // Incluir campos obrigatórios que a API exige no PUT
      contractUpdateBody = {
        access_status: 'access_activated',
        financial_options_status: contract.financial_options_status || 'default',
        discount_enabled: contract.discount_enabled ?? false,
        addition_enabled: contract.addition_enabled ?? false,
        billing_address_zip_code: contract.billing_address_zip_code || contract.customer?.zip_code || '',
        billing_address_street: contract.billing_address_street || contract.customer?.street || '',
        billing_address_number: contract.billing_address_number || contract.customer?.number || '',
        billing_address_complement: contract.billing_address_complement || contract.customer?.complement || '',
        billing_address_neighborhood: contract.billing_address_neighborhood || contract.customer?.neighborhood || '',
        billing_address_city: contract.billing_address_city || contract.customer?.city || '',
        billing_address_state: contract.billing_address_state || contract.customer?.state || '',
      };
    } else {
      console.warn(`Não foi possível buscar detalhes do contrato: ${contractDetailResponse.status}`);
      // Buscar dados do cliente para preencher endereço
      const customerResponse = await fetch(
        `https://api.mikweb.com.br/v1/admin/customers/${cliente_id}`,
        { method: 'GET', headers: authHeaders }
      );
      if (customerResponse.ok) {
        const customerData = await customerResponse.json();
        const cust = customerData.customer || customerData;
        contractUpdateBody = {
          access_status: 'access_activated',
          financial_options_status: 'default',
          discount_enabled: false,
          addition_enabled: false,
          billing_address_zip_code: cust.zip_code || '',
          billing_address_street: cust.street || '',
          billing_address_number: cust.number || '',
          billing_address_complement: cust.complement || '',
          billing_address_neighborhood: cust.neighborhood || '',
          billing_address_city: cust.city || '',
          billing_address_state: cust.state || '',
        };
      }
    }

    console.log(`Liberando acesso: PUT /customer_contracts/${actualContractId}`, JSON.stringify(contractUpdateBody));
    const desbloqueioResponse = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts/${actualContractId}`,
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(contractUpdateBody),
      }
    );

    const desbloqueioText = await desbloqueioResponse.text();
    console.log(`Resposta desbloqueio contrato: ${desbloqueioResponse.status} - ${desbloqueioText}`);

    if (!desbloqueioResponse.ok) {
      console.error('MikWeb desbloqueio contrato error:', desbloqueioResponse.status, desbloqueioText);
      return new Response(
        JSON.stringify({ success: false, error: 'Não foi possível liberar o acesso. Entre em contato com o suporte. Erro: ' + desbloqueioResponse.status }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Acesso liberado com sucesso');

    // 6. Registrar o uso do desbloqueio
    const { error: insertError } = await supabase
      .from('desbloqueio_logs')
      .insert({ cliente_id: Number(cliente_id) });

    if (insertError) {
      console.error('Error logging desbloqueio:', insertError);
      // Não bloqueia o sucesso - apenas loga o erro
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Desbloqueio realizado com sucesso! ${boletosVencidos.length} boleto(s) atualizado(s) com vencimento para ${newDueDay}. Aguarde alguns instantes para que a conexão seja restabelecida.`,
        boletos_atualizados: updateResults.length,
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
