# Carteira Digital 👛

Site (HTML + CSS + JavaScript puro, sem frameworks) para controlar seus gastos
separados por **Gastos Fixos, Débitos, Créditos, Entradas e Caixa**, com teto
mensal de gastos, caixa rendendo % do CDI e projeção dos próximos 6 meses, salvando
tudo automaticamente na sua planilha do Google Sheets. Cada lançamento guarda
**motivo, local, aplicativo/conta e valor**. Totalmente responsivo (funciona
bem em celular, tablet e desktop).

Planilha usada: `Carteira` dentro de
https://docs.google.com/spreadsheets/d/11TvXn9iX4wDqCR_KM3IrUbIGELfAC_zosZ3MoRMmiJ0/edit

## Como funciona

Como é um site 100% front-end (sem servidor próprio), ele usa o
**Google Apps Script** como uma "ponte" gratuita entre o site e a sua
planilha: o script fica hospedado pelo próprio Google, recebe as requisições
do site e lê/escreve na aba `Carteira`. A aba `DADOS` (que você já criou) é
usada como sugestões de autocompletar nos campos "Motivo" e "Aplicativo".

```
index.html + css/ + js/   →   Google Apps Script (Code.gs)   →   Planilha Google Sheets
```

## Passo a passo (fazer uma vez só)

### 1. Instalar o backend na planilha

1. Abra a planilha e vá em **Extensões → Apps Script**.
2. Apague o conteúdo do arquivo `Code.gs` que abrir e cole todo o conteúdo do
   arquivo [`apps-script/Code.gs`](apps-script/Code.gs) deste projeto.
3. Salve (ícone de disquete ou `Ctrl+S`).
4. Clique em **Implantar → Nova implantação**.
   - Tipo: **App da Web**
   - Executar como: **Eu** (sua conta)
   - Quem pode acessar: **Qualquer pessoa**
5. Clique em **Implantar** e autorize as permissões pedidas pelo Google (é o
   seu próprio script acessando a sua própria planilha).
6. Copie a **URL do app da Web** gerada — ela termina em `/exec`.

> Sempre que editar o `Code.gs`, use **Gerenciar implantações → ✏️ → Nova
> versão → Implantar** para as mudanças valerem no site.

### 2. Conectar o site à planilha

Copie [`js/config.example.js`](js/config.example.js) para `js/config.js`
(esse nome específico é ignorado pelo git — veja o aviso abaixo) e cole a URL
copiada:

```js
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/SEU_ID_AQUI/exec',
  ...
};
```

Salve o arquivo. O aviso amarelo no topo do site some automaticamente quando
a URL estiver preenchida.

> ⚠️ **Não faça commit de `js/config.js`.** A URL do Apps Script implantado
> dá acesso de leitura/escrita/exclusão na sua planilha para qualquer um que
> a tiver — não existe login por trás dela. O `.gitignore` deste projeto já
> exclui esse arquivo; se for hospedar o site (GitHub Pages, Netlify…), crie
> `config.js` diretamente no local de hospedagem, fora do repositório.

### 3. Abrir o site

- **Rápido, só pra testar:** dê duplo clique em `index.html` para abrir no
  navegador.
- **Hospedado (GitHub Pages)**: veja a seção [Deploy no GitHub Pages](#deploy-no-github-pages)
  abaixo — assim você ganha um link fixo (`https://...`) que pode abrir no
  celular e usar a opção **"Adicionar à tela de início"**, deixando o site com
  cara de aplicativo.

## Deploy no GitHub Pages

Este repositório já vem com um workflow (`.github/workflows/deploy.yml`) que
publica o site automaticamente a cada push na `main`. Como `js/config.js` não
é versionado (contém a URL do seu Apps Script — veja o aviso acima), o
workflow monta esse arquivo na hora do deploy a partir de um **secret** do
repositório, então a URL nunca aparece no código-fonte nem no histórico do
git.

Configuração (uma vez só):

1. No repositório do GitHub: **Settings → Secrets and variables → Actions →
   New repository secret**.
   - Nome: `APPS_SCRIPT_URL`
   - Valor: a URL do seu Apps Script (a mesma que está em `js/config.js`,
     terminada em `/exec`)
2. **Settings → Pages → Build and deployment → Source:** troque para
   **"GitHub Actions"** (se já havia publicado antes pelo método clássico
   "Deploy from a branch", troque para essa opção — os dois métodos não
   convivem: o que valer é o que estiver selecionado aqui).
3. Dê um push (ou rode o workflow manualmente em **Actions → Deploy to
   GitHub Pages → Run workflow**). O link do site aparece em **Settings →
   Pages** depois que o workflow terminar (ícone verde em **Actions**).

Depois disso, qualquer alteração no site (novo push na `main`) já publica
sozinha — não precisa repetir nada.

> **Já tinha implantado antes de ler isto?** O `Code.gs` ganhou 3 colunas novas
> e 2 ações novas (parcelamento). Repita o passo 1 (colar o `Code.gs`
> atualizado) e depois **Gerenciar implantações → ✏️ → Nova versão →
> Implantar** — sem isso o site continua funcionando, só que sem parcelas.

> **Atualizando para a versão 2 (teto, caixa com rendimento, recorrentes e projeção)?**
> Cole o `Code.gs` novo no Apps Script e faça **Gerenciar implantações → ✏️ →
> Nova versão → Implantar**. Na primeira chamada o script cria sozinho as
> abas `Config` e `Recorrentes` e a coluna `RecorrenteId` na aba `Carteira`;
> nenhuma linha antiga é alterada. Enquanto a nova versão não for publicada,
> o site continua lançando normalmente e avisa que teto e recorrentes ainda
> não podem ser salvos.

## Estrutura de dados na planilha

### Aba `Carteira` (um lançamento por linha)

| ID | Data | Tipo | Natureza | Motivo | Local | Aplicativo | Valor | CriadoEm | ParcelaGrupo | ParcelaAtual | ParcelaTotal | RecorrenteId |
|----|------|------|----------|--------|-------|------------|-------|----------|--------------|--------------|--------------|--------------|

- **Tipo**:
  - `Entrada`: dinheiro que chegou (salário, pix recebido).
  - `Fixo`, `Debito`, `Credito`: dinheiro que saiu (gastos).
  - `Caixa`: **transferência** entre a conta e o caixa do Mercado Pago.
    Natureza `Entrada` significa *guardei*, `Saida` significa *resgatei*.
    Não conta como renda nem como gasto, só muda onde o dinheiro está.
    Isso acaba com a contagem dobrada da versão anterior: o salário entra uma
    vez (como Entrada) e o que você guarda passa da conta para o caixa.
- **ParcelaGrupo / ParcelaAtual / ParcelaTotal**: só em compras parceladas.
- **RecorrenteId**: só em lançamentos gerados a partir de um recorrente.
  Serve para saber que aquele recorrente já foi lançado no mês.

### Aba `Config` (chave | valor)

| Chave | O que é |
|-------|---------|
| `CDI_ANUAL` | CDI ao ano em %, ex.: `14.9`. Atualize quando o Copom mudar a Selic. |
| `PCT_CDI` | Quanto do CDI o caixa rende, ex.: `120`. |
| `TETO_MENSAL` | Quanto você se permite gastar por mês (fixos + débito + crédito). `0` desliga o teto. |
| `CAIXA_SALDO_INICIAL` / `CAIXA_DATA_INICIAL` | Saldo real do caixa numa data. Lançamentos de Caixa até essa data já estão dentro desse saldo. |

Tudo isso também pode ser editado no próprio site, na aba **Ajustes**.

### Aba `Recorrentes`

| ID | Tipo | Natureza | Motivo | Local | Aplicativo | Valor | Dia | Ativo | Inicio | Fim |
|----|------|----------|--------|-------|------------|-------|-----|-------|--------|-----|

São modelos que se repetem todo mês (salário, aluguel, internet). Eles **não
criam linhas sozinhos**. Todo mês aparecem no Início como "Contas do mês a
lançar", e um toque em **Lançar** registra o lançamento. Para ajustar o valor
antes, toque na linha.

## Como as contas são feitas

- **Disponível em conta** = entradas − saídas − guardado + resgatado, até hoje.
- **Caixa** = saldo inicial + guardado − resgatado + rendimento estimado.
  O rendimento é calculado como CDB: taxa diária = `((1 + CDI)^(1/252) − 1) × % do CDI`,
  capitalizada por dia útil (seg–sex, sem feriados). Com 120% de um CDI de
  14,90% a.a., isso dá cerca de 18,14% a.a. O IR regressivo (22,5% até
  180 dias, 20% até 360, 17,5% até 720 e 15% depois) é estimado por aporte,
  e os resgates saem dos aportes mais antigos primeiro. O IOF é ignorado.
  Se o valor do app do Mercado Pago estiver diferente, use **Caixa → Saldo
  real**: a conta recomeça desse valor.
- **Teto do mês**: soma os gastos do mês e os recorrentes de saída ainda não
  lançados, mostra quanto ainda está livre e quanto dá para gastar por dia
  até o fim do mês.
- **Projeção (6 meses)**: entradas pelos recorrentes de entrada (ou pela média
  dos últimos 3 meses, se não houver recorrentes); fixos pelos recorrentes de
  saída (ou pela média); parcelas já lançadas pelo valor exato; gastos
  variáveis pela média de débito e crédito avulsos, limitada ao teto. A sobra
  de cada mês vai para o caixa e rende.

## Parcelamento (opcional)

Ao adicionar um lançamento, marque **"Compra parcelada"** e informe o número
de parcelas — o campo "Valor" passa a significar **valor de cada parcela**.

- O site cria **uma linha por parcela**, cada uma na sua planilha, datada um
  mês depois da anterior a partir da data escolhida (ex.: comprar dia 07/08
  em 5x gera parcelas em 07/08, 07/09, 07/10, 07/11 e 07/12). O motivo de cada
  uma recebe o sufixo `(2/5)`, `(3/5)` etc.
- Como cada parcela é datada no mês certo, ela **aparece automaticamente**
  como saída quando você navegar até aquele mês no filtro de período — é
  assim que as saídas futuras entram na conta sem precisar calcular nada à
  mão.
- Na aba **Resumo** aparece o painel **"Parcelamentos em aberto"**, com
  quanto já foi pago, quantas parcelas restam e o valor total que ainda vai
  sair do caixa nos próximos meses. De lá dá pra **cancelar as parcelas
  restantes** de uma compra (as parcelas já vencidas continuam registradas,
  só as futuras são removidas).
- "Parcela inicial" (opcional, padrão 1) serve para quando você já está no
  meio de um parcelamento e só quer registrar as parcelas que faltam — por
  exemplo, começar direto na parcela 4 de 10.
- É totalmente opcional: quem não marcar a caixinha continua lançando um
  único valor, normalmente.

## Funcionalidades do site

- **Início**: o que está disponível em conta, o caixa e o patrimônio; o teto
  do mês com quanto ainda dá para gastar por dia; o fluxo do mês (entrou,
  saiu, guardou) por categoria; os recorrentes a lançar; os parcelamentos em
  aberto e os últimos lançamentos.
- **Lançamentos**: todos os lançamentos do mês agrupados por dia, com filtros
  (Entradas, Saídas, Fixos, Débito, Crédito, Caixa) e busca.
- **Caixa**: saldo com rendimento estimado, quanto rendeu no mês, IR
  estimado, botões Guardar e Resgatar, histórico de 6 meses e ajuste pelo
  saldo real.
- **Projeção**: gráfico e tabela dos próximos 6 meses, com o caixa projetado.
- **Ajustes**: teto mensal, CDI, % do CDI, saldo inicial do caixa e
  recorrentes.
- **Rápido**: as mudanças aparecem na tela na hora e são salvas na planilha em
  segundo plano. O ponto no canto superior direito mostra o estado. Se a
  planilha recusar, a mudança é desfeita e aparece "Tentar de novo".
- **Seletor de mês** no topo (‹ mês ›). Tocar no nome do mês volta para o
  mês atual.
- **Funciona sem internet** com os últimos dados salvos no navegador.
- **Responsivo**, com tema claro e escuro automático.

## Arquivos

```
CarteiraDigital/
├── index.html            # estrutura da página
├── css/style.css         # todo o visual e responsividade
├── js/config.js          # URL do Apps Script (edite aqui)
├── js/api.js             # comunicação com o Apps Script
├── js/finance.js         # cálculos (saldos, rendimento CDB, teto, projeção) — funções puras
├── js/app.js             # estado, telas, formulário e sincronização
├── apps-script/Code.gs   # backend a ser colado no Google Apps Script
└── README.md
```
