# Marketing Analytics — Auditoria Crítica & Blueprint de Plataforma

> Documento de arquitetura de produto, design e engenharia.
> Autor: revisão sênior (Tech Lead / Software Architect / Product & UX/UI Design / Segurança / SaaS).
> Versão: 1.0 — 2026-06-22. Base auditada: branch `main` (`f22a34a`).

## Como ler este documento

Ele tem **duas camadas deliberadas**, porque seria irresponsável recomendar reescrever uma ferramenta interna de um time como um SaaS multi-tenant de microsserviços "porque é enterprise":

- **Parte 0 — Auditoria do que existe hoje** e melhorias *proporcionais ao escopo atual* (ferramenta interna de 1 time de Marketing).
- **Partes 1–20 — Blueprint enterprise/SaaS** (o "norte"): como seria a plataforma se for **produtizada** (multi-tenant, vendável a outras empresas), com o caminho de migração faseado.

A regra de ouro do documento: **toda decisão é justificada e proporcional ao estágio**. Avançar de estágio é uma decisão de negócio, não de vaidade técnica.

---

# PARTE 0 — AUDITORIA CRÍTICA DO ESTADO ATUAL

## 0.1 Sumário executivo

O produto atual é um **dashboard analítico de produtividade** do time de Marketing, consumindo dados do Runrun.it via APIs serverless na Vercel, com frontend estático em JS puro e gráficos SVG nativos. Para o escopo "ferramenta interna de um time", ele é **competente, funcional e tem decisões acertadas** (sem dependências desnecessárias, lógica de métricas testada, design já repaginado). 

Mas, avaliado com régua **enterprise**, há lacunas estruturais — sendo a mais grave a **ausência total de autenticação/autorização sobre dados de avaliação de pessoas** (risco de privacidade/LGPD), seguida pela **ausência de persistência própria** (todo cálculo depende de bater no Runrun.it em tempo real, esbarrando no rate limit de 100 req/min) e pela **fragilidade do parsing de histórico** (regex sobre texto livre localizado).

### Notas por dimensão (0–10, régua enterprise)

| Dimensão | Nota | Comentário |
|---|---|---|
| Arquitetura | 5 | Serverless simples e adequada ao escopo, mas sem camada de dados/ingestão; acoplada ao Runrun.it em runtime. |
| Qualidade de código | 6 | Lógica de negócio testada (41 testes) e defensiva. Frontend monolítico em `app.js` (~1.1k linhas), sem tipos, sem build. |
| UX/UI | 7 | Redesign recente elevou muito o nível; consistência boa. Falta dark mode, acessibilidade formal e estados de carregamento ricos. |
| Segurança | 2 | **Sem autenticação/autorização.** Tokens via env (ok). Sem auditoria de acesso, sem LGPD. |
| Performance | 5 | SVG nativo é leve; porém auto-refresh de 15s + cálculo on-the-fly + rate limit do Runrun limitam. Sem cache/persistência. |
| Escalabilidade | 3 | Single-tenant, sem banco, sem fila de ingestão. Não escala para múltiplos times/empresas. |
| Observabilidade | 2 | Sem error tracking, métricas de produto ou logs estruturados além do console da Vercel. |
| Confiabilidade dos dados | 5 | "Prazo atual" como aproximação do "primeiro prazo"; histórico reconstruído de comentários (frágil). |
| DevEx / Entrega | 4 | Testes existem mas **não rodam em CI**; `main` não publica em produção automaticamente; sem staging formal. |

## 0.2 Pontos fortes (manter)

1. **Zero dependências de runtime no core** — reduz superfície de ataque, custo e manutenção. Decisão correta para o estágio.
2. **Lógica de métricas isolada e testada** (`src/analytics.cjs`, `src/history.cjs`, 41 testes determinísticos) — o ativo mais valioso do projeto; é o "cérebro" e está protegido por testes.
3. **Gráficos SVG próprios** — sem Chart.js/D3, sem peso de bundle, totalmente temáveis.
4. **Decisões de produto maduras** — produtividade orientada a confiabilidade de prazo (não a volume), pausa de prazo entre quadros, separação execução (Bruno) × entrega (meninas). Isso é raro e bom.
5. **Sanitização de credenciais** em mensagens de erro (`sanitizeApiError`).

## 0.3 Pontos de melhoria e dívidas técnicas (priorizados)

### 🔴 Críticos (resolver antes de qualquer ampliação de uso)

- **D1 — Sem autenticação/autorização.** O dashboard expõe **avaliação individual de produtividade de pessoas nominais**. Hoje a única barreira é o "Deployment Protection" da Vercel (e, em produção, possivelmente nem isso). Qualquer pessoa com a URL vê o desempenho de cada colaborador. **Risco jurídico (LGPD) e humano.** É a prioridade nº 1.
- **D2 — Sem persistência própria + acoplamento síncrono ao Runrun.it.** Cada request recalcula tudo batendo na API do Runrun, que limita a **100 req/min**. Isso já causou 429 e exige os *workarounds* atuais (histórico só no foreground, teto de cards). É frágil por design: indisponibilidade/lentidão do Runrun derruba o painel; não há histórico próprio nem "primeiro prazo".
- **D3 — LGPD/Privacidade.** Dados pessoais sensíveis (desempenho) sem base legal documentada, sem controle de acesso por papel, sem trilha de auditoria de quem viu o quê, sem política de retenção.

### 🟠 Altos

- **D4 — Parsing de histórico frágil.** `src/history.cjs` depende de regex sobre texto de comentário **localizado em pt-BR** ("moveu a tarefa da etapa..."). Qualquer mudança de wording/idioma/versão do Runrun quebra silenciosamente (degrada para "sem histórico"). Sem testes contra payloads reais (tokens são criptografados e não saem da Vercel).
- **D5 — CI/CD incompleto.** Os 41 testes **não rodam automaticamente** no push; `main` aparentemente **não publica em produção** sozinha. Risco de regressão silenciosa e de "achar que subiu".
- **D6 — Regras de negócio hardcoded.** IDs de board (`601838`, `606409`), pesos do score (`80/20`), nomes de colaboradores, limite de 1 dia em aprovação — tudo no código. Mudança operacional exige deploy. Deveria ser configuração.
- **D7 — Frontend monolítico sem tipos.** `app.js` (~1.1k linhas) com estado global mutável e render via `innerHTML`. `escapeHtml` mitiga XSS, mas é manual e fácil de esquecer. Sem TypeScript em lógica financeira/avaliativa.

### 🟡 Médios

- **D8 — Acessibilidade não auditada** (contraste, foco, navegação por teclado nos gráficos/SVG, `aria` em tabelas dinâmicas). Sem testes axe.
- **D9 — Sem dark mode** (pedido recorrente em produtos premium).
- **D10 — Sem observabilidade** (Sentry/log estruturado/RUM). Erros do usuário são invisíveis para o time.
- **D11 — Auto-refresh agressivo** (15s) mesmo com aba em background; deveria pausar com `visibilitychange` e usar `ETag`/`stale-while-revalidate`.
- **D12 — "Prazo atual" ≠ "primeiro prazo"** — métrica de pontualidade pode ser distorcida por renegociação de prazo. Resolúvel com persistência (D2).

## 0.4 Matriz de risco

| ID | Risco | Probabilidade | Impacto | Mitigação |
|----|-------|---------------|---------|-----------|
| D1 | Vazamento de avaliação de pessoas | Média | Crítico | Auth + RBAC + Deployment Protection imediato |
| D2 | Painel cai por rate limit/Runrun fora | Alta | Alto | Ingestão assíncrona + banco (Estágio 2) |
| D3 | Não conformidade LGPD | Média | Crítico | Base legal, acesso por papel, retenção, auditoria |
| D4 | Histórico quebra com mudança no Runrun | Média | Médio | Testes de contrato + fallback estruturado (já existe parcialmente) |
| D5 | Regressão vai para produção | Média | Alto | CI com testes obrigatórios + deploy via PR |

## 0.5 Plano de ação proporcional (sem virar SaaS)

Se o objetivo for **manter como ferramenta interna**, o ROI está em (nesta ordem):

1. **Auth simples** (Vercel Password Protection ou Auth.js + allowlist de e-mails @avalyst) — fecha D1 em horas.
2. **CI** (GitHub Actions rodando `node --test` no PR) + **proteção de branch** + corrigir auto-deploy da `main` — fecha D5.
3. **Cache/persistência leve** (Vercel KV/Postgres serverless com um snapshot a cada N min) — alivia D2/D11 e habilita histórico.
4. **Externalizar configuração** (boards, pesos, pessoas, limites) para env/UI — fecha D6.
5. **Dark mode + auditoria de acessibilidade** — fecha D8/D9.

Só **depois**, e se houver intenção de **vender para outras empresas**, parte-se para o blueprint a seguir.

---

# PARTE 1 — BLUEPRINT ENTERPRISE / SaaS

> Cenário: produtizar como **"Cadence" — plataforma de analytics de fluxo e produtividade de times**, multi-tenant, integrável a múltiplas fontes (Runrun.it, Jira, ClickUp, Asana, Linear). O que segue é o produto-alvo.

## 1. Visão geral do produto

**Cadence** é uma plataforma SaaS de **inteligência operacional para times de execução** (Marketing, Criação, Produto, Ops). Ela conecta as ferramentas de gestão de tarefas que a empresa já usa, normaliza os dados num modelo próprio de fluxo (Kanban/flow metrics) e entrega **leitura executiva da saúde do time**: confiabilidade de prazo, gargalos, carga, vazão e tempo de ciclo — com **comparativos automáticos**, **insights gerados** e **relatórios programados**.

Diferencial: não é "mais um dashboard de tarefas". É **opinião de produto sobre o que importa** (entregar no prazo, não produzir volume), com **modelos de papel** (quem entrega × quem executa) e **regras de atribuição justas de tempo** (pausar prazo entre quadros, excedente de aprovação) — exatamente as decisões maduras já presentes no MVP.

**Posicionamento de marca/visual:** sóbrio, denso em dados mas respirável — referência direta a **Linear** (rigor, velocidade, teclado-first), **Stripe** (clareza de dados e microcopy), **Vercel/Framer** (motion sutil e superfícies). Nada de "dashboard genérico colorido".

## 2. Objetivos de negócio

| Objetivo | Métrica (North Star / KRs) |
|---|---|
| Tornar a saúde do time **visível e acionável** | NSM: % de times que abrem o painel ≥ 3×/semana |
| Reduzir atrasos de entrega | -20% em "abertas vencidas" em 90 dias por workspace |
| Monetização recorrente | MRR; conversão trial→pago ≥ 20%; NRR ≥ 110% |
| Eficiência operacional | CAC payback < 12 meses; margem bruta > 80% (SaaS) |
| Confiança/retenção | Churn lógico < 3%/mês; CSAT ≥ 4,5/5 |

## 3. Público-alvo

**Personas:**

- **Marina — Head/Gestora de Marketing (compradora e usuária-chave).** Quer, em 30s, saber se o time vai bater os prazos e onde está o gargalo. Não quer planilha. Valoriza relatório automático e comparativo. *Dor:* "descubro o atraso tarde demais".
- **Bruno — Executor/Designer (usuário monitorado).** Quer que a régua seja **justa** (não ser penalizado por espera de aprovação alheia). *Dor:* "métrica de volume me pune por trabalho difícil".
- **Allana — Analista/PO (usuária operacional).** Vive no quadro; quer alertas e a fila priorizada. *Dor:* "esqueço cards parados em aprovação".
- **Téo — Diretor/C-level (sponsor).** Quer visão de portfólio entre times e tendência. *Dor:* "não tenho leitura agregada confiável".
- **Sam — Admin de Workspace (TI/Ops).** Conecta integrações, gerencia papéis e billing. *Dor:* "configurar e governar acesso a dado sensível".

**Mercado-alvo:** empresas de 50–2.000 colaboradores com times de execução criativos/operacionais usando ferramentas de tarefa modernas (PLG bottom-up + venda para gestores).

## 4. Funcionalidades principais

1. **Conectores de fonte** (Runrun.it, Jira, ClickUp, Asana, Linear) com OAuth + ingestão incremental.
2. **Modelo de fluxo normalizado** (board → stage → card → assignment → events) independente da fonte.
3. **Métricas de fluxo**: throughput, cycle time, WIP, flow efficiency, on-time, backlog health, aging, gargalos por etapa.
4. **Modelos de papel e regras** (entrega × execução; pausa de prazo entre quadros; SLA por coluna) — configuráveis por workspace (sem deploy).
5. **Comparativos automáticos** vs. período anterior e **insights gerados**.
6. **Relatórios programados** por e-mail (semanal/mensal) com templates editáveis.
7. **Alertas** (in-app, e-mail, Slack) por regra (vencidos, aprovação parada, backlog crítico).
8. **Visões**: Overview, Pessoas, Fluxo, Alertas, Auditoria (drill-down até o card e seu histórico).
9. **Administração**: workspaces, papéis (RBAC), billing, integrações, retenção/LGPD, audit log.
10. **Command palette** (⌘K), atalhos de teclado, dark/light.

## 5. Arquitetura da informação

```
Workspace (tenant)
├── Conexões (fontes de dados)
├── Times / Boards (normalizados)
│   └── Cards → Assignments → Events (timeline)
├── Pessoas (membros monitorados) ── papéis (entrega/execução)
├── Visões
│   ├── Overview (KPIs + insights + tendência + composição)
│   ├── Pessoas (cards por pessoa → detalhe individual)
│   ├── Fluxo (gargalos, WIP, cycle time, distribuição)
│   ├── Alertas
│   └── Auditoria (tabela de cards + timeline)
├── Relatórios (templates, agendamentos, histórico de envio)
└── Configurações
    ├── Regras (papéis, SLAs, pesos do score, períodos)
    ├── Integrações (OAuth, sync status)
    ├── Membros & Papéis (RBAC)
    ├── Billing
    └── Governança (LGPD, retenção, audit log)
```

**Navegação:** sidebar fixa (workspace switcher no topo), ⌘K para ir a qualquer lugar, breadcrumbs em drill-down, filtros globais persistidos por usuário (período + quadro/escopo).

## 6. Jornada do usuário (fluxos-chave)

**A. Onboarding (Sam/Marina) — "time-to-value < 10 min":**
`Signup (SSO) → cria Workspace → conecta fonte (OAuth Runrun.it) → seleciona boards/pessoas → mapeia papéis (entrega/execução) → 1ª sincronização (skeleton + progress) → Overview populado com insight "primeiro diagnóstico".`
*Por quê:* o "aha" é ver o diagnóstico real com 1 clique; toda fricção antes disso mata ativação.

**B. Rotina diária (Allana):** `Login → Overview (status do dia) → Alertas (o que travou) → ação (aprovar/repriorizar) → fecha.` Otimizada para < 60s, teclado-first.

**C. Fechamento semanal (Marina):** `Relatório chega no e-mail segunda 8h → abre Pessoas → compara vs. semana anterior → exporta/compartilha.`

**D. Investigação (qualquer):** `Métrica suspeita → clica → drill-down → card → timeline (eventos da fonte) → entende a causa.` *Por quê:* confiança exige rastreabilidade até o dado bruto (a aba Auditoria atual já acerta nisso).

## 7. Wireframes descritivos (protótipo textual)

**Overview (densidade Linear/Stripe):**
```
┌───────────────────────────────────────────────────────────────────────┐
│ [⌘K]  Workspace ▾    Marketing ▾        Período: Semana ▾   ◐ 🔔 ⚙ 👤   │  ← topbar
├──────────┬────────────────────────────────────────────────────────────┤
│ ◈ Overview│  Marketing · Esta semana · 16–22 jun        ● Sincronizado  │
│ ◍ Pessoas │  ┌── Insights ───────────────────────────────────────────┐ │
│ ⇄ Fluxo   │  │ ★ Bruno lidera execução (55%)  ⚠ 55% do backlog vencido│ │
│ ! Alertas │  │ ⇄ Gargalo: "A Fazer" (58%)     ↗ Prazo +29pts vs ant.  │ │
│ ≣ Auditoria│ └────────────────────────────────────────────────────────┘ │
│           │  ┌Produtiv.┐┌Entregues┐┌No prazo┐┌Vencidas┐   ← KPIs c/ Δ    │
│           │  │  30% ▲  ││   7  =  ││ 29% ▼  ││  17 ▲  │                  │
│           │  └─────────┘└─────────┘└────────┘└────────┘                  │
│           │  ┌Saúde da produtiv.(donut)┐┌Composição┐┌Comparativo pessoas┐│
│           │  ┌──────────── Tendência diária (área+linha) ──────────────┐ │
│           │  ┌──────────── Tarefas que afetam o fluxo ─────────────────┐ │
└──────────┴────────────────────────────────────────────────────────────┘
```
Justificativa: KPIs primeiro (resposta em 5s), insights no topo (acionável), gráficos abaixo (aprofundamento), tabela por último (prova). Mesma hierarquia "resumo → evidência → detalhe" do MVP, refinada.

**Detalhe individual (Pessoas):** ring de score + sparkline + 6 KPIs + tendência + composição/eficiência + "tarefas que afetam o fluxo" + breakdowns + tarefas recentes. Para papel "execução", troca régua de prazo por eficiência/aging (já implementado no MVP).

**Empty state (sem integração):** ilustração + 1 CTA "Conectar Runrun.it" + 3 bullets de valor. **Nunca** uma tela em branco.

## 8. Design System completo ("Cadence DS")

### Princípios
Clareza > densidade > beleza, nessa ordem. Cor com **significado** (status), nunca decorativa. Movimento que **explica** (origem/destino), nunca enfeite.

### Cores (tokens semânticos, light/dark)
```
# Base (neutros — escala cool gray)
--bg            #F7F8FA   / dark #0B0E14
--surface       #FFFFFF   / dark #11151D
--surface-2     #F1F4F8   / dark #161B25
--border        #E4E9F0   / dark #232A36
--text          #0E1726   / dark #E6EAF2
--text-muted    #5B6B7E   / dark #9AA7B8

# Marca / primária
--brand         #2F74E0   (azul) ; --brand-strong #1F5FCE
--accent        #F0513D   (coral, identidade Avalyst)

# Semânticas (status)
--success #16A36B  --warning #D28A16  --danger #DC3A39  --info #2F74E0
(cada uma com -soft para fundos: ex. success-soft #E3F6EE)
```
Regra: contraste mínimo **WCAG AA** (4.5:1 texto). Tokens semânticos (não usar hex cru em componente).

### Tipografia
- **Inter** (UI) + **Geist Mono / JetBrains Mono** (números/código). `font-variant-numeric: tabular-nums` em toda métrica.
- Escala (1.25 minor third): 12 / 13 / 14 / 16 / 20 / 25 / 31 / 39px. Pesos 400/600/700/800.
- Títulos com `letter-spacing: -0.02em`; corpo 1.5 de linha.

### Grid & espaçamento
- Espaçamento base **4px** (escala 4/8/12/16/20/24/32/48/64). Raio 8/12/16. Sombras em 3 níveis (sm/md/lg).
- Layout 12 colunas, container máx. 1280–1440px; sidebar 268px.

### Ícones
Sistema único (**Lucide** — open source, consistente, tree-shakeable), traço 1.75px, 20/24px. Nunca misturar famílias.

### Componentes (estados obrigatórios: default / hover / focus-visible / active / disabled / loading / error)
- **Botões:** primário (gradiente sutil), secundário (ghost), terciário (link), destrutivo, ícone. Foco com ring `0 0 0 3px brand/30`.
- **Inputs/Select/Textarea/Date:** label flutuante, mensagem de erro inline, estados de validação.
- **Cards** (KPI, métrica, pessoa): faixa de acento por status, hover-lift, número tabular.
- **Tabela:** header sticky, zebra hover, ordenação, densidade ajustável, paginação/virtualização, seleção em massa, busca.
- **Modal/Drawer:** backdrop blur, foco-trap, Esc, animação de entrada.
- **Dropdown/Menu/Command palette (⌘K):** navegação por teclado completa.
- **Sidebar:** colapsável, indicador ativo, badges.
- **Wizard:** passos com progresso, validação por etapa (onboarding/integração).
- **Tooltip:** atraso 300ms, dismiss por foco.
- **Toast/Feedback:** sucesso/erro/info, ação de desfazer quando aplicável.
- **Empty / Loading (skeleton com shimmer) / Error states** para **todo** container de dados.

### Motion
Durações 120–280ms, `cubic-bezier(0.4,0,0.2,1)`. `fade-rise` em troca de view, `pulse` no status, transição de largura nas barras. **Respeitar `prefers-reduced-motion`** (já feito no MVP).

### Dark mode
Não é "inverter cores": superfícies elevadas mais claras, sombras viram brilhos sutis, saturação reduzida. Token-driven via `data-theme`/`prefers-color-scheme`, persistido por usuário.

## 9. Protótipo textual das telas (resumo)
- **Login/SSO** → **Onboarding wizard** (4 passos) → **Overview** → **Pessoas/Fluxo/Alertas/Auditoria** → **Configurações** (Integrações, Regras, Membros, Billing, Governança) → **Modal de relatório** (template + agendamento + teste). Todas com empty/loading/error.

## 10. Arquitetura Frontend

**Stack:** **Next.js (App Router) + TypeScript + React Server Components**. *Por quê:* SSR/streaming para "first paint" rápido com dados, RSC reduz JS no cliente, ecossistema Vercel (continuidade do deploy atual), DX e contratação.

- **UI:** Tailwind CSS + **shadcn/ui** (Radix por baixo → acessibilidade pronta) + tokens do Cadence DS. Gráficos: manter **SVG próprios** (já são um ativo) encapsulados em componentes; **Recharts/visx** só se a complexidade justificar.
- **Estado:** **TanStack Query** (server state/cache/refetch/SWR) + **Zustand** (UI state leve). Sem Redux (overkill).
- **Forms/validação:** React Hook Form + **Zod** (mesmos schemas compartilhados com o backend).
- **Estrutura de pastas:**
```
apps/web/
  app/(marketing) | app/(app)/[workspace]/{overview,people,flow,alerts,audit,settings}
  components/{ui, charts, layout}
  features/{analytics, reports, integrations, billing}
  lib/{api-client, hooks, formatters, auth}
  styles/tokens.css
packages/
  ui/ (design system)      core/ (tipos, métricas — porta o analytics.cjs p/ TS)
  config/ (eslint, tsconfig)
```
- **Qualidade:** ESLint + Prettier, **Playwright** (e2e), **Vitest** (unit), **Storybook** (DS) + **axe** (a11y) + Chromatic (regressão visual).

## 11. Arquitetura Backend

**Decisão: monólito modular** (não microsserviços) no Estágio 2, com **worker de ingestão separado**. *Por quê:* microsserviços prematuros adicionam latência, custo operacional e complexidade sem ganho real no volume inicial. Modular bem feito permite extrair serviços depois.

- **Stack:** **TypeScript + Node** (NestJS *ou* Next API + tRPC). tRPC se o cliente é só o próprio web (type-safety ponta a ponta); NestJS se haverá API pública/parceiros.
- **Módulos:** `auth`, `workspaces`, `integrations` (conectores), `ingestion` (sync), `analytics` (motor de métricas — reuso do core), `reports`, `alerts`, `billing`, `audit`.
- **Ingestão (chave para resolver D2):** **worker assíncrono** (BullMQ/Redis ou Vercel Cron + Queue) que sincroniza cada fonte **incrementalmente** (webhooks do Runrun + polling de fallback), normaliza para o modelo interno e **persiste**. As telas leem do **nosso banco**, nunca do Runrun em runtime → fim do rate limit e do acoplamento.
- **APIs:** REST/tRPC versionado; webhooks de entrada (fontes) e saída (Slack); idempotência por `event_id`.
- **Cache:** Redis (sessão, rate limit, resultados de métricas computadas por período).
- **Filas:** ingestão, geração de relatórios, envio de e-mail/alertas.
- **Logs:** estruturados (pino) com `correlationId`/`workspaceId`, enviados a um coletor (Datadog/Better Stack).

## 12. Banco de dados

**Postgres** (relacional, multi-tenant por `workspace_id` + **Row-Level Security**). Time-series de métricas em tabelas particionadas por data; opcional **TimescaleDB** se o volume de eventos exigir.

**Modelo (núcleo):**
```sql
workspaces(id, name, plan, created_at)
users(id, email, name, ...)
memberships(user_id, workspace_id, role)         -- RBAC
integrations(id, workspace_id, source, oauth_tokens_encrypted, status, last_sync_at)
boards(id, workspace_id, source, external_id, name, role_kind)  -- delivery|execution
stages(id, board_id, name, position, sla_seconds)
people(id, workspace_id, external_id, name, role_kind)
cards(id, workspace_id, board_id, external_id, title, type, project, client,
      created_at, closed_at, first_due_at, current_due_at, estimate_seconds, worked_seconds)
assignments(id, card_id, person_id, started_at, ended_at)        -- duração de atribuição
card_events(id, card_id, ts, kind, from_stage, to_stage, board_id, duration_seconds, raw)
                                                  -- timeline normalizada (resolve "primeiro prazo" e pausa)
metric_snapshots(id, workspace_id, scope, period_start, period_end, payload_jsonb, computed_at)
report_templates(...) report_schedules(...) report_sends(...)
alerts(...) audit_log(id, workspace_id, actor_id, action, target, ts, ip)
```
- **Índices:** `cards(workspace_id, board_id, closed_at)`, `card_events(card_id, ts)`, `assignments(person_id, started_at)`, GIN em `payload_jsonb`. RLS por `workspace_id` em todas.
- **Escalabilidade:** particionamento de `card_events`/`metric_snapshots` por mês; réplica de leitura para analytics; tokens OAuth criptografados (pgcrypto/KMS).
- **Ganho-chave:** com `card_events` persistidos, **"primeiro prazo", pausa de prazo e tempo por etapa** deixam de depender de regex de comentário em runtime → robustez (resolve D4 e D12).

## 13. Infraestrutura

- **Cloud:** **Vercel** (web/edge) + **Postgres gerenciado** (Neon/Supabase/RDS) + **Redis** (Upstash) + **fila** (Upstash QStash/BullMQ) + **object storage** (S3/R2 para exports/anexos). Alternativa enterprise: AWS (ECS Fargate + RDS + ElastiCache + SQS).
- **CI/CD:** GitHub Actions → lint+typecheck+test+build → **preview por PR** → promote para produção via merge protegido. **Migrations** versionadas (Prisma/Drizzle) com revisão.
- **Ambientes:** dev → preview (efêmero por PR) → staging → produção.
- **Observabilidade:** Sentry (erros web+server), OpenTelemetry traces, métricas (Grafana/Datadog), uptime (Better Stack), RUM (Web Vitals).
- **Backup/DR:** PITR no Postgres, backups diários testados (restore drill trimestral), RPO ≤ 1h / RTO ≤ 4h, multi-AZ.

## 14. Segurança

- **AuthN:** SSO (Google/Microsoft) + e-mail mágico via **Auth.js/Clerk/WorkOS**; MFA opcional; SAML/SCIM no plano enterprise.
- **AuthZ:** **RBAC** por workspace (Owner, Admin, Manager, Member, Viewer) + **RLS no Postgres** como segunda linha de defesa. Princípio do menor privilégio: `Member` vê o próprio detalhe; só `Manager+` vê avaliação alheia.
- **LGPD:** base legal (legítimo interesse + contrato de trabalho) documentada; **DPA**; minimização; **retenção** configurável; direito de acesso/eliminação; **audit log** de acessos a dados pessoais; residência de dados (região BR quando exigido).
- **Criptografia:** TLS 1.2+ em trânsito; AES-256 em repouso; tokens de integração em cofre (KMS); segredos só em env/secret manager (nunca em código — já respeitado).
- **Sessões:** cookies `HttpOnly`/`Secure`/`SameSite`, rotação, expiração, revogação.
- **Proteções:** rate limiting por IP/usuário, CSRF, headers (CSP, HSTS, X-Frame-Options), validação Zod em toda borda, sanitização de saída (substitui o `escapeHtml` manual), proteção contra IDOR (RLS), dependabot/SCA, pentest anual.

## 15. Performance

- **Ingestão > runtime:** telas leem `metric_snapshots`/banco (resolve rate limit e latência). Métricas pré-computadas por período em cache (Redis) com invalidação no sync.
- **Frontend:** RSC + streaming, **code splitting**, lazy-load de gráficos pesados, imagens/ícones otimizados, **Web Vitals** orçados (LCP < 2.5s, INP < 200ms, CLS < 0.1).
- **Dados:** `stale-while-revalidate` + ETag; auto-refresh pausa em background (`visibilitychange`); paginação/virtualização na Auditoria.
- **Backend:** consultas indexadas, réplicas de leitura, `EXPLAIN ANALYZE` em queries quentes, N+1 eliminado.
- **CDN:** estáticos e edge cache de respostas públicas.
- **Escala horizontal:** web stateless (escala por réplicas), workers por fila, Postgres com réplicas + particionamento.

## 16. Roadmap de desenvolvimento

| Estágio | Objetivo | Entregas | Duração |
|---|---|---|---|
| **0 — Hardening do MVP** | Tornar seguro e confiável o que existe | Auth/allowlist, CI+testes, fix auto-deploy, dark mode, config externalizada, observabilidade básica (Sentry) | 2–3 sem |
| **1 — Persistência** | Quebrar acoplamento com Runrun | Postgres + worker de ingestão + `card_events` + snapshots; "primeiro prazo" real | 4–6 sem |
| **2 — Multi-tenant** | Virar produto | Workspaces, RBAC+RLS, onboarding, billing (Stripe), 2º conector | 8–12 sem |
| **3 — Escala/Enterprise** | Vender para grandes | SSO/SAML/SCIM, alertas Slack, API pública, SOC2 readiness, DR | contínuo |

## 17. Estrutura de sprints (2 semanas)

- **S1:** Auth + RBAC base + proteção de produção + CI. *DoD: ninguém sem login vê dado de pessoa.*
- **S2:** Schema Postgres + migrations + worker de ingestão Runrun (incremental + webhook). *DoD: telas leem do banco.*
- **S3:** Porta do motor de métricas para `packages/core` (TS) + testes de contrato com fixtures reais.
- **S4:** Next.js + DS (shadcn/tokens) + Overview/Pessoas com paridade ao MVP. 
- **S5:** Fluxo/Alertas/Auditoria + drill-down + virtualização.
- **S6:** Relatórios (templates/agendamento/Resend) + alertas Slack.
- **S7:** Onboarding wizard + integrações UI + multi-workspace.
- **S8:** Billing + governança/LGPD + audit log + hardening.
- Cada sprint: planning, refinement, review com demo, retro; *feature flags*; *trunk-based*.

## 18. Critérios de qualidade (Definition of Done)

- Cobertura de testes do core ≥ 90%; e2e dos fluxos críticos verdes.
- Lint/typecheck/test **bloqueantes** no CI; sem `any` em lógica de métricas.
- a11y AA (axe sem violações críticas); navegável por teclado; contraste validado.
- Web Vitals dentro do orçamento; bundle monitorado.
- Sem segredo em código; revisão de segurança em PR que toca auth/dados pessoais.
- Toda tela com empty/loading/error; toda mutação com feedback (toast) e tratamento de erro.
- Migrations reversíveis; feature atrás de flag; documentação do componente no Storybook.

## 19. Riscos técnicos

| Risco | Mitigação |
|---|---|
| **Limites/instabilidade das fontes** (Runrun 100 req/min, mudanças de API) | Ingestão incremental + webhooks + backoff; testes de contrato; abstração de conector |
| **Fidelidade do histórico** (texto livre de comentário) | Persistir eventos; preferir endpoints estruturados; parser como fallback versionado |
| **Sensibilidade do dado (pessoas)** | RBAC+RLS, audit, LGPD por design, acesso mínimo |
| **Escopo do score virar política de RH** | Transparência da fórmula (já há tooltip explicativo), governança, não usar como única métrica de avaliação |
| **Over-engineering** | Avançar de estágio só com sinal de negócio (clientes pagantes) |
| **Multi-tenant data leak** | RLS obrigatório + testes automatizados de isolamento por tenant |

## 20. Recomendações futuras

1. **Benchmarks e metas adaptativas** (comparar com a própria baseline, não metas arbitrárias — coerente com a filosofia atual).
2. **Previsão** (forecast de risco de atraso por card via modelo simples → depois ML).
3. **Detecção de anomalias** em vazão/cycle time.
4. **App Slack/Teams** nativo (digest e alertas onde o time vive).
5. **Marketplace de conectores** + API pública.
6. **Modo "1:1"** (visão privada do colaborador sobre si — reforça justiça e adesão).
7. **SOC 2 Tipo II / ISO 27001** quando entrar em contas enterprise.
8. **IA de insights** (resumo executivo em linguagem natural — já há um gerador de insights heurístico que pode evoluir).

---

## Apêndice A — Veredito do arquiteto

O MVP atual está **acima da média para uma ferramenta interna** e tem um núcleo de produto **genuinamente diferenciado** (filosofia de prazo, papéis, justiça de atribuição). As três coisas que eu faria **esta semana**, independentemente de virar SaaS: **(1) colocar autenticação na frente**, **(2) ligar CI com os testes e corrigir o deploy de produção**, **(3) começar a persistir os eventos** (ainda que simples) para parar de depender do Runrun em runtime. O resto do blueprint é o mapa para quando — e **se** — a decisão for transformar isto em produto.
