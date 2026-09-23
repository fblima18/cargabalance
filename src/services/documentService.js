const { queryAll, queryOne } = require('../database/db');

/**
 * Retrieves filtered list of documents (CT-e and MDF-e) with balance and 75% commission metrics
 */
function getFilteredDocuments(filters = {}) {
  const {
    startDate,
    endDate,
    driverId,
    docType = 'all', // 'all' | 'cte' | 'mdfe'
    destination,
    search,
    interstateOnly // 'true' | '1' | boolean
  } = filters;

  const results = [];

  // 1. Fetch CT-e records if docType is 'all' or 'cte'
  if (docType === 'all' || docType === 'cte') {
    let cteSql = `
      SELECT 
        c.id,
        'CT-e' AS tipo,
        c.chave_acesso,
        c.numero,
        c.serie,
        c.data_emissao,
        (c.cidade_origem || '/' || c.uf_origem) AS origem,
        c.cidade_origem,
        c.uf_origem,
        (c.cidade_destino || '/' || c.uf_destino) AS destino,
        c.cidade_destino,
        c.uf_destino,
        c.valor_frete AS valor,
        COALESCE(c.valor_icms, 0.0) AS valor_icms,
        COALESCE(c.valor_impostos_total, 0.0) AS valor_impostos_total,
        COALESCE(c.valor_comissao_motorista, ROUND(c.valor_frete * 0.75, 2)) AS valor_comissao,
        COALESCE(c.interestadual, 0) AS interestadual,
        c.caminho_xml,
        c.manifesto_id,
        c.dados_extras,
        m.id AS motorista_id,
        m.nome AS motorista_nome,
        m.cpf AS motorista_cpf,
        m.cnh AS motorista_cnh,
        COALESCE(m.percentual_comissao, 75.0) AS motorista_percentual_comissao,
        c.criado_em
      FROM conhecimentos_cte c
      JOIN motoristas m ON c.motorista_id = m.id
      WHERE 1=1
    `;
    const cteParams = [];

    if (startDate) {
      cteSql += ` AND date(c.data_emissao) >= date(?)`;
      cteParams.push(startDate);
    }
    if (endDate) {
      cteSql += ` AND date(c.data_emissao) <= date(?)`;
      cteParams.push(endDate);
    }
    if (driverId && driverId !== 'all') {
      cteSql += ` AND c.motorista_id = ?`;
      cteParams.push(driverId);
    }
    if (destination) {
      cteSql += ` AND (c.uf_destino LIKE ? OR c.cidade_destino LIKE ?)`;
      const term = `%${destination}%`;
      cteParams.push(term, term);
    }
    if (search) {
      cteSql += ` AND (c.chave_acesso LIKE ? OR CAST(c.numero AS TEXT) LIKE ? OR m.nome LIKE ? OR m.cpf LIKE ?)`;
      const term = `%${search}%`;
      cteParams.push(term, term, term, term);
    }
    if (interstateOnly === 'true' || interstateOnly === true || interstateOnly === '1') {
      cteSql += ` AND (c.interestadual = 1 OR c.uf_origem != c.uf_destino OR (c.uf_origem = 'AL' AND c.uf_destino != 'AL'))`;
    }

    cteSql += ` ORDER BY c.data_emissao DESC`;
    const ctes = queryAll(cteSql, cteParams);
    results.push(...ctes);
  }

  // 2. Fetch MDF-e records if docType is 'all' or 'mdfe'
  if (docType === 'all' || docType === 'mdfe') {
    let mdfeSql = `
      SELECT 
        mdf.id,
        'MDF-e' AS tipo,
        mdf.chave_acesso,
        mdf.numero,
        mdf.serie,
        mdf.data_emissao,
        mdf.uf_origem AS origem,
        '' AS cidade_origem,
        mdf.uf_origem,
        mdf.uf_destino AS destino,
        '' AS cidade_destino,
        mdf.uf_destino,
        mdf.valor_total_carga AS valor,
        0.0 AS valor_icms,
        0.0 AS valor_impostos_total,
        0.0 AS valor_comissao,
        1 AS interestadual,
        mdf.ufs_percurso,
        mdf.placa_tracao,
        mdf.placa_reboque,
        COALESCE(mdf.peso_bruto, 0.0) AS peso_bruto,
        mdf.caminho_xml,
        NULL AS manifesto_id,
        mdf.dados_extras,
        m.id AS motorista_id,
        m.nome AS motorista_nome,
        m.cpf AS motorista_cpf,
        m.cnh AS motorista_cnh,
        COALESCE(m.percentual_comissao, 75.0) AS motorista_percentual_comissao,
        mdf.criado_em
      FROM manifestos_mdfe mdf
      JOIN motoristas m ON mdf.motorista_id = m.id
      WHERE 1=1
    `;
    const mdfeParams = [];

    if (startDate) {
      mdfeSql += ` AND date(mdf.data_emissao) >= date(?)`;
      mdfeParams.push(startDate);
    }
    if (endDate) {
      mdfeSql += ` AND date(mdf.data_emissao) <= date(?)`;
      mdfeParams.push(endDate);
    }
    if (driverId && driverId !== 'all') {
      mdfeSql += ` AND mdf.motorista_id = ?`;
      mdfeParams.push(driverId);
    }
    if (destination) {
      mdfeSql += ` AND mdf.uf_destino LIKE ?`;
      mdfeParams.push(`%${destination}%`);
    }
    if (search) {
      mdfeSql += ` AND (mdf.chave_acesso LIKE ? OR CAST(mdf.numero AS TEXT) LIKE ? OR m.nome LIKE ? OR m.cpf LIKE ?)`;
      const term = `%${search}%`;
      mdfeParams.push(term, term, term, term);
    }

    mdfeSql += ` ORDER BY mdf.data_emissao DESC`;
    const mdfes = queryAll(mdfeSql, mdfeParams);
    results.push(...mdfes);
  }

  // Sort unified results by date_emissao descending
  results.sort((a, b) => new Date(b.data_emissao) - new Date(a.data_emissao));

  // Compute dynamic KPI metrics
  let totalAmount = 0;
  let totalFrete = 0;
  let totalCarga = 0;
  let totalComissao75 = 0;
  let totalICMS = 0;
  let cteCount = 0;
  let mdfeCount = 0;
  let interstateCount = 0;
  const uniqueDrivers = new Set();

  for (const doc of results) {
    totalAmount += (doc.valor || 0);
    if (doc.tipo === 'CT-e') {
      cteCount++;
      totalFrete += (doc.valor || 0);
      totalComissao75 += (doc.valor_comissao || 0);
      totalICMS += (doc.valor_icms || 0);
      if (doc.interestadual === 1) {
        interstateCount++;
      }
    } else {
      mdfeCount++;
      totalCarga += (doc.valor || 0);
      interstateCount++;
    }
    if (doc.motorista_id) {
      uniqueDrivers.add(doc.motorista_id);
    }
  }

  const documentCount = results.length;
  const averageTicket = documentCount > 0 ? (totalAmount / documentCount) : 0;

  return {
    kpis: {
      totalAmount,
      totalFrete,
      totalCarga,
      totalComissao75,
      totalICMS,
      documentCount,
      cteCount,
      mdfeCount,
      interstateCount,
      averageTicket,
      driverCount: uniqueDrivers.size
    },
    items: results
  };
}

/**
 * Retrieve interstate MDF-e Manifestos (trips outside AL or interstate)
 */
function getInterstateManifestos(filters = {}) {
  const { startDate, endDate, driverId, search } = filters;
  let sql = `
    SELECT 
      mdf.id,
      mdf.chave_acesso,
      mdf.numero,
      mdf.serie,
      mdf.data_emissao,
      mdf.uf_origem,
      mdf.uf_destino,
      mdf.ufs_percurso,
      mdf.placa_tracao,
      mdf.placa_reboque,
      COALESCE(mdf.peso_bruto, 0.0) AS peso_bruto,
      mdf.valor_total_carga,
      mdf.caminho_xml,
      mdf.dados_extras,
      m.id AS motorista_id,
      m.nome AS motorista_nome,
      m.cpf AS motorista_cpf,
      (SELECT COUNT(*) FROM conhecimentos_cte WHERE manifesto_id = mdf.id) AS total_ctes_vinculados,
      (SELECT COALESCE(SUM(valor_frete), 0.0) FROM conhecimentos_cte WHERE manifesto_id = mdf.id) AS total_frete_vinculado,
      (SELECT COALESCE(SUM(valor_comissao_motorista), 0.0) FROM conhecimentos_cte WHERE manifesto_id = mdf.id) AS total_comissao_vinculada
    FROM manifestos_mdfe mdf
    JOIN motoristas m ON mdf.motorista_id = m.id
    WHERE 1=1
  `;
  const params = [];

  if (startDate) {
    sql += ` AND date(mdf.data_emissao) >= date(?)`;
    params.push(startDate);
  }
  if (endDate) {
    sql += ` AND date(mdf.data_emissao) <= date(?)`;
    params.push(endDate);
  }
  if (driverId && driverId !== 'all') {
    sql += ` AND mdf.motorista_id = ?`;
    params.push(driverId);
  }
  if (search) {
    sql += ` AND (mdf.chave_acesso LIKE ? OR CAST(mdf.numero AS TEXT) LIKE ? OR m.nome LIKE ? OR m.cpf LIKE ?)`;
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  sql += ` ORDER BY mdf.data_emissao DESC`;
  const manifestos = queryAll(sql, params);

  return manifestos.map(m => ({
    ...m,
    dados_extras: typeof m.dados_extras === 'string' ? JSON.parse(m.dados_extras) : m.dados_extras
  }));
}

/**
 * Get document details by access key for DACTE/DAMDFE rendering
 */
function getDocumentByKey(accessKey) {
  const cleanKey = String(accessKey).replace(/\D/g, '');

  // Check CT-e
  const cte = queryOne(`
    SELECT 
      c.*,
      'CT-e' AS tipo,
      m.nome AS motorista_nome,
      m.cpf AS motorista_cpf,
      m.cnh AS motorista_cnh,
      COALESCE(m.percentual_comissao, 75.0) AS motorista_percentual_comissao
    FROM conhecimentos_cte c
    JOIN motoristas m ON c.motorista_id = m.id
    WHERE c.chave_acesso = ?
  `, [cleanKey]);

  if (cte) {
    return {
      ...cte,
      dados_extras: typeof cte.dados_extras === 'string' ? JSON.parse(cte.dados_extras) : cte.dados_extras
    };
  }

  // Check MDF-e
  const mdfe = queryOne(`
    SELECT 
      mdf.*,
      'MDF-e' AS tipo,
      m.nome AS motorista_nome,
      m.cpf AS motorista_cpf,
      m.cnh AS motorista_cnh,
      COALESCE(m.percentual_comissao, 75.0) AS motorista_percentual_comissao
    FROM manifestos_mdfe mdf
    JOIN motoristas m ON mdf.motorista_id = m.id
    WHERE mdf.chave_acesso = ?
  `, [cleanKey]);

  if (mdfe) {
    return {
      ...mdfe,
      dados_extras: typeof mdfe.dados_extras === 'string' ? JSON.parse(mdfe.dados_extras) : mdfe.dados_extras
    };
  }

  return null;
}

module.exports = {
  getFilteredDocuments,
  getInterstateManifestos,
  getDocumentByKey
};
