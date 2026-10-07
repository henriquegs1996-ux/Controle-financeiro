# Meu Financeiro — Backend WhatsApp

Backend Node.js para ligar a WhatsApp Cloud API ao assistente do Meu Financeiro.

## O que faz

- valida o webhook da Meta em `GET /webhook`;
- recebe mensagens em `POST /webhook`;
- interpreta frases como:
  - `gastei 45 combustível`
  - `paguei 120 de luz`
  - `recebi 1500 de uma venda`
- grava os lançamentos no Supabase;
- responde pelo WhatsApp confirmando o lançamento;
- fornece API para o futuro aplicativo web.

## Arquitetura

WhatsApp → Meta Cloud API → `/webhook` → assistente → Supabase → Meu Financeiro

## Banco

1. Crie um projeto gratuito no Supabase.
2. Abra o SQL Editor.
3. Cole e execute o conteúdo de `schema.sql`.
4. Copie a URL do projeto e a Service Role Key para as variáveis do backend.

A Service Role Key nunca deve ir para HTML, JavaScript do navegador ou GitHub.

## Render

1. Crie um repositório no GitHub.
2. Envie estes arquivos para o repositório.
3. No Render, escolha `New → Web Service`.
4. Conecte o repositório.
5. Build Command: `npm install`
6. Start Command: `npm start`
7. Plano: `Free`
8. Cadastre as variáveis de ambiente.
9. Faça o deploy.

O endereço ficará parecido com:

`https://meu-financeiro-whatsapp.onrender.com`

O callback será:

`https://SEU-ENDERECO.onrender.com/webhook`

## Meta

Na configuração de Webhooks:

URL de callback:
`https://SEU-ENDERECO.onrender.com/webhook`

Verificar token:
o mesmo valor usado em `WHATSAPP_VERIFY_TOKEN`.

Depois de verificar e salvar, assine o campo `messages`.

## Credenciais

O token de acesso da WhatsApp Cloud API fica somente em `WHATSAPP_ACCESS_TOKEN`.

Como um token foi exposto durante a configuração, gere um NOVO token antes de usar este backend.

## Teste

Envie para o número conectado:

`gastei 45 combustível`

O backend deve responder confirmando valor, categoria, descrição e data.

## Importante sobre o gratuito

O Render possui Web Services gratuitos, mas eles podem entrar em suspensão após 15 minutos sem tráfego e levam cerca de um minuto para voltar. Para teste é adequado; para uma automação empresarial que precise ficar sempre pronta, pode ser necessário um plano pago.

O banco fica no Supabase para não depender do disco local do Render. O plano Free do Supabase tem limites e projetos Free podem ser pausados por inatividade.

## Próxima etapa

Depois de o webhook funcionar, vamos adaptar o seu `meu_financeiro_v5_assistente.html` para consultar o backend e mostrar no site os lançamentos que vierem do WhatsApp.
