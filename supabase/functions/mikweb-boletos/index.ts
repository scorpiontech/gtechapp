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
    const response = await fetch(`https://api.mikweb.com.br/v1/admin/financeiro/titulos?cliente_id=${cliente_id}`, {
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
    const titulos = data.titulos || data.data || data;

    // Mapear os títulos para o formato esperado pelo frontend
    const boletos = Array.isArray(titulos) ? titulos.map((titulo: any) => ({
      id: titulo.id,
      cliente_id: titulo.cliente_id,
      valor: parseFloat(titulo.valor) || 0,
      vencimento: titulo.vencimento || titulo.data_vencimento,
      data_emissao: titulo.data_emissao || titulo.created_at,
      status: titulo.status || titulo.situacao,
      linha_digitavel: titulo.linha_digitavel || titulo.codigo_barras_linha,
      codigo_barras: titulo.codigo_barras,
      link_boleto: titulo.link_boleto || titulo.url_boleto || titulo.link,
      nosso_numero: titulo.nosso_numero,
    })) : [];

    // Ordenar por vencimento (mais recentes primeiro)
    boletos.sort((a: any, b: any) => new Date(b.vencimento).getTime() - new Date(a.vencimento).getTime());

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
