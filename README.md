# Apontamento de horas

Aplicação local para transformar o CSV de horas exportado do Azure DevOps em:

1. uma planilha **xlsx** com as colunas Projeto, ID, Work Item Type, Tipo da tarefa, Title, Completed Work, Assigned To, State e Closed Date;
2. **lançamentos de horas no Redmine**, revisados antes do envio.

| Parte | Tecnologia | Endereço |
| --- | --- | --- |
| Frontend | React + TypeScript (Vite), servido pelo nginx | http://localhost:3000 |
| Backend | .NET 10 (minimal API) + Entity Framework Core | http://localhost:5080/api |
| Banco | PostgreSQL 17 | localhost:5433 |

## Como rodar

Pré-requisito: Docker Desktop.

```bash
docker compose up -d --build
```

Abra http://localhost:3000. As tabelas são criadas pelo EF Core quando a API sobe.

Para parar: `docker compose down`. Os dados ficam nos volumes `pgdata` (banco) e `keys` (chaves que criptografam a chave de API do Redmine). `docker compose down -v` apaga tudo.

Para trocar portas ou a senha do banco, copie `.env.example` para `.env` e ajuste.

## Primeiro uso

1. **Configurações → Redmine**: informe a URL e a chave de API (no Redmine: *Minha conta → Chave de acesso à API*) e clique em **Testar conexão**. Se o Redmine só abre na rede da empresa, a VPN precisa estar conectada.
2. **Salvar configurações**. Depois disso, escolha o **projeto do Redmine** (limita a busca de issues), a **issue padrão** e a **atividade**, e salve de novo.
3. **Tipos de tarefa**: cadastre as opções da coluna "Tipo da tarefa".

## Fluxo

1. **Importações**: arraste o CSV. O arquivo precisa ter as colunas `ID, Work Item Type, Title, Completed Work, Assigned To, State, Closed Date` (vírgula ou ponto e vírgula, UTF-8 ou Latin-1).
2. **Dados da planilha**: tudo é editável e salvo automaticamente. A coluna Projeto vem com o valor padrão ("Onboarding Corretor") e pode ser trocada em todas as linhas de uma vez. Linhas sem *Completed Work* ficam marcadas em amarelo, e o xlsx só é gerado depois de preencher.
3. **Gerar xlsx**.
4. **Lançamentos no Redmine**: mostra cada lançamento que será criado.
   - **Data**: a do início do título (`20260803 - ...`). Sem data no título, usa a Closed Date. Pode ser editada.
   - **Horas**: o Completed Work.
   - **Issue**: a da linha, se informada; senão a issue padrão da importação; senão a das configurações.
   - **Comentário**: o título sem a data.
   - **Atividade**: a definida nas configurações.

   Selecione as linhas e clique em **Criar lançamentos no Redmine**. Cada linha guarda o resultado (ID do lançamento ou o erro devolvido pelo Redmine). Linhas já enviadas, e work items já lançados em outra importação, ficam fora de novos envios.

## Estrutura

```
docker-compose.yml
backend/
  Dockerfile
  ApontamentoHoras.Api/
    Program.cs                 configuração e injeção de dependências
    Endpoints/ApiEndpoints.cs  rotas /api
    Data/                      DbContext e criação do banco
    Models/Entities.cs         entidades do EF Core
    Contracts/Dtos.cs          contratos da API
    Services/                  CSV, xlsx, Redmine, configurações e importações
frontend/
  Dockerfile, nginx.conf
  src/
    api.ts                     cliente da API e tipos
    pages/                     Importações, Importação, Configurações
    components/                tabela editável, régua de dias, prévia do Redmine, busca de issue
```

## Desenvolvimento sem Docker

```bash
# banco
docker compose up -d db

# API (porta 5080)
cd backend/ApontamentoHoras.Api
dotnet run --urls http://localhost:5080

# frontend (porta 5173, com proxy de /api para a 5080)
cd frontend
npm install
npm run dev
```

O banco é criado com `EnsureCreated`. Se o modelo mudar depois de já existir um banco com dados, gere migrations (`dotnet ef migrations add Inicial`) e troque `EnsureCreatedAsync` por `MigrateAsync` em `Data/DatabaseInitializer.cs`. Sem dados a preservar, basta `docker compose down -v`.

## API

| Método | Rota | Uso |
| --- | --- | --- |
| GET/PUT | `/api/settings` | configurações (a chave de API nunca é devolvida) |
| POST | `/api/settings/redmine/test` | testa URL e chave |
| GET/POST/PUT/DELETE | `/api/task-types` | tipos de tarefa |
| GET | `/api/redmine/projects`, `/activities`, `/issues`, `/issues/{id}` | consultas ao Redmine |
| GET/POST | `/api/imports` | lista importações / importa CSV (`multipart/form-data`, campo `file`) |
| GET/PUT/DELETE | `/api/imports/{id}` | lê, salva edições, exclui |
| DELETE | `/api/imports/{id}/items/{itemId}` | remove uma linha |
| GET | `/api/imports/{id}/xlsx` | baixa a planilha |
| GET | `/api/imports/{id}/redmine` | prévia dos lançamentos |
| POST | `/api/imports/{id}/redmine/send` | cria os lançamentos (`{ "itemIds": [...] }`) |
