# Analista de Draft de LoL: especificação e tarefas

> **Como usar este arquivo:** coloque-o em `docs/TASKS.md` no repositório e peça ao Claude Code:
> "Leia o docs/TASKS.md inteiro e execute a Fase 0. Ao terminar cada fase, pare, me mostre o que foi feito e espere meu ok antes da próxima."

---

## 1. Visão geral

Site para um time de League of Legends que:

1. **Analisa as contas** de cada jogador do time (elo, pool de conforto, forma recente) a partir do OP.GG.
2. **Simula um draft no formato de torneio**: o usuário faz o lado do seu time e a IA faz o lado inimigo **como se fosse o coach adversário**. Durante o draft, o site dá **sugestões de ban**, **sugestões de pick** (priorizando o conforto do time), **boas respostas** ao que o inimigo escolheu e **análise de matchups** por rota.
3. **Analisa um draft já feito**: o usuário insere os bans e picks de uma partida e recebe uma análise completa.
4. Em todos os casos, faz **análise da composição como um todo**, e não só de cada campeão isolado.

**Fora do escopo (não implementar):** draft de solo/flex queue, leitura do cliente do LoL (LCU), acompanhamento de draft ao vivo, login de usuários, banco de dados.

**Idiomas:** português (padrão) e inglês, com seletor no cabeçalho.
**Servidor do LoL:** BR (`br`), com o código preparado para outras regiões no futuro.

---

## 2. Regras para o agente (Claude Code)

- Trabalhe **fase por fase**, na ordem da seção 9. Ao fim de cada fase: rode `npm run lint`, `npm run build` e os testes, faça um commit com mensagem descritiva e **pare para revisão**.
- **Nunca** escreva chaves de API no código, em commits ou em logs. Use só variáveis de ambiente e mantenha o `.env.example` atualizado.
- Antes de usar qualquer ferramenta do OP.GG MCP, **liste as ferramentas reais do servidor** (`tools/list`) e confira os nomes e parâmetros. Os nomes da seção 5 vêm da documentação pública e podem ter mudado. Salve o resultado em `docs/opgg-tools.json`.
- Todo texto visível ao usuário passa pelo sistema de traduções (seção 4.3). Nada de texto fixo em português ou inglês nos componentes.
- Prefira código simples e tipado. Sem `any` sem justificativa.
- Se algo desta especificação for impossível ou ambíguo, **pergunte** em vez de inventar.
- Toda chamada externa (OP.GG, IA, Data Dragon) roda **no servidor** (Route Handlers ou Server Actions), nunca no navegador.

---

## 3. Stack

| Camada | Escolha |
|---|---|
| Framework | **Next.js** (App Router, versão estável mais recente) + **TypeScript** |
| Estilo | **Tailwind CSS** |
| Gráficos | **Recharts** (radar da composição, barras de dano) |
| i18n | **next-intl** (rotas `/pt/...` e `/en/...`, padrão `pt`) |
| IA | **Vercel AI SDK** (`ai`) com os provedores `@ai-sdk/groq`, `@ai-sdk/google` e `@ai-sdk/anthropic`, escolhidos por variável de ambiente |
| Dados de jogador e meta | **OP.GG MCP** (`https://mcp-api.op.gg/mcp`, transporte Streamable HTTP) via `@modelcontextprotocol/sdk` |
| Dados estáticos | **Data Dragon** da Riot (campeões, ícones, splash) |
| Validação | **zod** |
| Testes | **Vitest** (lógica pura: regras de composição, parser de links, ordem do draft) |
| Deploy | **Vercel** |

---

## 4. Arquitetura

### 4.1 Estrutura de pastas

```
/
├─ .env.example
├─ README.md
├─ docs/                        # documentação do projeto
│  ├─ TASKS.md                   # esta especificação
│  └─ opgg-tools.json            # saída de tools/list do OP.GG MCP
├─ data/
│  └─ champion-attributes.json   # atributos de draft de cada campeão (seção 6)
├─ scripts/
│  ├─ list-opgg-tools.ts         # lista as ferramentas do MCP e salva em docs/
│  └─ sync-champions.ts          # baixa a lista do Data Dragon e aponta campeões sem atributos
├─ messages/
│  ├─ pt.json
│  └─ en.json
└─ src/
   ├─ app/[locale]/
   │  ├─ page.tsx                # início
   │  ├─ time/page.tsx           # análise das contas
   │  ├─ simulador/page.tsx      # simulador de draft
   │  └─ analisar/page.tsx       # analisar draft de uma partida
   ├─ app/api/
   │  ├─ players/route.ts        # POST: Riot IDs → perfis
   │  ├─ champion/route.ts       # GET: análise/counters de um campeão
   │  ├─ matchup/route.ts        # GET: matchup de rota
   │  ├─ suggest/route.ts        # POST: sugestões de ban/pick para o turno atual
   │  ├─ coach/route.ts          # POST: jogada do coach inimigo (IA)
   │  └─ analyze/route.ts        # POST: análise completa de um draft
   ├─ components/
   ├─ lib/
   │  ├─ data/                   # ÚNICA camada que conhece a fonte de dados
   │  │  ├─ types.ts             # tipos neutros (PlayerProfile, ChampionStats, Matchup…)
   │  │  ├─ opgg.ts              # cliente MCP do OP.GG + conversão para os tipos neutros
   │  │  ├─ ddragon.ts           # Data Dragon
   │  │  └─ cache.ts             # cache em memória com TTL
   │  ├─ ai/
   │  │  ├─ provider.ts          # escolhe o modelo pela env
   │  │  └─ prompts.ts           # prompts do coach e do analista
   │  ├─ draft/
   │  │  ├─ order.ts             # ordem do draft de torneio
   │  │  └─ state.ts             # estado do draft (reducer)
   │  ├─ comp/
   │  │  ├─ attributes.ts        # carrega data/champion-attributes.json
   │  │  └─ analyze.ts           # motor de regras da composição (seção 7)
   │  └─ riot-id.ts              # parser de multi OP.GG / Riot IDs
   └─ i18n/
```

**Regra importante:** só `src/lib/data/` sabe que os dados vêm do OP.GG. O resto do código usa os tipos de `types.ts`. Assim dá para trocar pela API oficial da Riot no futuro sem mexer nas páginas.

### 4.2 Variáveis de ambiente (`.env.example`)

```
# Provedor de IA: groq | google | anthropic
AI_PROVIDER=groq
AI_MODEL=llama-3.3-70b-versatile

GROQ_API_KEY=
GEMINI_API_KEY=
ANTHROPIC_API_KEY=

# Reserva para o futuro (não usada no MVP)
RIOT_API_KEY=

# OP.GG MCP (sem chave)
OPGG_MCP_URL=https://mcp-api.op.gg/mcp

# Região padrão
DEFAULT_REGION=br
```

- `provider.ts` lê `AI_PROVIDER` e `AI_MODEL` e retorna o modelo do AI SDK correspondente. Se a chave do provedor escolhido estiver vazia, as funções de IA devem **falhar de forma controlada**: o site continua funcionando só com o motor de regras e mostra o aviso "Análise por IA indisponível".
- O `GEMINI_API_KEY` deve ser repassado ao `@ai-sdk/google` (que por padrão procura `GOOGLE_GENERATIVE_AI_API_KEY`).

### 4.3 Internacionalização

- `next-intl` com `messages/pt.json` e `messages/en.json`.
- Seletor PT/EN no cabeçalho, mantendo a página atual.
- Os nomes de campeões vêm do Data Dragon no idioma certo (`pt_BR` ou `en_US`).
- As respostas da IA devem vir no idioma da interface: passe o `locale` para todos os prompts.

---

## 5. Fonte de dados: OP.GG MCP

### 5.1 Conexão

- Cliente MCP com `@modelcontextprotocol/sdk` (`Client` + `StreamableHTTPClientTransport`) apontando para `OPGG_MCP_URL`.
- Reaproveite a conexão entre requisições quando possível; reconecte em caso de erro.
- **Cache** (`lib/data/cache.ts`), por chave com tempo de vida:
  - perfil e histórico de jogador: 10 min;
  - estatísticas de campeão, meta e matchups: 6 h;
  - Data Dragon: 24 h.
- Tempo limite de 15 s por chamada. Em caso de erro, devolva um erro tipado que a interface consiga mostrar ("Não foi possível buscar X agora").

### 5.2 Ferramentas esperadas (confirmar com `tools/list`)

| Uso | Ferramenta (nome esperado) |
|---|---|
| Perfil: rank, tier, LP, win rate, pool | `lol_get_summoner_profile` |
| Histórico recente com estatísticas | `lol_list_summoner_matches` |
| Detalhes de uma partida | `lol_get_summoner_game_detail` |
| Win/pick/ban rate, builds, counters, sinergias | `lol_get_champion_analysis` |
| Sinergias | `lol_get_champion_synergies` |
| Guia de matchup por rota | `lol_get_lane_matchup_guide` |
| Tier list por rota (meta) | `lol_list_lane_meta_champions` |
| Lista de campeões | `lol_list_champions` |

- A maioria das ferramentas exige o parâmetro `desired_output_fields`. Peça **só os campos necessários** para reduzir o tamanho da resposta.
- O `scripts/list-opgg-tools.ts` (Fase 0) deve listar as ferramentas e os schemas e salvar em `docs/opgg-tools.json`. Use esse arquivo como referência para escrever `opgg.ts`.
- Se uma ferramenta não existir ou mudar, adapte `opgg.ts` e registre a diferença em um comentário.

### 5.3 Tipos neutros (`lib/data/types.ts`)

Defina pelo menos:

```ts
type Role = "top" | "jungle" | "mid" | "adc" | "support";

interface RiotId { gameName: string; tagLine: string }

interface PlayerProfile {
  riotId: RiotId;
  tier?: string; division?: string; lp?: number;
  wins?: number; losses?: number;
  mainRoles: Role[];
  champions: PlayerChampion[];   // pool
  recentForm: { games: number; wins: number; kda: number };
  fetchedAt: string;
}

interface PlayerChampion {
  championId: string;           // id do Data Dragon, ex.: "Ahri"
  games: number; winRate: number; kda: number;
  role?: Role;
  comfort: number;              // 0–100, calculado (seção 8.1)
}

interface ChampionMeta {
  championId: string; role: Role;
  winRate: number; pickRate: number; banRate: number;
  tier?: string;
  counters: { championId: string; winRate: number }[];      // quem vai bem CONTRA ele
  goodAgainst: { championId: string; winRate: number }[];
  synergies: { championId: string; winRate: number }[];
}

interface LaneMatchup {
  role: Role; championA: string; championB: string;
  winRateA?: number;
  tips: string[];
}
```

Os nomes de campeão que vêm do OP.GG precisam ser **normalizados para o id do Data Dragon** (ex.: "Wukong" → `MonkeyKing`, "Nunu & Willump" → `Nunu`). Crie uma função `toDDragonId()` com testes.

---

## 6. Atributos de draft dos campeões (`data/champion-attributes.json`)

Nenhuma API fornece isso, então o arquivo é **mantido pelo projeto**. Um objeto por campeão:

```json
{
  "Ahri": {
    "roles": ["mid"],
    "damageType": "AP",
    "damageProfile": "burst",
    "range": "ranged",
    "scaling": "mid",
    "engage": 1,
    "disengage": 1,
    "peel": 1,
    "cc": 2,
    "frontline": 0,
    "poke": 2,
    "waveclear": 2,
    "splitpush": 1,
    "mobility": 3,
    "objectiveControl": 1,
    "tags": ["pick", "burst", "roam"]
  }
}
```

- **Escala:** inteiros de 0 a 3 (0 = não tem, 3 = excelente).
- `damageType`: `AD` | `AP` | `mixed`. `damageProfile`: `burst` | `sustained` | `mixed`. `range`: `melee` | `ranged`. `scaling`: `early` | `mid` | `late`.
- `tags` possíveis: `engage`, `dive`, `poke`, `pick`, `protect`, `splitpush`, `teamfight`, `skirmish`, `burst`, `tank`, `enchanter`, `hypercarry`, `roam`, `zone`, `antitank`.
- **Geração:** na Fase 3, gere uma primeira versão para **todos** os campeões atuais do Data Dragon com base no seu conhecimento do jogo e marque com `"review": true` os que tiver menos certeza. O `scripts/sync-champions.ts` deve avisar quando surgir um campeão novo sem atributos.
- Valide o arquivo com zod no build: se faltar um campeão ou um campo, o build falha com uma mensagem clara.

---

## 7. Motor de análise de composição (`lib/comp/analyze.ts`)

Função pura e **testada**: recebe até 5 campeões (com rota) de um time e, opcionalmente, os 5 do outro, e devolve uma análise **sem IA**. A IA usa essa saída como base (seção 8.4).

### 7.1 Saída

```ts
interface CompAnalysis {
  damage: { ad: number; ap: number; true?: number };  // proporção 0–1
  damageWarning?: "full_ad" | "full_ap";
  profile: Record<"engage"|"disengage"|"peel"|"cc"|"frontline"|"poke"|"waveclear"|"splitpush"|"mobility"|"objectiveControl", number>; // soma normalizada 0–10
  archetypes: { type: Archetype; score: number }[];   // ordenado, top 2 em destaque
  powerCurve: { early: number; mid: number; late: number }; // 0–10
  weaknesses: WeaknessCode[];   // ex.: "no_frontline", "no_engage", "low_waveclear", "single_damage_type", "no_peel_for_carry"
  strengths: StrengthCode[];
}
type Archetype = "engage" | "poke" | "pick" | "protect" | "splitpush" | "dive" | "skirmish";
```

### 7.2 Regras (ponto de partida; deixe os limites em constantes fáceis de ajustar)

- **Perfil de dano:** some o peso de cada campeão (AD = 1 para AD, AP = 1 para AP, `mixed` = 0,5 para cada). Se mais de 80% for de um tipo → aviso `full_ad` ou `full_ap`.
- **Arquétipo:** pontue cada arquétipo pelas `tags` e pelos atributos (ex.: `engage` = soma de engage + cc + frontline; `poke` = soma de poke + range ranged; `protect` = peel + presença de `hypercarry`; `splitpush` = splitpush alto em top/mid).
- **Curva de força:** média ponderada do `scaling` (early = 3/2/1, mid = 2/3/2, late = 1/2/3) normalizada para 0–10.
- **Fraquezas:** frontline total < 3 → `no_frontline`; engage total < 3 → `no_engage`; waveclear < 4 → `low_waveclear`; existe `hypercarry` e peel < 3 → `no_peel_for_carry`; mobilidade baixa contra time de poke → `vulnerable_to_poke` (só quando houver os dois times).
- **Comparação entre dois times** (`compareComps(a, b)`): quem é mais forte em cada fase do jogo, quem vence o confronto de arquétipos (ex.: engage > poke, poke > protect, pick > splitpush; deixe essa matriz em constante) e uma **nota de 0 a 100** para cada lado, com a explicação dos fatores.

Todos os códigos (`no_frontline` etc.) têm texto traduzido em `messages/*.json`.

---

## 8. Funcionalidades

### 8.1 Página Time (`/time`)

**Entrada:** um campo de texto que aceita:
- link de **multi OP.GG** (qualquer variação de URL com o parâmetro `summoners`, ex.: `https://op.gg/multisearch/br?summoners=Nome%23BR1%2CNome2%23BR1`);
- link de **perfil** do OP.GG (`.../summoners/br/Nome-BR1`);
- **Riot IDs**, um por linha ou separados por vírgula (`Nome#BR1`). Sem `#TAG` → assume `#BR1`, e a interface avisa.

O `lib/riot-id.ts` faz esse parsing e precisa de testes para todos esses formatos, incluindo acentos, espaços e `%23` codificado.

**Fluxo:**
1. O usuário cola e confirma; aparecem até 5 cartões, um por jogador, cada um com um seletor de **rota** (pré-preenchido com a rota principal detectada).
2. `POST /api/players` busca os perfis em paralelo.
3. Cada cartão mostra: elo/LP, win rate, rota principal, forma recente (últimas partidas) e **top campeões** com jogos, win rate, KDA e nota de **conforto**.
4. Um resumo do time mostra o **pool combinado por rota** e alertas como "pool raso no suporte" ou "one-trick no mid".
5. O time é salvo no `localStorage` (com `try/catch`) para ser reaproveitado no simulador e no analisador. Mostre "Atualizado há X min" com um botão **Atualizar**.

**Nota de conforto (0–100):** combine o número de jogos (com retorno decrescente, ex.: `log`), o win rate (ajustado para amostras pequenas, puxando para 50%) e o quão recente o campeão foi jogado. Deixe a fórmula em uma função testada e documentada.

**Aviso na interface:** os dados vêm do OP.GG e podem estar desatualizados se o perfil não for atualizado lá há algum tempo.

### 8.2 Simulador de draft (`/simulador`)

**Formato: torneio (fearless desligado).** Ordem em `lib/draft/order.ts`, com testes:

| # | Fase | Ação |
|---|---|---|
| 1–6 | Bans 1 | Azul, Vermelho, Azul, Vermelho, Azul, Vermelho |
| 7–12 | Picks 1 | Azul, Vermelho, Vermelho, Azul, Azul, Vermelho |
| 13–16 | Bans 2 | Vermelho, Azul, Vermelho, Azul |
| 17–20 | Picks 2 | Vermelho, Azul, Azul, Vermelho |

**Configuração antes de começar:**
- o lado do usuário (azul ou vermelho);
- o time do usuário (carregado da página Time; é opcional, mas sem ele não há sugestões de conforto);
- opcionalmente, o **time inimigo** (multi OP.GG/Riot IDs). Se informado, o coach inimigo usa o pool deles;
- a dificuldade/estilo do coach: "meta" (escolhas fortes do patch), "counter" (foco em anular o seu time) ou "equilibrado".

**Interface:**
- Tabuleiro com os 10 bans e os 10 picks, destacando o turno atual e mostrando qual ação é a próxima.
- Grade de campeões com busca e filtro por rota; campeões já escolhidos ou banidos ficam desativados.
- Ao fazer um pick, o usuário escolhe para qual **jogador/rota** ele vai (dá para trocar no fim, como no jogo).
- Botão **Desfazer** (volta a última ação do usuário e a resposta da IA que veio depois).
- Painel lateral com o **radar da composição** dos dois times atualizado a cada pick (usando o motor da seção 7).

**Turno do usuário: sugestões (`POST /api/suggest`).**
- **Ban:** até 5 sugestões, cada uma com o motivo. Fontes: o meta (OP.GG), os mains/conforto do time inimigo (se informado), os campeões que counteram o pool do usuário e os que encaixam bem na composição que o inimigo está montando.
- **Pick:** até 5 sugestões **por rota em aberto**, ordenadas por uma pontuação que combina:
  - conforto do jogador daquela rota;
  - força no meta;
  - resposta ao que o inimigo já pegou (counters e matchup de rota);
  - encaixe na composição (cobre fraquezas como falta de frontline, de engage ou de tipo de dano).

  Mostre a pontuação decomposta (ex.: "Conforto 80 · Meta 60 · Counter +15 · Encaixe +10") e uma linha de explicação.
- Primeiro calcule a pontuação de forma **determinística** (regras + dados do OP.GG). A IA só escreve a explicação curta e é opcional; se falhar, mostre só os números.

**Turno do inimigo: coach IA (`POST /api/coach`).**
- Envie à IA: o estado completo do draft, a ordem e a próxima ação, as análises de composição dos dois lados, o pool do time inimigo (se houver), os dados de meta e counters relevantes e a lista de campeões disponíveis.
- A IA responde em **JSON validado com zod**: `{ "action": "ban" | "pick", "championId": "...", "role": "...", "reasoning": "..." }`. Use `generateObject` do AI SDK.
- Se o campeão for inválido ou já tiver sido usado, tente de novo uma vez e, se falhar, escolha pela melhor pontuação determinística.
- O `reasoning` aparece numa caixa de "fala do coach" (2 a 3 frases, no idioma da interface).
- Mostre um indicador de "coach pensando…" e permita cancelar.

**Matchups:** clicar em um confronto de rota (ex.: o seu mid contra o mid inimigo) abre um painel com os dados de `/api/matchup`: vantagem estimada, power spikes e dicas.

**Fim do draft:** botão **Analisar este draft**, que leva ao analisador já preenchido.

### 8.3 Analisar draft (`/analisar`)

**Entrada:**
- 10 bans e 10 picks com rotas, montados num tabuleiro como o do simulador, mas livre (sem ordem obrigatória);
- opção de colar um texto simples, com uma linha por time: `Azul: Aatrox, Lee Sin, Ahri, Jinx, Thresh`;
- opcional: os Riot IDs dos jogadores, para considerar o conforto de quem jogou cada campeão;
- opcional: o resultado (vitória do azul ou do vermelho).

**Saída (`POST /api/analyze`):**
1. **Visão geral:** a nota de cada draft (seção 7.2) e quem saiu na frente no draft, com o motivo.
2. **Composição de cada time:** arquétipo, curva de força, perfil de dano, radar e fraquezas/forças.
3. **Condições de vitória:** como cada time precisa jogar para ganhar.
4. **Como jogar contra:** o que cada lado deve evitar.
5. **Matchups de rota:** os 5 confrontos com a vantagem estimada.
6. **Pontos de virada do draft:** picks ou bans que mais mudaram o equilíbrio e alternativas que teriam sido melhores.
7. Se o resultado foi informado: "o draft explica o resultado?" (sem afirmar causalidade de forma absoluta).

Os itens 1, 2 e 5 vêm do motor de regras e dos dados; os itens 3, 4, 6 e 7 vêm da IA, que recebe a análise de regras como contexto. Exiba a parte de regras imediatamente e a parte da IA por **streaming** (`streamText`) logo em seguida.

Botão **Copiar análise** (texto em Markdown) para colar no Discord do time.

### 8.4 Regras gerais para os prompts (`lib/ai/prompts.ts`)

- Papel: "analista/coach profissional de League of Legends, objetivo e direto".
- Sempre envie os **dados calculados** (composição, meta, counters, conforto) e peça que a IA **se baseie neles**, sem inventar estatísticas. Se um dado não existir, ela deve dizer que é uma avaliação qualitativa.
- Responda no idioma `locale`.
- Respostas curtas e escaneáveis (tópicos), sem enrolação.
- Mantenha os prompts em funções separadas, com testes de snapshot para o texto montado.

---

## 9. Fases de implementação

### Fase 0: base do projeto
- [ ] Criar o projeto Next.js + TypeScript + Tailwind + ESLint (se o repositório estiver vazio).
- [ ] Configurar o `next-intl` com `pt` (padrão) e `en`, o layout com cabeçalho (navegação: Início, Time, Simulador, Analisar; seletor de idioma) e um rodapé com o aviso "Não afiliado à Riot Games nem ao OP.GG".
- [ ] Criar `.env.example` (seção 4.2) e conferir que `.env*.local` está no `.gitignore`.
- [ ] Implementar `lib/ai/provider.ts` com troca de provedor por env e uma rota de teste `GET /api/health` que diz quais serviços estão configurados (sem expor as chaves).
- [ ] Implementar o cliente do OP.GG MCP (`lib/data/opgg.ts`) e o `scripts/list-opgg-tools.ts`; rodar o script e salvar `docs/opgg-tools.json`.
- [ ] Implementar `lib/data/ddragon.ts` (versão atual, lista de campeões nos dois idiomas, URLs de ícone e splash) e o cache.
- [ ] Configurar o Vitest.

**Aceite:** `npm run dev` abre o site nos dois idiomas; `/api/health` responde; `docs/opgg-tools.json` existe; lint, build e testes passam.

### Fase 1: página Time
- [ ] `lib/riot-id.ts` com parser e testes (seção 8.1).
- [ ] Tipos neutros (seção 5.3), conversão OP.GG → tipos e `toDDragonId()` com testes.
- [ ] `POST /api/players` (até 5 jogadores, em paralelo, com cache e erro por jogador sem derrubar os outros).
- [ ] Fórmula de conforto, com testes.
- [ ] Interface completa da página (seção 8.1), salvando no `localStorage`.

**Aceite:** colar um link de multi OP.GG real do BR mostra os 5 cartões com elo, pool e conforto; um nick inexistente mostra erro só no cartão dele.

### Fase 2: dados de campeão e matchup
- [ ] `GET /api/champion?id=&role=` → `ChampionMeta`.
- [ ] `GET /api/matchup?role=&a=&b=` → `LaneMatchup`.
- [ ] Componente reutilizável `<ChampionCard>` e `<MatchupPanel>`.

**Aceite:** os dois endpoints retornam dados reais e respeitam o cache.

### Fase 3: atributos e motor de composição
- [ ] Gerar `data/champion-attributes.json` para todos os campeões (seção 6), com validação zod.
- [ ] `scripts/sync-champions.ts`.
- [ ] `lib/comp/analyze.ts` e `compareComps()` com as regras da seção 7 e **testes para pelo menos 6 composições conhecidas** (ex.: engage clássica, poke, protect the ADC, full AD, sem frontline, split push).
- [ ] Componente `<CompRadar>` (Recharts) e `<CompSummary>`.

**Aceite:** os testes passam; uma composição full AD gera `full_ad`; uma sem tanque gera `no_frontline`.

### Fase 4: analisar draft
- [ ] Tabuleiro livre de draft (componente reaproveitável pelo simulador).
- [ ] Parser do texto colado (`Azul: ...`), com testes e nomes em PT/EN.
- [ ] `POST /api/analyze` com a parte de regras + streaming da IA (seção 8.3).
- [ ] Botão **Copiar análise**.

**Aceite:** inserir um draft completo mostra a análise de regras na hora e a da IA em seguida; sem chave de IA, a parte de regras continua aparecendo com o aviso.

### Fase 5: simulador
- [ ] `lib/draft/order.ts` e `lib/draft/state.ts` (reducer com desfazer), com testes.
- [ ] Tela de configuração (lado, time, time inimigo opcional, estilo do coach).
- [ ] Tabuleiro, grade com busca/filtro e painel de composição ao vivo.
- [ ] `POST /api/suggest` com pontuação determinística decomposta + explicação opcional da IA.
- [ ] `POST /api/coach` com `generateObject`, validação e reserva determinística.
- [ ] Painel de matchup ao clicar nos confrontos.
- [ ] Botão **Analisar este draft** → `/analisar` preenchido.

**Aceite:** dá para completar um draft inteiro dos dois lados; o coach nunca escolhe um campeão indisponível; as sugestões mudam conforme o draft avança.

### Fase 6: acabamento e deploy
- [ ] Estados de carregamento, vazio e erro em todas as páginas.
- [ ] Layout responsivo (funciona no celular).
- [ ] Revisão das traduções (nenhum texto fixo).
- [ ] Página inicial explicando as 3 funções, com links.
- [ ] `README.md` com a configuração local, as variáveis de ambiente e o deploy na Vercel.
- [ ] Deploy na Vercel com as variáveis configuradas.

**Aceite:** o build de produção passa, o site funciona na URL da Vercel e o README permite que outra pessoa rode o projeto.

---

## 10. Ideias para depois (não fazer agora)

- Modo **fearless draft** (campeões usados em jogos anteriores da série ficam bloqueados).
- Trocar ou complementar o OP.GG pela **API oficial da Riot** (`lib/data/riot.ts`) usando os mesmos tipos.
- Histórico de drafts simulados salvo (exigiria banco de dados).
- Modelo próprio de vitória por composição, treinado com partidas coletadas (pipeline em Python).
