# 🎬 Meu Stream

**Plataforma SaaS de streaming personalizado para gestão de assinantes de IPTV.**

O admin gerencia uma lista de clientes (usuário/senha/expiração). Os clientes fazem login e acessam um painel com catálogo de filmes/séries, agenda esportiva, CineRoleta e central de suporte.

---

## 🗂️ Sumário

- [Stack Tecnológica](#stack-tecnológica)
- [Como Rodar o Projeto](#como-rodar-o-projeto)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Arquitetura do Sistema](#arquitetura-do-sistema)
- [Fluxo de Autenticação](#fluxo-de-autenticação)
- [Edge Functions (Backend)](#edge-functions-backend)
- [Scripts Disponíveis](#scripts-disponíveis)

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Estilização | TailwindCSS + shadcn/ui |
| Animações | Framer Motion |
| Estado global | React Context API |
| Cache de dados | TanStack React Query |
| Backend | Supabase Edge Functions (Deno) |
| Banco de dados | Supabase (PostgreSQL) |
| Push Notifications | PushAlert |
| PWA | Service Worker nativo |

---

## Como Rodar o Projeto

### Pré-requisitos
- Node.js 18+
- npm ou bun

### Instalação

```bash
# Clone o repositório
git clone https://github.com/imvitoroliveira/watch-wish-play.git
cd watch-wish-play

# Instale as dependências
npm install

# Copie o arquivo de variáveis de ambiente
cp .env.example .env
# Edite .env com suas chaves do Supabase

# Inicie o servidor de desenvolvimento
npm run dev
```

O app estará disponível em `http://localhost:8081`

---

## Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-anon-key-aqui
VITE_SUPABASE_PROJECT_ID=seu-project-id
```

> ⚠️ **Nunca commite o `.env` com valores reais.** Use `.env.example` com valores vazios para documentar as variáveis necessárias.

---

## Estrutura do Projeto

```
watch-wish-play/
├── src/
│   ├── App.tsx                    # Roteamento principal + providers
│   ├── main.tsx                   # Entry point React
│   ├── index.css                  # Design tokens CSS + Tailwind
│   │
│   ├── pages/
│   │   ├── ClientLogin.tsx        # Login do assinante
│   │   ├── AdminPanel.tsx         # Painel do gestor
│   │   ├── Dashboard.tsx          # Painel do cliente logado
│   │   ├── ExpiredScreen.tsx      # Tela de acesso expirado
│   │   └── NotFound.tsx           # Página 404
│   │
│   ├── components/
│   │   ├── DashboardHeader.tsx    # Navegação + busca
│   │   ├── MovieCard.tsx          # Card de filme/série
│   │   ├── MovieGrid.tsx          # Grid responsivo de cards
│   │   ├── MovieModal.tsx         # Modal de detalhes + trailer
│   │   ├── CineRoleta.tsx         # Sorteador de filmes
│   │   ├── AgendaJogos.tsx        # Agenda de jogos do dia
│   │   ├── CatalogUpdates.tsx     # Atualizações do catálogo M3U
│   │   ├── SupportTickets.tsx     # Central de ajuda / tickets
│   │   ├── SystemTestsTab.tsx     # Testes do sistema (admin)
│   │   ├── OnlineStatusTab.tsx    # Usuários online (admin)
│   │   ├── PWAPrompts.tsx         # Prompt instalação + atualização PWA
│   │   ├── ExpirationBanner.tsx   # Banner de vencimento próximo
│   │   ├── RenewalModal.tsx       # Modal de renovação
│   │   └── CineTrailerChallenge.tsx # Quiz de trailers
│   │
│   ├── contexts/
│   │   └── AuthContext.tsx        # Estado global de autenticação
│   │
│   ├── hooks/
│   │   ├── useMovieState.ts       # Estado de filmes, busca e M3U
│   │   ├── useBillingEnabled.ts   # Flag de cobrança ativa
│   │   ├── usePushNotifications.ts# Integração PushAlert
│   │   ├── useJogosAtivos.ts      # Jogos ao vivo
│   │   ├── use-mobile.tsx         # Detecção de breakpoint mobile
│   │   └── use-toast.ts           # Sistema de toasts
│   │
│   ├── lib/
│   │   ├── tmdb.ts                # Cliente da API TMDB (via proxy)
│   │   ├── m3u-parser.ts          # Parser e cache do catálogo M3U
│   │   ├── football-api.ts        # API de futebol + mock data
│   │   └── utils.ts               # Utilitário cn() para classnames
│   │
│   └── integrations/supabase/
│       ├── client.ts              # Instância do cliente Supabase
│       └── types.ts               # Tipos gerados do schema do banco
│
├── supabase/
│   ├── config.toml                # Configuração do projeto Supabase
│   ├── migrations/                # Histórico de migrations do banco
│   └── functions/                 # Edge Functions (backend serverless)
│
└── public/
    ├── manifest.json              # Configuração PWA
    ├── sw.js                      # Service Worker
    └── robots.txt                 # Regras para crawlers
```

---

## Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────┐
│                   NAVEGADOR (PWA)                    │
│                                                      │
│  React App (Player V2 In-App com PiP Unificado)      │
│  ├── AuthContext  →  estado de login (sem senha)     │
│  ├── React Query →  cache de dados (TMDB, etc.)      │
│  └── VideoContext →  estado global de reprodução     │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS
┌────────────────────▼────────────────────────────────┐
│              SUPABASE EDGE FUNCTIONS                  │
│                                                      │
│  Autenticação:    admin-login, client-login          │
│  Dados:           manage-clients, parse-m3u          │
│  Conteúdo:        tmdb-proxy, football-matches       │
│  Notificações:    push-test, content-alerts          │
│  Pagamentos:      cakto-webhook, abacatepay-webhook  │
│  API Streaming:   stream-lookup, stream-proxy        │
└────────────────────┬────────────────────────────────┘
                     │ API Proxy Header Builder
┌────────────────────▼────────────────────────────────┐
│             CLOUDFLARE WORKER (CORS BYPASS)           │
│  → Modifica headers via proxy (A-C-A-O: *)            │
│  → Mascara o User-Agent (VLC/LibVLC)                  │
│  → Converte contentType mkv -> video/mp4              │
└────────────────────┬────────────────────────────────┘
                     │ Chamada limpa (sem rastros web)
┌────────────────────▼────────────────────────────────┐
│             SERVIDORES IPTV TERCEIRIZADOS (FONTE)     │
└────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│          SUPABASE POSTGRESQL (Banco de Dados)         │
│  ├── clients          → lista de assinantes          │
│  ├── m3u_catalog      → catálogo M3U processado      │
│  ├── m3u_updates      → histórico de atualizações    │
│  └── [outras tabelas...]                              │
└─────────────────────────────────────────────────────┘
```

---

## Fluxo de Autenticação

### Login do Cliente
```
1. Cliente digita usuário + senha
2. Frontend chama edge function client-login
3. Edge function valida no banco (tabela clients)
4. Se válido → retorna dados do cliente (SEM senha)
5. Frontend salva sessão no localStorage (SEM senha)
6. Redireciona para /dashboard
```

### Login do Admin
```
1. Admin digita usuário + senha
2. Frontend chama edge function admin-login
3. Edge function valida contra variável de ambiente (ADMIN_USER / ADMIN_PASS)
4. Se válido → retorna token e salva header x-admin-auth no sessionStorage
5. Admin acessa painel protegido
```

### "Lembre-se de mim"
```
✅ Salva: nome de usuário (para pré-preencher o campo)
❌ Nunca salva: senha (digitada a cada sessão por segurança)
```

---

## Edge Functions (Backend)

| Função | Método | Descrição |
|--------|--------|-----------|
| `admin-login` | POST | Valida credenciais do gestor |
| `client-login` | POST | Valida credenciais do assinante com rate limit |
| `manage-clients` | GET/POST | CRUD da lista de clientes |
| `parse-m3u` | GET/POST/DELETE | Parser e cache do catálogo M3U |
| `m3u-auto-refresh` | POST | Reprocessamento automático agendado do M3U |
| `tmdb-proxy` | POST | Proxy para API do TMDB (esconde a API key) |
| `football-matches` | GET | Busca jogos do dia na API de futebol |
| `match-reminders` | POST | Envia lembretes de jogo via push |
| `user-presence` | POST | Heartbeat de presença online dos clientes |
| `content-alerts` | POST | Alertas de chegada de conteúdo no catálogo |
| `push-test` | POST | Teste de push notifications |
| `google-sheets-sync` | POST | Exporta vencimentos para Google Sheets |
| `n8n-proxy` | POST | Proxy para automações n8n |
| `cakto-webhook` | POST | Webhook de pagamento Cakto |
| `abacatepay-webhook` | POST | Webhook de pagamento AbacatePay |
| `app-settings` | GET/POST | Leitura e atualização de configurações globais |
| `system-health-check` | GET | Verifica saúde de todos os serviços |
| `stream-lookup` | POST | Busca stream no catálogo M3U |
| `stream-proxy` | GET | Proxy de stream para contornar CORS |
| `trailer-challenge` | POST | Sorteia trailers para o quiz |

---

## Scripts Disponíveis

```bash
npm run dev          # Inicia servidor de desenvolvimento (porta 8080)
npm run build        # Gera bundle de produção em /dist
npm run build:dev    # Build em modo development (com source maps)
npm run preview      # Pré-visualiza o build de produção localmente
npm run lint         # Executa ESLint no código
npm run test         # Executa os testes (Vitest)
npm run test:watch   # Testes em modo watch (re-executa ao salvar)
```
