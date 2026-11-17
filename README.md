# Analista de Draft (rat-draft)

Site para um time de League of Legends que:

- **Time** — analisa as contas dos jogadores (elo, forma recente, pool de campeões e nota de conforto) a partir do OP.GG;
- **Simulador** — simula um draft de torneio: você faz o seu lado e uma IA faz o lado inimigo como coach adversário, com sugestões de ban e pick a cada turno;
- **Analisar** — analisa um draft já feito: notas de cada lado, composições, matchups de rota e condições de vitória.

Português (padrão) e inglês. Servidor do LoL: BR (preparado para outras regiões).
A especificação completa está em [`docs/TASKS.md`](docs/TASKS.md).

> Não afiliado à Riot Games nem ao OP.GG.

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · next-intl · Vercel AI SDK 7 (Groq, Google ou Anthropic) · OP.GG MCP · Data Dragon · Recharts · zod · Vitest.

## Rodando localmente

Requisitos: **Node.js 20.9 ou mais novo** e npm.

```bash
npm install
cp .env.example .env.local   # depois edite .env.local (veja abaixo)
npm run dev
```

Abra <http://localhost:3000> (redireciona para `/pt`).
Para saber quais serviços estão configurados: <http://localhost:3000/api/health> (nunca mostra as chaves).

### Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `AI_PROVIDER` | não | `groq` (padrão), `google` ou `anthropic`. |
| `AI_MODEL` | não | Modelo do provedor. Padrões: `openai/gpt-oss-120b` (Groq), `gemini-2.5-flash` (Google), `claude-sonnet-5-5` (Anthropic). |
| `GROQ_API_KEY` | se `AI_PROVIDER=groq` | Chave do Groq (<https://console.groq.com>). |
| `GEMINI_API_KEY` | se `AI_PROVIDER=google` | Chave do Google AI Studio. |
| `ANTHROPIC_API_KEY` | se `AI_PROVIDER=anthropic` | Chave da Anthropic. |
| `OPGG_MCP_URL` | não | Padrão `https://mcp-api.op.gg/mcp` (sem chave). |
| `DEFAULT_REGION` | não | Padrão `br`. |
| `RIOT_API_KEY` | não | Reservada para o futuro (não usada). |

**Sem chave de IA o site continua funcionando**: a análise por regras, as sugestões e o coach (decidindo pelo motor de regras) aparecem normalmente, com o aviso "Análise por IA indisponível".

Nunca faça commit de chaves: `.env*` está no `.gitignore` (só o `.env.example` é versionado).

> Os modelos disponíveis mudam. Se a IA responder "model does not exist", liste os modelos da sua conta (no Groq: `GET https://api.groq.com/openai/v1/models`) e ajuste `AI_MODEL`.

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento. |
| `npm run build` / `npm start` | Build e servidor de produção. Antes do build roda `champions:sync --strict`. |
| `npm run lint` | ESLint. |
| `npm test` | Testes (Vitest): regras de composição, parsers, ordem do draft, sugestões, prompts, traduções… |
| `npm run champions:sync` | Compara `data/champion-attributes.json` com a lista atual do Data Dragon e avisa campeões sem atributos. |
| `npm run opgg:tools` | Lista as ferramentas reais do OP.GG MCP e salva em `docs/opgg-tools.json`. |

## Como o projeto está organizado

```
data/champion-attributes.json   atributos de draft de cada campeão (mantidos pelo projeto)
docs/                           especificação e saída do tools/list do OP.GG
messages/pt.json, en.json       todos os textos da interface
scripts/                        sync de campeões, lista de ferramentas do OP.GG, wrapper do Vitest
src/app/[locale]/               páginas: início, time, simulador, analisar
src/app/api/                    players, champion, matchup, suggest, coach, analyze, health
src/lib/data/                   ÚNICA camada que conhece o OP.GG (tipos neutros em types.ts)
src/lib/comp/                   atributos, motor de composição e encaixe
src/lib/draft/                  ordem do draft, reducer, sugestões, parsers
src/lib/ai/                     provedor de IA e prompts
```

Toda chamada externa (OP.GG, IA, Data Dragon) roda no servidor. Os dados ficam num cache em memória: perfis por 10 min, meta e matchups por 6 h, Data Dragon por 24 h.

## Quando sai um campeão novo

O build **falha** se algum campeão do Data Dragon não tiver atributos (é o comportamento pedido na especificação). Para corrigir:

1. Rode `npm run champions:sync` para ver quem falta.
2. Adicione o campeão em `data/champion-attributes.json` no formato da seção 6 do `docs/TASKS.md` (marque `"review": true` se for um palpite).
3. Rode `npm test` (o arquivo é validado com zod) e faça o build de novo.

Sem internet o check de campeões é pulado com um aviso; a validação dos campos continua.

## Deploy na Vercel

1. Suba o repositório no GitHub e importe-o em <https://vercel.com/new> (framework detectado: Next.js; não precisa mudar comandos).
2. Em **Settings → Environment Variables**, cadastre as variáveis da tabela acima (no mínimo `AI_PROVIDER` e a chave do provedor escolhido) para *Production* e *Preview*.
3. Faça o deploy. Depois, confira `https://<seu-projeto>.vercel.app/api/health`.

Observações:

- O cache é em memória, por instância da função: em produção ele é perdido quando a instância esfria, e algumas buscas ao OP.GG levam alguns segundos na primeira vez. As rotas `GET /api/champion` e `/api/matchup` também enviam `Cache-Control` para a CDN da Vercel.
- `/api/analyze` responde em streaming (NDJSON); funciona nas funções padrão da Vercel.
- A página `/dev` (pré-visualização de componentes) só existe em desenvolvimento; em produção responde 404.

## Problemas comuns

- **`npm test` falha com "failed to find the current suite" no Windows**: use `npm test` (o wrapper `scripts/vitest.mjs` corrige o caso da letra do drive); evite chamar `npx vitest` direto num terminal aberto em `c:\…`.
- **Página recarregando sem parar no `npm run dev`**: é o cache de desenvolvimento do Turbopack corrompido depois de muitas horas aberto. Pare o servidor, apague `.next/dev` e rode `npm run dev` de novo.
- **"Não foi possível buscar X agora"**: o OP.GG demorou mais de 15 s ou está fora; tente de novo. Perfis que não são atualizados no OP.GG há muito tempo podem estar desatualizados.

## Licença e créditos

Dados de jogadores e meta: OP.GG (via MCP público). Imagens e nomes de campeões: Data Dragon da Riot Games. League of Legends é marca da Riot Games, Inc. Este projeto não é endossado pela Riot Games nem pelo OP.GG.
