require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v25.0";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const APP_API_KEY = process.env.APP_API_KEY || "";

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false }
      })
    : null;

function requireApiKey(req, res, next) {
  if (!APP_API_KEY) return next();
  const supplied = req.get("x-api-key") || "";
  if (supplied.length !== APP_API_KEY.length ||
      !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(APP_API_KEY))) {
    return res.status(401).json({ ok: false, error: "API key inválida." });
  }
  next();
}

function brl(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function parseMoney(text) {
  const matches = text.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
  if (!matches) return null;

  let raw = matches[1];
  if (raw.includes(",") && raw.includes(".")) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (raw.includes(",")) raw = raw.replace(",", ".");

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function detectType(text) {
  const t = text.toLowerCase();
  if (/(recebi|receita|ganhei|entrada|venda|salário|salario|pagaram|caiu)/i.test(t)) return "income";
  if (/(gastei|gasto|despesa|paguei|pagar|compr(a|ei)|saída|saida|desembolso)/i.test(t)) return "expense";
  return null;
}

function detectCategory(text, type) {
  const t = text.toLowerCase();
  const rules = [
    [/combust|gasolina|etanol|diesel|posto/, "Combustível"],
    [/luz|energia|enel|eletric/, "Contas"],
    [/água|agua|sabesp|internet|telefone|celular/, "Contas"],
    [/aluguel|condom/, "Moradia"],
    [/mercado|supermercado|feira|comida|aliment|restaurante|lanche|delivery|ifood/, "Alimentação"],
    [/manutenção|manutencao|conserto|oficina/, "Manutenção"],
    [/uber|99|ônibus|onibus|metro|transporte|taxi/, "Transporte"],
    [/venda|cliente|serviço|servico|recebi|receita/, "Vendas"],
    [/salário|salario|pagamento mensal/, "Salário"],
    [/investimento|investi|aplicação|aplicacao/, "Investimentos"]
  ];

  for (const [regex, category] of rules) {
    if (regex.test(t)) return category;
  }
  return "Outros";
}

function cleanDescription(text) {
  return text
    .replace(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i, "")
    .replace(/\b(reais?|r\$)\b/gi, "")
    .replace(/\b(gastei|gasto|despesa|paguei|pagar|recebi|receita|ganhei|entrada|venda|salário|salario|compr(ei|a)|de|com|em)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(text) {
  const t = text.toLowerCase();
  const d = new Date();
  if (t.includes("anteontem")) d.setDate(d.getDate() - 2);
  else if (t.includes("ontem")) d.setDate(d.getDate() - 1);

  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function parseAssistant(text) {
  const type = detectType(text);
  const value = parseMoney(text);

  if (!type) return { ok:false, error:"Não consegui identificar se é receita ou gasto." };
  if (!value) return { ok:false, error:"Não encontrei o valor. Exemplo: gastei 45 combustível." };

  const category = detectCategory(text, type);
  const description = cleanDescription(text) || category;

  return {
    ok: true,
    entry: {
      id: crypto.randomUUID(),
      type,
      value,
      category,
      description,
      date: parseDate(text),
      status: "paid",
      method: "WhatsApp",
      raw_text: text
    }
  };
}

async function saveEntry(entry, messageId, from) {
  if (!supabase) return { persisted:false, entry };

  const row = {
    id: entry.id,
    external_message_id: messageId || null,
    phone: from || null,
    type: entry.type,
    value: entry.value,
    description: entry.description,
    category: entry.category,
    date: entry.date,
    status: entry.status,
    method: entry.method,
    raw_text: entry.raw_text
  };

  const { data, error } = await supabase
    .from("finance_entries")
    .insert(row)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { persisted:true, duplicate:true, entry };
    throw error;
  }

  return { persisted:true, entry:data };
}

async function sendWhatsAppText(to, body) {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    throw new Error("Credenciais do WhatsApp não configuradas.");
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body }
      })
    }
  );

  const data = await response.json();
  if (!response.ok) throw new Error(`WhatsApp API HTTP ${response.status}.`);
  return data;
}

app.get("/", (req,res) => {
  res.json({
    ok:true,
    service:"Meu Financeiro — WhatsApp Backend",
    status:"online",
    webhook:"/webhook"
  });
});

// Verificação inicial feita pela Meta.
app.get("/webhook", (req,res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

// Eventos recebidos da Meta.
app.post("/webhook", async (req,res) => {
  res.sendStatus(200);

  try {
    if (req.body?.object !== "whatsapp_business_account") return;

    for (const entry of req.body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;

        for (const message of change.value?.messages || []) {
          if (message.type !== "text") continue;

          const from = message.from;
          const messageId = message.id;
          const text = message.text?.body?.trim();
          if (!from || !text) continue;

          const parsed = parseAssistant(text);

          if (!parsed.ok) {
            await sendWhatsAppText(
              from,
              `🤖 Meu Financeiro\n\n${parsed.error}\n\nExemplos:\n• gastei 45 combustível\n• paguei 120 de luz\n• recebi 1500 de uma venda`
            );
            continue;
          }

          const saved = await saveEntry(parsed.entry, messageId, from);
          const e = parsed.entry;
          const label = e.type === "income" ? "RECEITA" : "GASTO";
          const emoji = e.type === "income" ? "💰" : "💸";

          let reply =
            `${emoji} ${label} registrada!\n\n` +
            `Valor: ${brl(e.value)}\n` +
            `Categoria: ${e.category}\n` +
            `Descrição: ${e.description}\n` +
            `Data: ${e.date}`;

          if (!saved.persisted) {
            reply += "\n\n⚠️ Interpretado, mas o banco ainda não está configurado.";
          }

          await sendWhatsAppText(from, reply);
        }
      }
    }
  } catch (error) {
    console.error("Erro no webhook:", error.message);
  }
});

// API para o futuro aplicativo web.
app.get("/api/entries", requireApiKey, async (req,res) => {
  if (!supabase) return res.status(503).json({ok:false,error:"Supabase não configurado."});

  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const {data,error} = await supabase
    .from("finance_entries")
    .select("*")
    .order("date",{ascending:false})
    .order("created_at",{ascending:false})
    .limit(limit);

  if (error) return res.status(500).json({ok:false,error:error.message});
  res.json({ok:true,entries:data});
});

app.post("/api/entries", requireApiKey, async (req,res) => {
  if (!supabase) return res.status(503).json({ok:false,error:"Supabase não configurado."});

  const parsed = parseAssistant(String(req.body?.text || ""));
  if (!parsed.ok) return res.status(400).json(parsed);

  const saved = await saveEntry(parsed.entry,null,"web");
  res.status(201).json({ok:true,...saved});
});

app.listen(PORT, () => {
  console.log(`Meu Financeiro WhatsApp Backend rodando na porta ${PORT}`);
});
