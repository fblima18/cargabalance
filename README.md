# 🚚 CARGA BALANCE - Auditoria de frete


[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PM2 Ready](https://img.shields.io/badge/PM2-Ready-blue.svg)](https://pm2.keymetrics.io/)

Plataforma corporativa de alto desempenho para **ingestão em lote de XMLs da SEFAZ (CT-e e MDF-e)**, auditoria fiscal de fretes, conciliação de viagens, cálculo automatizado de **comissão de 75% destinada ao motorista**, gestão de frotas e encaminhamento ao setor financeiro com geração de relatórios em Excel (.xlsx).

---

## 🌟 Principais Recursos

- **📥 Ingestão em Lote de XMLs SEFAZ (CT-e & MDF-e)**
  - Upload via *Drag & Drop* com processamento simultâneo e em tempo real.
  - Extração automatizada de metadados: chave de acesso de 44 dígitos, número, série, data/hora de emissão, emitente, remetente, destinatário, origem, destino, peso e valores fiscais.
  - Associação automática entre MDF-e e seus CT-es vinculados.

- **✍️ Lançamento e Exclusão Manual de Viagens**
  - Inserção direta de viagens com seleção entre **CT-e** e **MDF-e**, motorista vinculado, placas, rotas e valores.
  - Cálculo instantâneo da comissão de **75%** no formulário e emissão de chave SEFAZ sintética com arquivo XML mock.
  - Botão de exclusão (`icon-btn danger`) nas tabelas para cancelamento de lançamentos e recálculo instantâneo de saldos.

- **🔍 Pesquisa Multi-Critério Avançada**
  - Seletor de escopo de busca: `Todos`, `Motorista`, `CT-e`, `MDF-e` e `Rota` com busca reativa em tempo real.

- **🎨 Interface Minimalista & Alta Produtividade**
  - Cabeçalho limpo com botões de ícones minimalistas e intuitivos com *tooltips*.
  - Ícones padronizados e compactos em toda a interface (logotipo, upload, KPIs, tabelas).

- **💰 Destaque do Valor Destinado ao Motorista (75% do Frete)**
  - Cálculo automático da comissão de **75% sobre o valor do frete** em todos os conhecimentos CT-e.
  - Exibição de alto contraste e prioridade visual nos cards de KPI do dashboard, tabela de auditoria e modal DACTE.
  - Demonstração da margem da empresa (25%) e do valor líquido a pagar ao motorista.

- **🔔 Lembrete e Confirmação de Envio ao Setor Financeiro**
  - Alerta imediato pós-lançamento e pós-upload: *"ENCAMINHE ESTE VALOR AO FINANCEIRO"*.
  - Modal interativo para conferência com discriminação por motorista, CPF, placas e fretes.
  - Registro de protocolo único de acerto auditável gravado em banco de dados (`envios_financeiro`).

- **🚛 Gestão Completa de Motoristas & Frotas**
  - Cadastro, edição e exclusão de motoristas.
  - Controle de dados: Nome, CPF, CNH, Placa do Cavalo (Tração) e Placa da Carreta (Reboque) no padrão Mercosul.
  - Proteção contra exclusão acidental de motoristas com histórico ativo.

- **📄 Visualizador Fiscal Oficial (DACTE & DAMDFE)**
  - Renderização do Documento Auxiliar oficial com código de barras, chave SEFAZ formatada, dados de pesagem e quadro de valores.

- **📊 Exportação Formatada para Excel (.xlsx)**
  - Geração de planilhas formatadas via `ExcelJS` com fórmulas dinâmicas (`SUM`, `COUNTA`).
  - Planilha com abas: **Auditoria Geral** (com coluna destacada de 75% do repasse) e **Resumo Consolidado por Motorista**.

- **⚡ Gestão de Processos em Produção (PM2)**
  - Pronto para execução contínua com auto-restart em caso de falha e inicialização automática no boot do sistema operacional.

---

## 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js, Express.js
- **Banco de Dados**: SQLite de alta performance com índices otimizados
- **Processamento XML**: Fast-XML-Parser
- **Manipulação de Planilhas**: ExcelJS
- **Gerenciador de Processos**: PM2
- **Frontend**: HTML5, Vanilla JavaScript, CSS customizado / Tailwind CSS

---

## 📁 Estrutura do Projeto

```text
cte-mdfe-platform/
├── data/                  # Base de dados local SQLite (migrações automáticas)
├── public/                # Interface web (HTML, CSS e app.js)
│   ├── css/
│   ├── js/
│   └── index.html
├── src/
│   ├── database/
│   │   └── db.js          # Conexão SQLite, schemas e queries de auditoria
│   ├── services/
│   │   ├── excelService.js# Geração de planilhas Excel (.xlsx)
│   │   └── xmlParser.js   # Parser rápido de documentos fiscais XML
│   └── server.js          # Rotas REST API e servidor Express
├── tests/                 # Testes unitários do parser XML
├── uploads/               # Repositório de arquivos XML armazenados
├── package.json           # Dependências e scripts
├── server.js              # Ponto de entrada raiz para gerenciadores de processo
└── README.md              # Documentação oficial
```

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- [Node.js](https://nodejs.org/) versão 20 ou superior.

### 1. Clonar o Repositório
```bash
git clone https://github.com/SEU-USUARIO/NOME-DO-REPOSITORIO.git
cd NOME-DO-REPOSITORIO
```

### 2. Instalar as Dependências
```bash
npm install
```

### 3. Execução em Modo de Desenvolvimento
```bash
npm start
```
Acesse a aplicação no navegador em: **`http://localhost:3000`**

---

## ⚡ Executando em Produção com PM2

Para manter o sistema rodando continuamente em segundo plano com inicialização automática:

### 1. Instalar o PM2 globalmente:
```bash
npm install -g pm2
```

### 2. Iniciar a aplicação gerenciada pelo PM2:
```bash
pm2 start server.js --name "meu-app"
```

### 3. Salvar o estado da lista de processos:
```bash
pm2 save
```

### 4. Configurar inicialização automática no boot:
* **No Windows**:
  ```bash
  npm install -g pm2-windows-startup
  pm2-startup install
  ```
* **No Linux**:
  ```bash
  pm2 startup
  ```

### 5. Comandos úteis do PM2:
```bash
pm2 status             # Exibe status dos processos
pm2 logs meu-app       # Visualiza logs em tempo real
pm2 restart meu-app    # Reinicia o serviço
pm2 stop meu-app       # Pausa o serviço
```

---

## 🔒 Segurança e Dados Sensíveis
O arquivo `.gitignore` já vem configurado para ignorar automaticamente bancos de dados locais (`data/*.db`), logs de execução e arquivos XML importados, garantindo que nenhum dado fiscal sensível da sua operação seja compartilhado publicamente.

---

## 📄 Licença
Distribuído sob a licença **MIT**. Consulte `LICENSE` para mais detalhes.
