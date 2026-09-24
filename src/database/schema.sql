-- Schema for CT-e & MDF-e Audit Platform

CREATE TABLE IF NOT EXISTS motoristas (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    cpf TEXT UNIQUE NOT NULL,
    cnh TEXT,
    percentual_comissao REAL DEFAULT 75.0,
    placa_cavalo TEXT,
    placa_carreta TEXT,
    tipo_vinculo TEXT DEFAULT 'frota_propria',
    telefone TEXT,
    chave_pix TEXT,
    ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS manifestos_mdfe (
    id TEXT PRIMARY KEY,
    chave_acesso TEXT UNIQUE NOT NULL,
    numero INTEGER NOT NULL,
    serie INTEGER NOT NULL,
    data_emissao TEXT NOT NULL,
    uf_origem TEXT NOT NULL,
    uf_destino TEXT NOT NULL,
    ufs_percurso TEXT,
    remetente_nome TEXT,
    remetente_cnpj TEXT,
    destinatario_nome TEXT,
    destinatario_cnpj TEXT,
    data_saida TEXT,
    previsao_chegada TEXT,
    placa_tracao TEXT,
    placa_reboque TEXT,
    peso_bruto REAL DEFAULT 0.0,
    motorista_id TEXT NOT NULL,
    valor_total_carga REAL NOT NULL,
    caminho_xml TEXT NOT NULL,
    dados_extras TEXT, -- JSON for extra SEFAZ tags (emitente, placa, etc.)
    criado_em TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (motorista_id) REFERENCES motoristas(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS conhecimentos_cte (
    id TEXT PRIMARY KEY,
    manifesto_id TEXT,
    motorista_id TEXT NOT NULL,
    chave_acesso TEXT UNIQUE NOT NULL,
    numero INTEGER NOT NULL,
    serie INTEGER NOT NULL,
    data_emissao TEXT NOT NULL,
    cidade_origem TEXT NOT NULL,
    uf_origem TEXT NOT NULL,
    cidade_destino TEXT NOT NULL,
    uf_destino TEXT NOT NULL,
    ufs_percurso TEXT,
    remetente_nome TEXT,
    remetente_cnpj TEXT,
    destinatario_nome TEXT,
    destinatario_cnpj TEXT,
    data_saida TEXT,
    previsao_chegada TEXT,
    valor_frete REAL NOT NULL,
    valor_icms REAL DEFAULT 0.0,
    valor_impostos_total REAL DEFAULT 0.0,
    valor_comissao_motorista REAL DEFAULT 0.0,
    interestadual INTEGER DEFAULT 0, -- 1 if trip leaves/enters state (e.g. outside AL)
    caminho_xml TEXT NOT NULL,
    dados_extras TEXT, -- JSON for extra SEFAZ tags
    criado_em TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (manifesto_id) REFERENCES manifestos_mdfe(id) ON DELETE SET NULL,
    FOREIGN KEY (motorista_id) REFERENCES motoristas(id) ON DELETE RESTRICT
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_mdfe_chave ON manifestos_mdfe(chave_acesso);
CREATE INDEX IF NOT EXISTS idx_mdfe_motorista ON manifestos_mdfe(motorista_id);
CREATE INDEX IF NOT EXISTS idx_mdfe_data ON manifestos_mdfe(data_emissao);

CREATE INDEX IF NOT EXISTS idx_cte_chave ON conhecimentos_cte(chave_acesso);
CREATE INDEX IF NOT EXISTS idx_cte_motorista ON conhecimentos_cte(motorista_id);
CREATE INDEX IF NOT EXISTS idx_cte_data ON conhecimentos_cte(data_emissao);
CREATE INDEX IF NOT EXISTS idx_cte_manifesto ON conhecimentos_cte(manifesto_id);
CREATE INDEX IF NOT EXISTS idx_cte_destino ON conhecimentos_cte(uf_destino, cidade_destino);
CREATE INDEX IF NOT EXISTS idx_cte_interestadual ON conhecimentos_cte(interestadual);

-- Repositório de Parâmetros de Frete, Destinos e Regras Tributárias
CREATE TABLE IF NOT EXISTS repositorio_fretes (
    id TEXT PRIMARY KEY,
    codigo_tabela TEXT NOT NULL DEFAULT 'FRETE INFOR',
    numero_tabela TEXT DEFAULT '(CPLR/PALR)',
    tipo_pagamento TEXT DEFAULT 'FOB CARTEIRA',
    pagador_nome TEXT NOT NULL DEFAULT 'CARAJAS MATERIAL DE CONSTRUCAO',
    pagador_cnpj TEXT NOT NULL DEFAULT '03.656.804/0001-31',
    cfop_pagador TEXT DEFAULT 'C',
    cfop_destinatario TEXT DEFAULT 'C',
    mercadoria_codigo TEXT DEFAULT '001',
    especie TEXT DEFAULT '01',
    nota_fiscal_ref TEXT DEFAULT '3 1259697',
    nfs_agrupadas INTEGER DEFAULT 20,
    uf_origem TEXT DEFAULT 'AL',
    cidade_origem TEXT DEFAULT 'Maceió',
    uf_destino TEXT DEFAULT 'AL',
    cidade_destino TEXT DEFAULT 'Maceió',
    peso_real_kg REAL DEFAULT 30604.924,
    qtde_volume INTEGER DEFAULT 2217,
    volume_m3 REAL DEFAULT 0.0,
    valor_mercadoria REAL DEFAULT 20553.44,
    frete_valor REAL DEFAULT 850.00,
    frete_peso REAL DEFAULT 0.0,
    despacho REAL DEFAULT 0.0,
    pedagio REAL DEFAULT 0.0,
    gris REAL DEFAULT 0.0,
    tas REAL DEFAULT 0.0,
    tda REAL DEFAULT 0.0,
    tde REAL DEFAULT 0.0,
    tar REAL DEFAULT 0.0,
    trt REAL DEFAULT 0.0,
    cat REAL DEFAULT 0.0,
    itr REAL DEFAULT 0.0,
    adicional_frete REAL DEFAULT 0.0,
    paletizacao REAL DEFAULT 0.0,
    capatazia REAL DEFAULT 0.0,
    agendamento REAL DEFAULT 0.0,
    aliquota_icms REAL DEFAULT 21.50,
    valor_icms REAL DEFAULT 182.75,
    aliquota_cbs REAL DEFAULT 0.90,
    valor_cbs REAL DEFAULT 5.78,
    aliquota_ibs_estadual REAL DEFAULT 0.10,
    valor_ibs_estadual REAL DEFAULT 0.64,
    aliquota_ibs_municipal REAL DEFAULT 0.0,
    valor_ibs_municipal REAL DEFAULT 0.0,
    aliquota_iss REAL DEFAULT 0.0,
    valor_iss REAL DEFAULT 0.0,
    base_tributos REAL DEFAULT 642.59,
    valor_total_frete REAL DEFAULT 850.00,
    valor_receber REAL DEFAULT 850.00,
    comissao_motorista_75 REAL DEFAULT 637.50,
    margem_operacional_25 REAL DEFAULT 212.50,
    observacoes TEXT,
    ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_repo_frete_pagador ON repositorio_fretes(pagador_cnpj);
CREATE INDEX IF NOT EXISTS idx_repo_frete_destino ON repositorio_fretes(uf_destino, cidade_destino);

-- Filiais das Empresas para Roteamento Fiscal de Clientes Pessoa Física (PF)
CREATE TABLE IF NOT EXISTS filiais_empresa (
    id TEXT PRIMARY KEY,
    empresa_grupo TEXT NOT NULL DEFAULT 'CARAJAS',
    nome_filial TEXT NOT NULL,
    cnpj TEXT NOT NULL,
    inscricao_estadual TEXT,
    cidade TEXT NOT NULL,
    uf TEXT NOT NULL,
    logradouro TEXT,
    bairro TEXT,
    cep TEXT,
    telefone TEXT,
    ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_filiais_cidade_uf ON filiais_empresa(cidade, uf);
CREATE INDEX IF NOT EXISTS idx_filiais_cnpj ON filiais_empresa(cnpj);

