import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // 1. Buscar todos os boletos do cliente para encontrar o vencido (em atraso)
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

    // 2. Encontrar boleto(s) vencido(s) - situation_name "em atraso" ou "atrasado"
    const boletosVencidos = allBillings.filter((b: any) => {
      const sitName = (b.situation_name || b.situation?.name || '').toLowerCase().trim();
      return sitName === 'em atraso' || sitName === 'atrasado';
    });

    console.log(`Boletos vencidos encontrados: ${boletosVencidos.length}`);

    if (boletosVencidos.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum boleto vencido encontrado para realizar o desbloqueio.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Calcular a data do dia seguinte (formato YYYY-MM-DD)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const newDueDay = tomorrow.toISOString().split('T')[0];

    console.log(`Nova data de vencimento: ${newDueDay}`);

    // 4. Atualizar cada boleto vencido para situação "em observação" com nova data
    const updateResults: any[] = [];

    for (const boleto of boletosVencidos) {
      console.log(`Atualizando boleto ${boleto.id} - valor: ${boleto.value}, vencimento atual: ${boleto.due_day}`);

      const updateResponse = await fetch(
        `https://api.mikweb.com.br/v1/admin/billings/${boleto.id}`,
        {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({
            due_day: newDueDay,
            situation_id: 5, // 5 = Em Observação
          }),
        }
      );

      const updateText = await updateResponse.text();
      console.log(`Boleto ${boleto.id} update response: ${updateResponse.status} - ${updateText}`);

      updateResults.push({
        boleto_id: boleto.id,
        success: updateResponse.ok,
        status: updateResponse.status,
      });
    }

    const allSuccess = updateResults.every((r) => r.success);

    if (!allSuccess) {
      const failed = updateResults.filter((r) => !r.success);
      console.error('Some billing updates failed:', JSON.stringify(failed));
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Não foi possível atualizar todos os boletos. Entre em contato com o suporte.',
          details: updateResults,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Alterar status de acesso do cliente para Liberado (L)
    const desbloqueioResponse = await fetch(
      `https://api.mikweb.com.br/v1/admin/customers/${cliente_id}/access_status`,
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
