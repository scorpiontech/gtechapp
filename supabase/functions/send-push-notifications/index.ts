import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MIKWEB_TOKEN = Deno.env.get("MIKWEB_API_TOKEN");
    const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY");

    if (!MIKWEB_TOKEN) {
      return new Response(
        JSON.stringify({ error: "MIKWEB_API_TOKEN not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get all unique cliente_ids with registered tokens
    const { data: tokenRecords, error: tokensError } = await supabase
      .from("device_tokens")
      .select("cliente_id, token, platform");

    if (tokensError || !tokenRecords?.length) {
      return new Response(
        JSON.stringify({ success: true, message: "No registered devices", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group tokens by cliente_id
    const tokensByCliente = new Map<number, Array<{ token: string; platform: string }>>();
    for (const record of tokenRecords) {
      const existing = tokensByCliente.get(record.cliente_id) || [];
      existing.push({ token: record.token, platform: record.platform });
      tokensByCliente.set(record.cliente_id, existing);
    }

    let sentCount = 0;
    const errors: string[] = [];

    for (const [clienteId, tokens] of tokensByCliente) {
      try {
        // Fetch billings for this client from MikWeb
        const billingsRes = await fetch(
          `https://api.mikweb.com.br/v1/admin/billings?customer_id=${clienteId}`,
          {
            headers: {
              Authorization: `Bearer ${MIKWEB_TOKEN}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!billingsRes.ok) continue;

        const billingsData = await billingsRes.json();
        const billings = billingsData?.data || billingsData?.billings || [];

        // Check for overdue bills
        const today = new Date();
        const overdueBillings = billings.filter((b: any) => {
          const situation = b.situation_id || b.situation;
          const description = (b.description || "").toLowerCase();
          const dueDate = new Date(b.due_date || b.vencimento);

          const isOverdue =
            situation === 2 ||
            situation === 3 ||
            description.includes("em atraso") ||
            description.includes("atrasado") ||
            (dueDate < today &&
              situation !== 1 &&
              !description.includes("efetuado") &&
              !description.includes("pago"));

          return isOverdue;
        });

        if (overdueBillings.length === 0) continue;

        const totalOverdue = overdueBillings.reduce(
          (sum: number, b: any) => sum + parseFloat(b.value || b.total || "0"),
          0
        );

        const formattedTotal = totalOverdue.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        });

        const title = "GTech - Mensalidade em atraso";
        const body =
          overdueBillings.length === 1
            ? `Você possui 1 boleto vencido (${formattedTotal}). Regularize para evitar bloqueio.`
            : `Você possui ${overdueBillings.length} boletos vencidos (${formattedTotal}). Regularize para evitar bloqueio.`;

        // Send push to all tokens of this client
        if (FCM_SERVER_KEY) {
          for (const { token, platform } of tokens) {
            if (platform === "web") continue; // Web push needs VAPID, skip for now

            try {
              const fcmRes = await fetch(
                "https://fcm.googleapis.com/fcm/send",
                {
                  method: "POST",
                  headers: {
                    Authorization: `key=${FCM_SERVER_KEY}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    to: token,
                    notification: {
                      title,
                      body,
                      icon: "/pwa-192x192.png",
                      click_action: "OPEN_APP",
                    },
                    data: {
                      type: "overdue_bill",
                      count: overdueBillings.length,
                      total: totalOverdue,
                    },
                  }),
                }
              );

              if (fcmRes.ok) sentCount++;
            } catch {
              // Individual send failure
            }
          }
        }
      } catch (e) {
        errors.push(`Cliente ${clienteId}: ${(e as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        clients_checked: tokensByCliente.size,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
