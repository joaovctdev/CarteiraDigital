# Carteira Digital 👛

Site (HTML + CSS + JavaScript puro, sem frameworks) para controlar seus gastos
separados por **Gastos Fixos, Débitos, Créditos, Entradas e Caixa**, salvando
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

Duas opções:

- **Rápido, só pra testar:** dê duplo clique em `index.html` para abrir no
  navegador.
- **Recomendado (principalmente para usar no celular):** hospede a pasta em
  algo gratuito como o **GitHub Pages** ou a **Netlify** (arraste a pasta).
  Assim você ganha um link fixo (`https://...`) que pode abrir no celular e
  usar a opção do navegador **"Adicionar à tela de início"**, deixando o site
  com cara de aplicativo.

> **Já tinha implantado antes de ler isto?** O `Code.gs` ganhou 3 colunas novas
> e 2 ações novas (parcelamento). Repita o passo 1 (colar o `Code.gs`
> atualizado) e depois **Gerenciar implantações → ✏️ → Nova versão →
> Implantar** — sem isso o site continua funcionando, só que sem parcelas.

## Estrutura de dados na planilha

A aba `Carteira` recebe automaticamente estas colunas (o script cria o
cabeçalho sozinho no primeiro uso):

| ID | Data | Tipo | Natureza | Motivo | Local | Aplicativo | Valor | CriadoEm | ParcelaGrupo | ParcelaAtual | ParcelaTotal |
|----|------|------|----------|--------|-------|------------|-------|----------|--------------|--------------|--------------|

- **Tipo**: `Fixo`, `Debito`, `Credito`, `Entrada` ou `Caixa` — a categoria do
  lançamento (uma aba do site para cada uma).
- **Natureza**: `Entrada` (soma no saldo) ou `Saida` (subtrai do saldo).
  Definida automaticamente pelo Tipo (Fixo/Débito/Crédito = saída, Entrada =
  entrada); para `Caixa` você escolhe na hora, já que movimentações em
  dinheiro podem ser nos dois sentidos.
- **Motivo / Local / Aplicativo / Valor**: exatamente como pedido — cada
  lançamento é separado por esses quatro campos, além da data.
- **ParcelaGrupo / ParcelaAtual / ParcelaTotal**: preenchidos só quando o
  lançamento faz parte de uma compra parcelada (veja abaixo). Ficam em branco
  em lançamentos normais.

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

- **Resumo**: saldo total em caixa, gráfico de barras comparando as 5
  categorias no período, parcelamentos em aberto e últimos lançamentos.
- **Abas por categoria** (Fixos, Débitos, Créditos, Entradas, Caixa): total do
  período, busca por motivo/local/app, lista de lançamentos.
- **Parcelamento opcional**: marque uma compra como parcelada e o site lança
  cada parcela no mês certo, calculando sozinho quanto ainda falta pagar.
- **Filtro por período**: mês atual por padrão, com opção de ver qualquer mês
  ou todos os períodos.
- **Adicionar/editar/excluir** lançamentos pelo botão flutuante `+` ou tocando
  em um lançamento existente.
- **Funciona offline-ish**: guarda os últimos dados no `localStorage` do
  navegador, então abre instantaneamente e mostra um aviso se a conexão
  falhar.
- **Totalmente responsivo**: navegação inferior por abas no celular, barra
  superior no desktop; tudo se ajusta ao tamanho da tela.
- **Tema claro/escuro automático**, seguindo a preferência do sistema.

## Arquivos

```
CarteiraDigital/
├── index.html            # estrutura da página
├── css/style.css         # todo o visual e responsividade
├── js/config.js          # URL do Apps Script (edite aqui)
├── js/api.js             # comunicação com o Apps Script
├── js/app.js             # lógica do site (abas, formulário, cálculos)
├── apps-script/Code.gs   # backend a ser colado no Google Apps Script
└── README.md
```
