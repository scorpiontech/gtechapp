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

    // Buscar boletos do cliente na API MikWeb
    const response = await fetch(`https://api.mikweb.com.br/v1/admin/billings?customer_id=${cliente_id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('MikWeb API error:', response.status, await response.text());
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao consultar boletos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const data = await response.json();
    console.log('MikWeb Boletos API response:', JSON.stringify(data).substring(0, 500));
    
    const titulos = data.billings || data.data || [];

    // Mapear os títulos para o formato esperado pelo frontend
    const boletos = Array.isArray(titulos) ? titulos.map((billing: any) => {
      // Determinar status baseado nos campos da API
      let status = billing.status || billing.situation || 'aberto';
      if (typeof status === 'string') {
        status = status.toLowerCase();
        if (status === 'paid' || status === 'pago' || status === 'p') {
          status = 'pago';
        } else if (status === 'canceled' || status === 'cancelado' || status === 'c') {
          status = 'cancelado';
        } else {
          status = 'aberto';
        }
      }
      
      return {
        id: billing.id,
        cliente_id: billing.customer_id,
        valor: parseFloat(billing.value) || 0,
        vencimento: billing.due_date,
        data_emissao: billing.created_at,
        status: status,
        linha_digitavel: billing.digitable_line || billing.barcode_line,
        codigo_barras: billing.barcode,
        link_boleto: billing.billing_url || billing.url,
        nosso_numero: billing.our_number,
      };
    }) : [];

    // Ordenar: abertos primeiro, depois por vencimento (mais antigos primeiro para abertos, mais recentes para pagos)
    boletos.sort((a: any, b: any) => {
      // Prioridade: abertos > vencidos > pagos > cancelados
      const statusPriority: Record<string, number> = { aberto: 0, vencido: 1, pago: 2, cancelado: 3 };
      const priorityA = statusPriority[a.status] ?? 1;
      const priorityB = statusPriority[b.status] ?? 1;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // Para abertos, mostrar os mais próximos do vencimento primeiro
      // Para pagos, mostrar os mais recentes primeiro
      if (a.status === 'aberto') {
        return new Date(a.vencimento).getTime() - new Date(b.vencimento).getTime();
      }
      return new Date(b.vencimento).getTime() - new Date(a.vencimento).getTime();
    });

    return new Response(
      JSON.stringify({ success: true, boletos }),
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
