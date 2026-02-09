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
    const { cliente_id } = await req.json();

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

    // 5. Liberar acesso via PUT no customer
    console.log(`Liberando acesso: PUT /customers/${cliente_id}`);
    const desbloqueioResponse = await fetch(
      `https://api.mikweb.com.br/v1/admin/customers/${cliente_id}`,
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ access_status: 'L' }),
      }
    );

    if (!desbloqueioResponse.ok) {
      const errorText = await desbloqueioResponse.text();
      console.error('MikWeb desbloqueio error:', desbloqueioResponse.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'Boletos atualizados, mas não foi possível liberar o acesso. Entre em contato com o suporte.' }),
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
