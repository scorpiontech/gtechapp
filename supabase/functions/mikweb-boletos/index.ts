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
      return new Response(
        JSON.stringify({ success: false, error: 'Configuração do servidor incompleta' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const response = await fetch(`https://api.mikweb.com.br/v1/admin/billings?customer_id=${cliente_id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('MikWeb API error:', response.status);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao consultar boletos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const data = await response.json();
    const titulos = data.billings || data.data || [];

    // Log billing fields and all distinct situations for debugging
    if (Array.isArray(titulos) && titulos.length > 0) {
      console.log('Billing fields:', Object.keys(titulos[0]).join(', '));
      // Log all distinct situation_id + situation_name combos
      const situations = [...new Set(titulos.map((b: any) => `${b.situation_id}:${b.situation_name || b.situation?.name || 'unknown'}`))];
      console.log('All situations:', situations.join(', '));
      const b = titulos[0];
      console.log('Sample billing:', JSON.stringify({
        id: b.id, situation_id: b.situation_id, situation_name: b.situation_name,
        situation: b.situation, due_day: b.due_day,
        value: b.value, value_paid: b.value_paid, date_payment: b.date_payment,
      }));
    }

    // MikWeb situation_name mapping (based on user report):
    // "efetuado" = pago, "em aberto" = aberto, "em atraso" = vencido, "em observação" = aberto
    // Also map by situation_id as fallback
    const situationNameMap: Record<string, string> = {
      'efetuado': 'pago',
      'em aberto': 'aberto',
      'em atraso': 'vencido',
      'atrasado': 'vencido',
      'cancelado': 'cancelado',
      'em observação': 'aberto',
      'observação': 'aberto',
      'remessa': 'aberto',
    };

    const situationIdMap: Record<number, string> = {
      1: 'aberto',
      2: 'vencido',
      3: 'pago',
      4: 'cancelado',
      5: 'aberto',
    };

    const resolveStatus = (billing: any): string => {
      // Try situation_name first (most reliable based on MikWeb UI)
      const name = (billing.situation_name || billing.situation?.name || '').toLowerCase().trim();
      if (name && situationNameMap[name]) return situationNameMap[name];
      // Fallback to situation_id
      const id = Number(billing.situation_id);
      return situationIdMap[id] || 'aberto';
    };

    const boletos = Array.isArray(titulos) ? titulos.map((billing: any) => {
      const status = resolveStatus(billing);

      return {
        id: billing.id,
        cliente_id: billing.customer_id,
        valor: parseFloat(billing.value) || 0,
        valor_pago: billing.value_paid ? parseFloat(billing.value_paid) : null,
        vencimento: billing.due_day || null, // "2025-12-25" format
        data_pagamento: billing.date_payment || null,
        data_emissao: billing.created_at,
        status,
        situation_id: situationId,
        referencia: billing.reference || null,
        linha_digitavel: billing.digitable_line || billing.barcode_line || null,
        codigo_barras: billing.barcode || null,
        link_boleto: billing.billing_url || billing.url || null,
        nosso_numero: billing.our_number || null,
        pix_qr_code: billing.pix_qr_code || billing.qr_code || billing.pix_qrcode || null,
        pix_copy_paste: billing.pix_copy_paste || billing.pix_emv || billing.pix || null,
      };
    }) : [];

    // Sort: abertos/vencidos first, then pagos
    boletos.sort((a: any, b: any) => {
      const priority: Record<string, number> = { vencido: 0, aberto: 1, pago: 2, cancelado: 3 };
      const pA = priority[a.status] ?? 1;
      const pB = priority[b.status] ?? 1;
      if (pA !== pB) return pA - pB;

      if (a.status === 'aberto' || a.status === 'vencido') {
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
