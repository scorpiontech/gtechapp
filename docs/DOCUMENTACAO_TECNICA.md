# 📄 Documentação Técnica — GTech Área do Cliente

**Versão:** 1.0  
**Data:** Fevereiro de 2026  
**Projeto:** GTech App — Portal de Autoatendimento para Clientes de Provedor de Internet

---

## 1. Visão Geral

O **GTech App** é uma aplicação web responsiva (mobile-first) que permite aos clientes de um provedor de internet gerenciar seus serviços de forma autônoma. A aplicação se integra à API do **MikWeb** (sistema de gestão para provedores) para fornecer dados em tempo real.

### 1.1 Funcionalidades Principais

| Funcionalidade | Descrição |
|---|---|
| **Login por CPF/CNPJ** | Autenticação simplificada sem senha, validando o documento diretamente na API MikWeb |
| **Dashboard** | Painel com resumo do plano, valor, vencimento e status da conexão |
| **Meu Contrato** | Visualização completa dos dados cadastrais, endereço, plano e dados de conexão |
| **2ª Via de Boleto** | Listagem de boletos com filtros por status, cópia de linha digitável, PIX e link do boleto |
| **Autodesbloqueio** | Liberação temporária da conexão bloqueada por inadimplência (limite de 1x/mês) |
| **Chamados Técnicos** | Abertura e acompanhamento de chamados de suporte técnico |
| **Tema Claro/Escuro** | Alternância de tema visual com persistência |

---

## 2. Stack Tecnológica

### 2.1 Frontend

| Tecnologia | Versão | Finalidade |
|---|---|---|
| **React** | 18.3.x | Biblioteca de UI (componentes reativos) |
| **TypeScript** | 5.x | Linguagem — tipagem estática sobre JavaScript |
| **Vite** | 5.x | Bundler e dev server (HMR ultrarrápido) |
| **Tailwind CSS** | 3.x | Framework CSS utilitário |
| **shadcn/ui** | — | Biblioteca de componentes acessíveis (baseada em Radix UI) |
| **React Router DOM** | 6.30.x | Roteamento SPA (Single Page Application) |
| **TanStack React Query** | 5.83.x | Gerenciamento de estado assíncrono e cache |
| **next-themes** | 0.3.x | Gerenciamento de tema claro/escuro |
| **Lucide React** | 0.462.x | Biblioteca de ícones SVG |
| **date-fns** | 3.6.x | Manipulação de datas |
| **Zod** | 3.25.x | Validação de schemas |
| **React Hook Form** | 7.61.x | Gerenciamento de formulários |
| **Sonner** | 1.7.x | Notificações toast |
| **Recharts** | 2.15.x | Gráficos e visualização de dados |

### 2.2 Backend

| Tecnologia | Finalidade |
|---|---|
| **Lovable Cloud (Supabase)** | Backend-as-a-Service — banco de dados PostgreSQL, Edge Functions, autenticação |
| **Deno** | Runtime das Edge Functions (TypeScript server-side) |
| **API MikWeb** | API REST externa do sistema de gestão do provedor |

### 2.3 Linguagens Utilizadas

| Linguagem | Uso |
|---|---|
| **TypeScript** | Frontend (React) e Backend (Edge Functions/Deno) |
| **SQL** | Migrations e queries no banco de dados PostgreSQL |
| **CSS** | Estilização via Tailwind CSS |
| **HTML** | Estrutura semântica via JSX |

---

## 3. Arquitetura da Aplicação

### 3.1 Diagrama de Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                   CLIENTE (Browser)                  │
│  ┌───────────────────────────────────────────────┐   │
│  │  React SPA (Vite + TypeScript + Tailwind)     │   │
│  │  ├── Login (CPF/CNPJ)                         │   │
│  │  ├── Dashboard                                │   │
│  │  ├── Contrato                                 │   │
│  │  ├── Boletos                                  │   │
│  │  ├── Desbloqueio                              │   │
│  │  └── Chamados                                 │   │
│  └──────────────────┬────────────────────────────┘   │
└─────────────────────┼────────────────────────────────┘
                      │ HTTPS
┌─────────────────────┼────────────────────────────────┐
│           LOVABLE CLOUD (Supabase)                    │
│  ┌──────────────────┴────────────────────────────┐   │
│  │           Edge Functions (Deno)                │   │
│  │  ├── mikweb-auth         (autenticação)       │   │
│  │  ├── mikweb-boletos      (boletos)            │   │
│  │  ├── mikweb-desbloqueio  (desbloqueio)        │   │
│  │  ├── mikweb-chamados     (abrir chamado)      │   │
│  │  └── mikweb-list-chamados(listar chamados)    │   │
│  └──────────────────┬────────────────────────────┘   │
│  ┌──────────────────┴────────────────────────────┐   │
│  │        PostgreSQL Database                     │   │
│  │  └── desbloqueio_logs (controle de uso)       │   │
│  └───────────────────────────────────────────────┘   │
└─────────────────────┼────────────────────────────────┘
                      │ HTTPS (Bearer Token)
┌─────────────────────┼────────────────────────────────┐
│              API MikWeb (Externa)                     │
│  ├── GET  /customers          (buscar clientes)      │
│  ├── GET  /customers/:id      (detalhe do cliente)   │
│  ├── GET  /billings           (boletos)              │
│  ├── PUT  /billings/:id/add_observation              │
│  ├── GET  /customer_contracts (contratos)            │
│  ├── PUT  /customer_contracts/:id/access_status      │
│  ├── POST /calledies          (abrir chamado)        │
│  └── GET  /calledies          (listar chamados)      │
└──────────────────────────────────────────────────────┘
```

### 3.2 Fluxo de Autenticação

1. Usuário digita CPF/CNPJ na tela de login
2. Frontend invoca Edge Function `mikweb-auth`
3. Edge Function busca cliente na API MikWeb por `search`
4. Valida CPF/CNPJ exato e retorna dados completos do cliente
5. Dados são armazenados no `localStorage` (`gtech_cliente`)
6. Em visitas futuras, dados são carregados do `localStorage` e atualizados em background

> **Nota:** Não há senha. A autenticação é feita exclusivamente pelo CPF/CNPJ.

---

## 4. Estrutura de Diretórios

```
├── docs/                          # Documentação
├── public/                        # Arquivos estáticos
│   ├── favicon.ico
│   ├── placeholder.svg
│   └── robots.txt
├── src/
│   ├── assets/                    # Imagens e recursos
│   │   └── gtech-logo.png
│   ├── components/                # Componentes reutilizáveis
│   │   ├── AppLayout.tsx          # Layout principal com header e nav
│   │   ├── BoletoCard.tsx         # Card de exibição de boleto
│   │   ├── BottomNav.tsx          # Navegação inferior mobile
│   │   ├── CPFInput.tsx           # Input com máscara CPF/CNPJ
│   │   ├── MobileHeader.tsx       # Header com logo, tema e logout
│   │   ├── NavLink.tsx            # Link de navegação
│   │   ├── StatusBadge.tsx        # Badge de status (ativo/bloqueado)
│   │   └── ui/                    # Componentes shadcn/ui (~50 arquivos)
│   ├── contexts/
│   │   └── AuthContext.tsx        # Contexto de autenticação global
│   ├── hooks/
│   │   ├── use-mobile.tsx         # Hook para detectar viewport mobile
│   │   └── use-toast.ts           # Hook de notificações
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts          # Cliente Supabase (auto-gerado)
│   │       └── types.ts           # Tipos do banco (auto-gerado)
│   ├── lib/
│   │   └── utils.ts               # Utilitários (cn, etc.)
│   ├── pages/                     # Páginas da aplicação
│   │   ├── Login.tsx              # Tela de login
│   │   ├── Dashboard.tsx          # Painel principal
│   │   ├── Contrato.tsx           # Dados do contrato
│   │   ├── Boletos.tsx            # Listagem de boletos
│   │   ├── Desbloqueio.tsx        # Autodesbloqueio
│   │   ├── Chamados.tsx           # Chamados técnicos
│   │   └── NotFound.tsx           # Página 404
│   ├── types/
│   │   └── mikweb.ts              # Tipos TypeScript da integração
│   ├── App.tsx                    # Componente raiz e rotas
│   ├── App.css                    # Estilos globais
│   ├── index.css                  # Tokens CSS (tema claro/escuro)
│   └── main.tsx                   # Entry point
├── supabase/
│   ├── config.toml                # Configuração Supabase
│   ├── migrations/                # Migrations SQL
│   └── functions/                 # Edge Functions
│       ├── mikweb-auth/           # Autenticação via MikWeb
│       ├── mikweb-boletos/        # Consulta de boletos
│       ├── mikweb-desbloqueio/    # Processo de desbloqueio
│       ├── mikweb-chamados/       # Abertura de chamados
│       └── mikweb-list-chamados/  # Listagem de chamados
├── tailwind.config.ts             # Configuração Tailwind CSS
├── vite.config.ts                 # Configuração Vite
├── tsconfig.json                  # Configuração TypeScript
└── package.json                   # Dependências npm
```

---

## 5. Edge Functions (Backend)

### 5.1 `mikweb-auth`
- **Método:** POST
- **Entrada:** `{ cpf: string }`
- **Saída:** `{ success: boolean, cliente: MikWebCliente }`
- **Lógica:** Busca cliente por CPF na API MikWeb, enriquece com dados do contrato, plano e valores.

### 5.2 `mikweb-boletos`
- **Método:** POST
- **Entrada:** `{ cliente_id: number }`
- **Saída:** `{ success: boolean, boletos: MikWebBoleto[] }`
- **Lógica:** Busca todos os boletos paginados (100/página), mapeia status (`efetuado` → `pago`, `em atraso` → `vencido`, etc.), ordena por prioridade (vencidos primeiro).

### 5.3 `mikweb-desbloqueio`
- **Método:** POST
- **Entrada:** `{ cliente_id: number }`
- **Saída:** `{ success: boolean, message: string }`
- **Lógica:**
  1. Verifica limite mensal (1x/mês) via tabela `desbloqueio_logs`
  2. Busca contrato ativo e tenta liberar acesso via múltiplos endpoints
  3. Coloca o boleto mais recente em observação (vencimento = amanhã)
  4. Registra o uso no banco de dados

### 5.4 `mikweb-chamados`
- **Método:** POST
- **Entrada:** `{ customer_id: number, subject: string, message: string, priority: string }`
- **Saída:** `{ success: boolean, chamado: object }`
- **Lógica:** Cria um chamado técnico via endpoint `POST /calledies` da API MikWeb.

### 5.5 `mikweb-list-chamados`
- **Método:** POST
- **Entrada:** `{ customer_id: number }`
- **Saída:** `{ success: boolean, chamados: Chamado[] }`
- **Lógica:** Lista chamados do cliente com paginação, mapeia códigos de status e prioridade para labels legíveis.

---

## 6. Banco de Dados

### 6.1 Tabela: `desbloqueio_logs`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID (PK) | Identificador único, gerado automaticamente |
| `cliente_id` | INTEGER | ID do cliente no MikWeb |
| `created_at` | TIMESTAMP | Data/hora do desbloqueio |

**Finalidade:** Controlar o limite de 1 desbloqueio por mês por cliente.

### 6.2 RLS (Row Level Security)

A tabela possui RLS habilitado. O acesso é controlado via Edge Functions usando a `SUPABASE_SERVICE_ROLE_KEY`.

---

## 7. Rotas da Aplicação

| Rota | Componente | Proteção | Descrição |
|---|---|---|---|
| `/` | `Login` | Pública (redireciona se logado) | Tela de login |
| `/dashboard` | `Dashboard` | Protegida | Painel principal |
| `/contrato` | `Contrato` | Protegida | Dados do contrato |
| `/boletos` | `Boletos` | Protegida | Listagem de boletos |
| `/desbloqueio` | `Desbloqueio` | Protegida | Autodesbloqueio |
| `/chamados` | `Chamados` | Protegida | Chamados técnicos |
| `*` | `NotFound` | — | Página 404 |

---

## 8. Variáveis de Ambiente e Secrets

| Variável | Escopo | Descrição |
|---|---|---|
| `VITE_SUPABASE_URL` | Frontend | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend | Chave anônima do Supabase |
| `MIKWEB_API_TOKEN` | Edge Functions | Token de autenticação da API MikWeb |
| `SUPABASE_URL` | Edge Functions | URL interna do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | Chave de serviço (acesso total ao banco) |

---

## 9. Tipos TypeScript Principais

### `MikWebCliente`
Representa os dados de um cliente do provedor:
- Dados pessoais: `nome`, `cpf_cnpj`, `email`, `celular`, `telefone`
- Endereço: `endereco`, `numero`, `bairro`, `cidade`, `estado`, `cep`
- Plano: `plano_nome`, `valor_plano`, `vencimento`
- Status: `bloqueado`, `access_status`, `status`
- Conexão: `login`, `conexao_id`, `conexao_login`

### `MikWebBoleto`
Representa um boleto:
- Valores: `valor`, `valor_pago`
- Datas: `vencimento`, `data_pagamento`, `data_emissao`
- Pagamento: `linha_digitavel`, `codigo_barras`, `link_boleto`, `pix_qr_code`, `pix_copy_paste`
- Status: `status` (aberto, vencido, pago, cancelado)

### `AuthState`
Estado global de autenticação:
- `isAuthenticated: boolean`
- `cliente: MikWebCliente | null`
- `loading: boolean`

---

## 10. Design e Tema

### 10.1 Design System
- **Abordagem:** Mobile-first, design limpo e funcional
- **Componentes:** shadcn/ui com customizações via Tailwind CSS
- **Tokens:** Cores semânticas via CSS custom properties (`--primary`, `--background`, `--foreground`, etc.)
- **Tema:** Suporte a modo claro e escuro com persistência via `next-themes`

### 10.2 Responsividade
- Layout otimizado para dispositivos móveis
- Header fixo com logo, toggle de tema e logout
- Navegação inferior (bottom navigation) em telas mobile

---

## 11. Segurança

| Aspecto | Implementação |
|---|---|
| **API Token** | Armazenado como secret no servidor, nunca exposto ao frontend |
| **Comunicação** | Todas as chamadas via HTTPS |
| **CORS** | Configurado nas Edge Functions |
| **RLS** | Habilitado nas tabelas do banco de dados |
| **Sessão** | Dados do cliente no `localStorage` (sem tokens sensíveis) |
| **Limites** | Desbloqueio limitado a 1x/mês por cliente |
| **Validação** | CPF/CNPJ validado no frontend (formato) e backend (existência) |

---

## 12. Deploy e Publicação

- **Plataforma:** Lovable Cloud
- **URL de Preview:** `https://id-preview--{id}.lovable.app`
- **URL Publicada:** `https://gtechapp.lovable.app`
- **Deploy:** Automático via plataforma Lovable (push para produção com um clique)
- **Edge Functions:** Deploy automático ao salvar alterações

---

## 13. Contato e Suporte

- **WhatsApp Suporte:** [0800 590 0456](https://wa.me/08005900456)
- **Acesso ao sistema:** Via CPF/CNPJ cadastrado no provedor

---

*Documento gerado automaticamente — GTech Área do Cliente v1.0*
