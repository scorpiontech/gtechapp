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

    // 1. Buscar o contrato do cliente
    console.log(`Buscando contratos do cliente ${cliente_id}...`);
    const contractsResponse = await fetch(
      `https://api.mikweb.com.br/v1/admin/customer_contracts?customer_id=${cliente_id}`,
      { method: 'GET', headers: authHeaders }
    );

    if (!contractsResponse.ok) {
      console.error('Erro ao buscar contratos:', contractsResponse.status);
      return new Response(
        JSON.stringify({ success: false, error: 'Não foi possível acessar o contrato do cliente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contractsData = await contractsResponse.json();
    const contracts = contractsData.customer_contracts || contractsData.contracts || contractsData.data || [];
    
    if (!Array.isArray(contracts) || contracts.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum contrato encontrado para o cliente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const activeContract = contracts.find((c: any) => c.status === 'active') || contracts[0];
    const actualContractId = activeContract.id;
    console.log(`Contrato encontrado: id=${actualContractId}, status=${activeContract.status}, access_status=${activeContract.access_status}`);

    // 2. Buscar boletos do cliente
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

    // 3. Filtrar boletos do contrato ativo que estão vencidos
    const boletosVencidos = allBillings.filter((b: any) => {
      const sitName = (b.situation_name || b.situation?.name || '').toLowerCase().trim();
      const isVencido = sitName === 'em atraso' || sitName === 'atrasado';
      // Filtrar pelo contrato ativo se possível
      const matchContract = !b.contract_id || b.contract_id === actualContractId;
      return isVencido && matchContract;
    });

    console.log(`Boletos vencidos encontrados: ${boletosVencidos.length}`);
    boletosVencidos.forEach((b: any) => {
      console.log(`Boleto vencido: id=${b.id}, contract_id=${b.contract_id}, value=${b.value}, due_day=${b.due_day}, situation_name=${b.situation_name || b.situation?.name}`);
    });

    if (boletosVencidos.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum boleto vencido encontrado para realizar o desbloqueio.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Data do dia seguinte
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const newDueDay = tomorrow.toISOString().split('T')[0];

    // 5. Atualizar a situação dos boletos vencidos para "Em Observação" (situation_id: 5)
    // e alterar o vencimento para o dia seguinte
    const updateResults: any[] = [];
    let anySuccess = false;

    for (const boleto of boletosVencidos) {
      const boletoId = boleto.id;
      console.log(`Atualizando boleto ${boletoId} - valor: ${boleto.value}, vencimento: ${boleto.due_day}`);

      const updateBody = {
        due_day: newDueDay,
        situation_id: 5, // Em Observação
      };

      // Tentativa 1: PUT /v1/admin/billings/{id}
      console.log(`Tentativa 1: PUT /v1/admin/billings/${boletoId}`, JSON.stringify(updateBody));
      let updateResponse = await fetch(
        `https://api.mikweb.com.br/v1/admin/billings/${boletoId}`,
        {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify(updateBody),
        }
      );
      let updateText = await updateResponse.text();
      console.log(`PUT /billings/${boletoId}: ${updateResponse.status} - ${updateText}`);

      if (updateResponse.ok) {
        anySuccess = true;
        updateResults.push({ boleto_id: boletoId, success: true, method: 'PUT /billings' });
        continue;
      }

      // Tentativa 2: PATCH /v1/admin/billings/{id}
      console.log(`Tentativa 2: PATCH /v1/admin/billings/${boletoId}`);
      updateResponse = await fetch(
        `https://api.mikweb.com.br/v1/admin/billings/${boletoId}`,
        {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify(updateBody),
        }
      );
      updateText = await updateResponse.text();
      console.log(`PATCH /billings/${boletoId}: ${updateResponse.status} - ${updateText}`);

      if (updateResponse.ok) {
        anySuccess = true;
        updateResults.push({ boleto_id: boletoId, success: true, method: 'PATCH /billings' });
        continue;
      }

      // Tentativa 3: PUT via contrato /v1/admin/customer_contracts/{contract_id}/billings/{billing_id}
      console.log(`Tentativa 3: PUT /customer_contracts/${actualContractId}/billings/${boletoId}`);
      updateResponse = await fetch(
        `https://api.mikweb.com.br/v1/admin/customer_contracts/${actualContractId}/billings/${boletoId}`,
        {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify(updateBody),
        }
      );
      updateText = await updateResponse.text();
      console.log(`PUT /customer_contracts/${actualContractId}/billings/${boletoId}: ${updateResponse.status} - ${updateText}`);

      if (updateResponse.ok) {
        anySuccess = true;
        updateResults.push({ boleto_id: boletoId, success: true, method: 'PUT /customer_contracts/billings' });
        continue;
      }

      // Tentativa 4: POST para recriar/atualizar o boleto com os novos dados
      const recreateBody = {
        customer_id: Number(cliente_id),
        contract_id: actualContractId,
        due_day: newDueDay,
        situation_id: 5,
        value: boleto.value,
        reference: boleto.reference || 'Mensalidade',
        type_billing: boleto.type_billing || 'M',
      };
      console.log(`Tentativa 4: POST /billings (recriar)`, JSON.stringify(recreateBody));
      updateResponse = await fetch(
        `https://api.mikweb.com.br/v1/admin/billings`,
        {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(recreateBody),
        }
      );
      updateText = await updateResponse.text();
      console.log(`POST /billings: ${updateResponse.status} - ${updateText}`);

      if (updateResponse.ok) {
        anySuccess = true;
        updateResults.push({ boleto_id: boletoId, success: true, method: 'POST /billings (recreated)' });
        continue;
      }

      // Todas as tentativas falharam para este boleto
      updateResults.push({ 
        boleto_id: boletoId, 
        success: false, 
        last_status: updateResponse.status,
        last_response: updateText.substring(0, 200),
      });
    }

    console.log('Update results:', JSON.stringify(updateResults));

    if (!anySuccess) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Não foi possível atualizar a situação do(s) boleto(s) vencido(s). Entre em contato com o suporte.',
          details: updateResults,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Registrar o uso do desbloqueio
    const { error: insertError } = await supabase
      .from('desbloqueio_logs')
      .insert({ cliente_id: Number(cliente_id) });

    if (insertError) {
      console.error('Error logging desbloqueio:', insertError);
    }

    const successCount = updateResults.filter(r => r.success).length;
    const successMethods = updateResults.filter(r => r.success).map(r => r.method).join(', ');
    console.log(`Desbloqueio concluído: ${successCount} boleto(s) atualizado(s) via ${successMethods}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Desbloqueio realizado com sucesso! ${successCount} boleto(s) atualizado(s) para "Em Observação" com vencimento para ${newDueDay}. Aguarde alguns instantes para que a conexão seja restabelecida.`,
        boletos_atualizados: successCount,
        details: updateResults,
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
