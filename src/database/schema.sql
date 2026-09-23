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
