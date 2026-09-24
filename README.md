# LIFEQUEST

App pessoal para centralizar a rotina: diário, lembretes com push, treino, cardio (Apple Watch via Strava), dieta, fotos de evolução e metas ajustáveis. Feito para usar no celular, instalado na tela de início como app.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres, login, storage, cron) · Vercel · Strava API · Web Push

## Abas

| Aba | O que faz |
| --- | --- |
| **Metas** (início) | Visão geral de todas as metas com semáforo verde → amarelo → vermelho, resumo do dia e da semana |
| **Diário** | Uma entrada por dia, com humor e energia de 1 a 5 |
| **Lembretes** | Lembretes únicos, diários ou em dias da semana, com notificação push |
| **Treino** | Sessões com séries (carga × repetições), modelos (Treino A/B/C), "última vez" e recordes com 1RM estimado |
| **Cardio** | Importa atividades do Strava (automático via webhook) e aceita registro manual |
| **Dieta** | Kcal e macros do dia, atalhos de 1 toque para as refeições salvas, refeição livre e registro manual |
| **Fotos** | Foto diária + peso e cintura, gráfico de evolução e comparação antes/depois |

As refeições **Refeição 1** (545 kcal) e **Refeição 2** (528 kcal) e algumas metas de exemplo são criadas automaticamente no primeiro acesso. Tudo é editável no app.

---

## Passo a passo para colocar no ar

Tudo abaixo é feito pelo navegador, nos painéis do Supabase, Vercel e Strava. Não precisa rodar nada no seu computador.

### 1. Supabase (banco de dados)

1. Entre em [supabase.com](https://supabase.com) → **New project**.
   - Nome: `lifequest`
   - Região: **South America (São Paulo)**
   - Anote a senha do banco em um lugar seguro.
2. Com o projeto criado, abra **SQL Editor** → **New query**, cole todo o conteúdo de [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) e clique em **Run**. Deve aparecer "Success".
3. Crie seu usuário: **Authentication → Users → Add user → Create new user**, com seu e-mail e uma senha. Marque **Auto Confirm User**.
4. Bloqueie novos cadastros: **Authentication → Sign In / Providers** → desligue **Allow new users to sign up** → Save.
5. Pegue as chaves em **Project Settings → API Keys**:
   - `Project URL` → vai em `NEXT_PUBLIC_SUPABASE_URL` (também aparece em Project Settings → Data API)
   - **Publishable key** (`sb_publishable_...`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **Secret key** (`sb_secret_...`) → `SUPABASE_SECRET_KEY`
   - Se o seu projeto só mostrar as chaves antigas, use `anon` no lugar da publishable e `service_role` no lugar da secret.

> A secret key ignora a segurança do banco. Ela só vai na Vercel, nunca no código nem no GitHub.

### 2. Chaves do push e do agendador

Você precisa de 4 valores. Se preferir gerar você mesmo, com Node instalado: `npx web-push generate-vapid-keys` (só imprime as chaves na tela, não altera nada).

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`: par de chaves do push
- `CRON_SECRET`: um texto aleatório longo
- `STRAVA_WEBHOOK_VERIFY_TOKEN`: outro texto aleatório

### 3. Strava (dados do Apple Watch)

1. No iPhone, conecte o Apple Watch ao Strava: no app do Strava, vá nas configurações de **Aplicativos, serviços e dispositivos → Saúde (Apple Health)** e ative o envio de treinos. A partir daí, os treinos gravados no app Treino do relógio vão para o Strava sozinhos.
2. No computador, acesse [strava.com/settings/api](https://www.strava.com/settings/api) e crie o app:
   - Application Name: `LIFEQUEST`
   - Website: `https://seu-app.vercel.app` (pode ajustar depois do passo 4)
   - **Authorization Callback Domain**: `seu-app.vercel.app` (só o domínio, sem `https://`)
3. Anote o **Client ID** e o **Client Secret**.

### 4. Vercel (hospedagem)

1. Entre em [vercel.com](https://vercel.com) com a conta do GitHub → **Add New → Project** → importe `Vinigirao/LIFEQUEST`.
2. Framework: Next.js (detectado sozinho). Não mude os comandos de build.
3. Em **Environment Variables**, cadastre todas as variáveis do arquivo [`.env.example`](.env.example):

   | Variável | Valor |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | passo 1 |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | passo 1 |
   | `SUPABASE_SECRET_KEY` | passo 1 |
   | `NEXT_PUBLIC_SITE_URL` | `https://seu-app.vercel.app` (sem barra no final) |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | passo 2 |
   | `VAPID_PRIVATE_KEY` | passo 2 |
   | `VAPID_SUBJECT` | `mailto:seu-email@gmail.com` |
   | `CRON_SECRET` | passo 2 |
   | `STRAVA_CLIENT_ID` | passo 3 |
   | `STRAVA_CLIENT_SECRET` | passo 3 |
   | `STRAVA_WEBHOOK_VERIFY_TOKEN` | passo 2 |

4. Clique em **Deploy**.
5. Quando terminar, confira o domínio final em **Settings → Domains**. Se for diferente do que você colocou em `NEXT_PUBLIC_SITE_URL` e no Strava, corrija os dois e faça **Redeploy** (Deployments → ⋯ → Redeploy).

A partir daqui, todo `push` na branch `main` do GitHub publica uma nova versão sozinho.

### 5. Agendador dos lembretes (Supabase)

1. No Supabase, abra **SQL Editor → New query** e cole o conteúdo de [`supabase/cron.sql`](supabase/cron.sql).
2. Troque `SEU-APP.vercel.app` pelo seu domínio e `SEU_CRON_SECRET` pelo mesmo valor do `CRON_SECRET` da Vercel.
3. Clique em **Run**.
   - Se der erro de extensão, ative **pg_cron** e **pg_net** em **Database → Extensions** e rode de novo.

O banco checa os lembretes a cada minuto e só chama o app quando existe algum vencido.

### 6. Instalar no iPhone

1. Abra o endereço do app no **Safari** e faça login.
2. Toque em **Compartilhar → Adicionar à Tela de Início**.
3. Abra o LIFEQUEST **pelo ícone** (push no iPhone só funciona assim).
4. Aba **Lembretes → Ativar notificações** → permita → toque em **Testar**.

### 7. Conectar o Strava

1. Aba **Cardio → Conectar** → autorize (deixe marcada a permissão de ver atividades). Os últimos 90 dias são importados.
2. Toque na engrenagem (canto superior direito) → **Ativar webhook**. Pronto: atividades novas chegam sozinhas alguns segundos depois de sincronizarem no Strava.

---

## Custos e limites

Tudo cabe no plano gratuito para uso pessoal:

- **Supabase Free:** 500 MB de banco e 1 GB de arquivos (as fotos são comprimidas para ~200 KB, dá anos de fotos). O projeto é **pausado após 7 dias sem uso**; usando todo dia, isso não acontece.
- **Vercel Hobby:** gratuito para projeto pessoal, não comercial.
- **Strava API:** app novo é liberado para 1 atleta (você), o suficiente aqui.

## Estrutura

```
src/
  app/
    (app)/            telas com login: metas (início), diario, lembretes, treino, cardio, dieta, fotos, config
    api/cron/         rota chamada pelo agendador dos lembretes
    api/strava/       login no Strava, retorno e webhook
    login/            tela de login
  components/         navegação inferior, botões, gráfico
  lib/                datas (fuso de SP), metas, agenda dos lembretes, push, Strava, clientes Supabase
  proxy.ts            protege as telas (redireciona para o login)
public/sw.js          service worker que mostra as notificações
supabase/
  migrations/0001_init.sql   tabelas, segurança (RLS), bucket de fotos e dados iniciais
  cron.sql                   agendador dos lembretes
```

## Segurança

- Cada tabela tem RLS: um usuário só enxerga as próprias linhas.
- Fotos ficam em bucket **privado**, acessadas por links temporários de 1 hora.
- Tokens do Strava só são lidos/gravados pelo servidor.
- Arquivos `.env*` estão no `.gitignore`; nunca suba chaves para o GitHub.

## Rodar no computador (opcional)

Só se quiser mexer no código localmente. Precisa de Node 20+.

```bash
npm install
cp .env.example .env.local   # preencha com os mesmos valores da Vercel
npm run dev                  # abre em http://localhost:3000
```

## Próximas ideias

Finanças (upload de CSV com categorização), dias de bebida e gastos com erva, sono, hábitos genéricos, revisão semanal, correlações entre módulos e módulo de trabalho (brag doc, 1:1s, delegações).
