const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { queryAll, queryOne, execute } = require('../database/db');

/**
 * Generates a valid-format 44-digit SEFAZ access key for manual documents
 */
function generateAccessKey(uf = '27', model = '57', serie = 1, numero = 1) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const aamm = `${yy}${mm}`;
  const cnpj = '20664328000110'; // Transportadora padrão
  const mod = String(model).padStart(2, '0');
  const ser = String(serie).padStart(3, '0');
  const num = String(numero).padStart(9, '0');
  const tpEmis = '1';
  const cNF = String(Math.floor(10000000 + Math.random() * 90000000));
  
  const keyBase = `${uf}${aamm}${cnpj}${mod}${ser}${num}${tpEmis}${cNF}`;
  
  // Calculate check digit (módulo 11)
  let weight = 2;
  let sum = 0;
  for (let i = keyBase.length - 1; i >= 0; i--) {
    sum += parseInt(keyBase[i], 10) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const mod11 = sum % 11;
  const cd = (mod11 === 0 || mod11 === 1) ? 0 : 11 - mod11;

  return `${keyBase}${cd}`;
}

/**
 * Safely parses any date string (ISO, Brazilian DD/MM/YYYY, SQLite) into unix timestamp
 */
function parseSafeTimestamp(val) {
  if (!val) return 0;
  if (val instanceof Date) return isNaN(val.getTime()) ? 0 : val.getTime();
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const str = String(val).trim();
  if (!str || str === '-') return 0;

  // 1. Direct standard parse
  let d = new Date(str);
  if (!isNaN(d.getTime())) return d.getTime();

  // 2. Brazilian format: DD/MM/YYYY or DD/MM/YY with optional HH:mm[:ss]
  const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (brMatch) {
    let dia = parseInt(brMatch[1], 10);
    let mes = parseInt(brMatch[2], 10) - 1;
    let ano = parseInt(brMatch[3], 10);
    if (ano < 100) ano += 2000;
    let hora = brMatch[4] ? parseInt(brMatch[4], 10) : 0;
    let min = brMatch[5] ? parseInt(brMatch[5], 10) : 0;
    let seg = brMatch[6] ? parseInt(brMatch[6], 10) : 0;
    const parsed = new Date(ano, mes, dia, hora, min, seg);
    if (!isNaN(parsed.getTime())) return parsed.getTime();
  }

  // 3. SQLite format: YYYY-MM-DD HH:mm:ss
  const isoSpaceMatch = str.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (isoSpaceMatch) {
    d = new Date(str.replace(' ', 'T'));
    if (!isNaN(d.getTime())) return d.getTime();
  }

  return 0;
}

/**
 * Retorna o timestamp do evento principal mais recente de uma linha/viagem
 * Avalia início (data_saida || data_emissao), previsão/fim (previsao_chegada) e criação
 */
function getDocPrimaryTimestamp(doc) {
  if (!doc) return 0;
  const tSaida = parseSafeTimestamp(doc.data_saida || doc.data_emissao);
  const tChegada = parseSafeTimestamp(doc.previsao_chegada);
  const tEmissao = parseSafeTimestamp(doc.data_emissao);
  const tCriado = parseSafeTimestamp(doc.criado_em);
  return Math.max(tSaida, tChegada, tEmissao, tCriado);
}

/**
 * Ordenador decrescente (DESC) para listagens e históricos de documentos fiscais e viagens
 * Critério principal: timestamp do evento mais recente (DESC)
 * Critério de desempate: saída -> chegada -> emissão -> número do documento
 */
function compareDocumentsDesc(a, b) {
  const timeA = getDocPrimaryTimestamp(a);
  const timeB = getDocPrimaryTimestamp(b);
  if (timeB !== timeA) return timeB - timeA;

  const saidaA = parseSafeTimestamp(a.data_saida || a.data_emissao);
  const saidaB = parseSafeTimestamp(b.data_saida || b.data_emissao);
  if (saidaB !== saidaA) return saidaB - saidaA;

  const prevA = parseSafeTimestamp(a.previsao_chegada);
  const prevB = parseSafeTimestamp(b.previsao_chegada);
  if (prevB !== prevA) return prevB - prevA;

  const numA = parseInt(String(a.numero || 0).replace(/\D/g, ''), 10) || 0;
  const numB = parseInt(String(b.numero || 0).replace(/\D/g, ''), 10) || 0;
  if (numB !== numA) return numB - numA;

  return String(b.chave_acesso || b.id || '').localeCompare(String(a.chave_acesso || a.id || ''));
}

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
    searchType = 'all', // 'all' | 'driver' | 'cte' | 'mdfe' | 'route'
    interstateOnly // 'true' | '1' | boolean
  } = filters;

  const results = [];

  // 1. Fetch CT-e records if docType is 'all' or 'cte'
  if ((docType === 'all' || docType === 'cte') && searchType !== 'mdfe') {
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
        c.ufs_percurso,
        c.remetente_nome,
        c.remetente_cnpj,
        c.destinatario_nome,
        c.destinatario_cnpj,
        c.data_saida,
        c.previsao_chegada,
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
        COALESCE(m.tipo_vinculo, 'frota_propria') AS motorista_tipo_vinculo,
        m.placa_cavalo AS motorista_placa_cavalo,
        m.placa_carreta AS motorista_placa_carreta,
        m.chave_pix AS motorista_chave_pix,
        m.telefone AS motorista_telefone,
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
      const term = `%${search}%`;
      if (searchType === 'driver') {
        cteSql += ` AND (m.nome LIKE ? OR m.cpf LIKE ?)`;
        cteParams.push(term, term);
      } else if (searchType === 'cte') {
        cteSql += ` AND (c.chave_acesso LIKE ? OR CAST(c.numero AS TEXT) LIKE ?)`;
        cteParams.push(term, term);
      } else if (searchType === 'route') {
        cteSql += ` AND (c.cidade_origem LIKE ? OR c.uf_origem LIKE ? OR c.cidade_destino LIKE ? OR c.uf_destino LIKE ? OR c.ufs_percurso LIKE ? OR (c.cidade_origem || ' ' || c.cidade_destino) LIKE ? OR (c.cidade_origem || '/' || c.uf_origem || ' - ' || c.cidade_destino || '/' || c.uf_destino) LIKE ?)`;
        cteParams.push(term, term, term, term, term, term, term);
      } else {
        // 'all': matches across Driver, CT-e, Route, or Companies
        cteSql += ` AND (
          c.chave_acesso LIKE ? 
          OR CAST(c.numero AS TEXT) LIKE ? 
          OR m.nome LIKE ? 
          OR m.cpf LIKE ?
          OR c.cidade_origem LIKE ? 
          OR c.uf_origem LIKE ? 
          OR c.cidade_destino LIKE ? 
          OR c.uf_destino LIKE ? 
          OR c.ufs_percurso LIKE ?
          OR c.remetente_nome LIKE ?
          OR c.destinatario_nome LIKE ?
          OR c.remetente_cnpj LIKE ?
          OR c.destinatario_cnpj LIKE ?
          OR (c.cidade_origem || ' ' || c.cidade_destino) LIKE ?
        )`;
        cteParams.push(term, term, term, term, term, term, term, term, term, term, term, term, term, term);
      }
    }
    if (interstateOnly === 'true' || interstateOnly === true || interstateOnly === '1') {
      cteSql += ` AND (c.interestadual = 1 OR c.uf_origem != c.uf_destino OR (c.uf_origem = 'AL' AND c.uf_destino != 'AL'))`;
    }

    cteSql += ` ORDER BY MAX(
      COALESCE(c.data_saida, ''),
      COALESCE(c.previsao_chegada, ''),
      COALESCE(c.data_emissao, ''),
      COALESCE(c.criado_em, '')
    ) DESC, c.numero DESC`;
    const ctes = queryAll(cteSql, cteParams);
    results.push(...ctes);
  }

  // 2. Fetch MDF-e records if docType is 'all' or 'mdfe'
  if ((docType === 'all' || docType === 'mdfe') && searchType !== 'cte') {
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
        mdf.remetente_nome,
        mdf.remetente_cnpj,
        mdf.destinatario_nome,
        mdf.destinatario_cnpj,
        mdf.data_saida,
        mdf.previsao_chegada,
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
        COALESCE(m.tipo_vinculo, 'frota_propria') AS motorista_tipo_vinculo,
        COALESCE(mdf.placa_tracao, m.placa_cavalo) AS motorista_placa_cavalo,
        COALESCE(mdf.placa_reboque, m.placa_carreta) AS motorista_placa_carreta,
        m.chave_pix AS motorista_chave_pix,
        m.telefone AS motorista_telefone,
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
      const term = `%${search}%`;
      if (searchType === 'driver') {
        mdfeSql += ` AND (m.nome LIKE ? OR m.cpf LIKE ?)`;
        mdfeParams.push(term, term);
      } else if (searchType === 'mdfe') {
        mdfeSql += ` AND (mdf.chave_acesso LIKE ? OR CAST(mdf.numero AS TEXT) LIKE ?)`;
        mdfeParams.push(term, term);
      } else if (searchType === 'route') {
        mdfeSql += ` AND (mdf.uf_origem LIKE ? OR mdf.uf_destino LIKE ? OR mdf.ufs_percurso LIKE ? OR (mdf.uf_origem || ' ' || mdf.uf_destino) LIKE ? OR (mdf.uf_origem || ' -> ' || mdf.uf_destino) LIKE ?)`;
        mdfeParams.push(term, term, term, term, term);
      } else {
        // 'all'
        mdfeSql += ` AND (
          mdf.chave_acesso LIKE ? 
          OR CAST(mdf.numero AS TEXT) LIKE ? 
          OR m.nome LIKE ? 
          OR m.cpf LIKE ?
          OR mdf.uf_origem LIKE ?
          OR mdf.uf_destino LIKE ?
          OR mdf.ufs_percurso LIKE ?
          OR mdf.remetente_nome LIKE ?
          OR mdf.destinatario_nome LIKE ?
          OR mdf.remetente_cnpj LIKE ?
          OR mdf.destinatario_cnpj LIKE ?
        )`;
        mdfeParams.push(term, term, term, term, term, term, term, term, term, term, term);
      }
    }

    mdfeSql += ` ORDER BY MAX(
      COALESCE(mdf.data_saida, ''),
      COALESCE(mdf.previsao_chegada, ''),
      COALESCE(mdf.data_emissao, ''),
      COALESCE(mdf.criado_em, '')
    ) DESC, mdf.numero DESC`;
    const mdfes = queryAll(mdfeSql, mdfeParams);
    results.push(...mdfes);
  }

  // Sort unified results by most recent event timestamp descending (DESC)
  results.sort(compareDocumentsDesc);

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
  const { startDate, endDate, driverId, search, searchType = 'all' } = filters;
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
    const term = `%${search}%`;
    if (searchType === 'driver') {
      sql += ` AND (m.nome LIKE ? OR m.cpf LIKE ?)`;
      params.push(term, term);
    } else if (searchType === 'route') {
      sql += ` AND (mdf.uf_origem LIKE ? OR mdf.uf_destino LIKE ? OR mdf.ufs_percurso LIKE ? OR (mdf.uf_origem || ' ' || mdf.uf_destino) LIKE ?)`;
      params.push(term, term, term, term);
    } else {
      sql += ` AND (mdf.chave_acesso LIKE ? OR CAST(mdf.numero AS TEXT) LIKE ? OR m.nome LIKE ? OR m.cpf LIKE ? OR mdf.uf_origem LIKE ? OR mdf.uf_destino LIKE ? OR mdf.ufs_percurso LIKE ?)`;
      params.push(term, term, term, term, term, term, term);
    }
  }

  sql += ` ORDER BY MAX(
    COALESCE(mdf.data_saida, ''),
    COALESCE(mdf.previsao_chegada, ''),
    COALESCE(mdf.data_emissao, ''),
    COALESCE(mdf.criado_em, '')
  ) DESC, mdf.numero DESC`;
  const manifestos = queryAll(sql, params);
  manifestos.sort(compareDocumentsDesc);

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

/**
 * Create a Manual Trip (CT-e or MDF-e)
 */
function createManualTrip(data) {
  const {
    tipo = 'CT-e',
    numero,
    serie,
    data_emissao,
    motorista_id,
    cidade_origem = 'Rio Largo',
    uf_origem = 'AL',
    cidade_destino = 'Juazeiro do Norte',
    uf_destino = 'CE',
    remetente_nome = 'CARAJAS MATERIAL DE CONSTRUCAO LTDA',
    remetente_cnpj = '03.656.804/0007-27',
    destinatario_nome = 'CARAJAS - FIL JUAZEIRO DO NORTE',
    destinatario_cnpj = '03.656.804/0016-18',
    data_saida,
    previsao_chegada,
    valor_frete = 0,
    aliquota_icms = 12.0,
    valor_icms: customValorIcms,
    valor_total_carga = 0,
    placa_tracao = 'LQW0A19',
    placa_reboque = 'MUV0J59',
    peso_bruto = 0,
    ufs_percurso = 'PE'
  } = data;

  if (!motorista_id) {
    throw new Error('Selecione ou informe um condutor/motorista válido.');
  }

  const driver = queryOne('SELECT * FROM motoristas WHERE id = ?', [motorista_id]);
  if (!driver) {
    throw new Error('Motorista não encontrado no banco de dados.');
  }

  const docNumero = parseInt(numero, 10);
  if (!docNumero || isNaN(docNumero)) {
    throw new Error('Número de documento inválido.');
  }

  const docSerie = parseInt(serie, 10) || (tipo === 'CT-e' ? 1 : 3);
  const docDate = data_emissao ? new Date(data_emissao).toISOString() : new Date().toISOString();
  const id = crypto.randomUUID();

  // Departure and arrival dates
  const dataSaidaReal = data_saida ? new Date(data_saida).toISOString() : docDate;
  let previsaoChegadaReal = previsao_chegada ? new Date(previsao_chegada).toISOString() : null;
  if (!previsaoChegadaReal) {
    const d = new Date(dataSaidaReal);
    d.setHours(d.getHours() + (uf_origem !== uf_destino ? 36 : 14));
    previsaoChegadaReal = d.toISOString();
  }

  // Model 57 for CT-e, 58 for MDF-e
  const model = tipo === 'CT-e' ? '57' : '58';
  const chaveAcesso = generateAccessKey(uf_origem === 'AL' ? '27' : '26', model, docSerie, docNumero);

  // Prepare upload directory for synthetic XML file
  const xmlDir = path.resolve(__dirname, '../../uploads/xml');
  if (!fs.existsSync(xmlDir)) {
    fs.mkdirSync(xmlDir, { recursive: true });
  }
  const xmlFilePath = path.join(xmlDir, `${chaveAcesso}.xml`);

  if (tipo === 'CT-e') {
    const frete = parseFloat(valor_frete) || 0;
    if (frete <= 0) {
      throw new Error('O valor do frete deve ser maior que zero.');
    }

    const aliq = parseFloat(aliquota_icms) || 12.0;
    const valorIcms = customValorIcms !== undefined && customValorIcms !== null && customValorIcms !== '' 
      ? parseFloat(customValorIcms) 
      : Math.round(frete * (aliq / 100) * 100) / 100;

    // 75% commission or driver's custom percentage
    const commissionPercent = parseFloat(driver.percentual_comissao) || 75.0;
    const valorComissao = Math.round(frete * (commissionPercent / 100) * 100) / 100;
    const isInterstate = (uf_origem !== uf_destino) ? 1 : 0;

    const dadosExtras = {
      emitente: {
        razao_social: 'AUTO VIACAO TRANSPORTE LTDA',
        cnpj: '20.664.328/0001-10',
        municipio: cidade_origem,
        uf: uf_origem
      },
      remetente: {
        nome: remetente_nome,
        razao_social: remetente_nome,
        cnpj_cpf: remetente_cnpj,
        municipio: cidade_origem,
        uf: uf_origem
      },
      destinatario: {
        nome: destinatario_nome,
        razao_social: destinatario_nome,
        cnpj_cpf: destinatario_cnpj,
        municipio: cidade_destino,
        uf: uf_destino
      },
      cronograma: {
        dataSaida: dataSaidaReal,
        previsaoChegada: previsaoChegadaReal
      },
      ufsPercurso: ufs_percurso,
      veiculo: {
        placa_tracao,
        placa_reboque
      },
      origem_cadastro: 'MANUAL'
    };

    // Create minimal valid XML so DACTE viewer and download work
    const xmlMock = `<?xml version="1.0" encoding="UTF-8"?>
<cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00">
  <CTe>
    <infCte Id="CTe${chaveAcesso}" versao="4.00">
      <ide>
        <cUF>27</cUF>
        <cCT>00000000</cCT>
        <CFOP>6352</CFOP>
        <natOp>PRESTACAO DE SERVICO DE TRANSPORTE</natOp>
        <mod>57</mod>
        <serie>${docSerie}</serie>
        <nCT>${docNumero}</nCT>
        <dhEmi>${docDate}</dhEmi>
        <dhSaiEnt>${dataSaidaReal}</dhSaiEnt>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>${chaveAcesso.slice(-1)}</cDV>
        <tpAmb>1</tpAmb>
        <tpCTe>0</tpCTe>
        <procEmi>0</procEmi>
        <verProc>1.0</verProc>
        <cMunIni>2707701</cMunIni>
        <xMunIni>${cidade_origem}</xMunIni>
        <UFIni>${uf_origem}</UFIni>
        <cMunFim>2307304</cMunFim>
        <xMunFim>${cidade_destino}</xMunFim>
        <UFFim>${uf_destino}</UFFim>
      </ide>
      <emit>
        <CNPJ>20664328000110</CNPJ>
        <IE>240000000</IE>
        <xNome>AUTO VIACAO TRANSPORTE LTDA</xNome>
        <xFant>CARGA BALANCE</xFant>
      </emit>
      <rem><CNPJ>${remetente_cnpj.replace(/\D/g, '') || '03656804000727'}</CNPJ><xNome>${remetente_nome}</xNome></rem>
      <dest><CNPJ>${destinatario_cnpj.replace(/\D/g, '') || '03656804001618'}</CNPJ><xNome>${destinatario_nome}</xNome></dest>
      <vPrest>
        <vTPrest>${frete.toFixed(2)}</vTPrest>
        <vRec>${frete.toFixed(2)}</vRec>
        <Comp><xNome>FRETE PESO</xNome><vComp>${frete.toFixed(2)}</vComp></Comp>
      </vPrest>
      <imp>
        <ICMS>
          <ICMS00>
            <CST>00</CST>
            <vBC>${frete.toFixed(2)}</vBC>
            <pICMS>${aliq.toFixed(2)}</pICMS>
            <vICMS>${valorIcms.toFixed(2)}</vICMS>
          </ICMS00>
        </ICMS>
      </imp>
    </infCte>
  </CTe>
</cteProc>`;

    fs.writeFileSync(xmlFilePath, xmlMock, 'utf-8');

    execute(`
      INSERT INTO conhecimentos_cte (
        id, motorista_id, chave_acesso, numero, serie, data_emissao,
        cidade_origem, uf_origem, cidade_destino, uf_destino,
        ufs_percurso, remetente_nome, remetente_cnpj, destinatario_nome, destinatario_cnpj,
        data_saida, previsao_chegada,
        valor_frete, valor_icms, valor_impostos_total, valor_comissao_motorista,
        interestadual, caminho_xml, dados_extras
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      motorista_id,
      chaveAcesso,
      docNumero,
      docSerie,
      docDate,
      cidade_origem,
      uf_origem,
      cidade_destino,
      uf_destino,
      ufs_percurso,
      remetente_nome,
      remetente_cnpj,
      destinatario_nome,
      destinatario_cnpj,
      dataSaidaReal,
      previsaoChegadaReal,
      frete,
      valorIcms,
      valorIcms,
      valorComissao,
      isInterstate,
      xmlFilePath,
      JSON.stringify(dadosExtras)
    ]);

    return {
      success: true,
      tipo: 'CT-e',
      id,
      chave_acesso: chaveAcesso,
      numero: docNumero,
      motorista_nome: driver.nome,
      motorista_cpf: driver.cpf,
      remetente_nome,
      destinatario_nome,
      data_saida: dataSaidaReal,
      previsao_chegada: previsaoChegadaReal,
      ufs_percurso,
      valor_frete: frete,
      valor_icms: valorIcms,
      valor_comissao: valorComissao,
      percentual_comissao: commissionPercent,
      origem: `${cidade_origem}/${uf_origem}`,
      destino: `${cidade_destino}/${uf_destino}`,
      message: `CT-e nº ${docNumero} inserido manualmente com sucesso!`
    };
  } else {
    // MDF-e
    const valorCarga = parseFloat(valor_total_carga) || 0;
    const peso = parseFloat(peso_bruto) || 0;

    const dadosExtras = {
      emitente: {
        razao_social: 'AUTO VIACAO TRANSPORTE LTDA',
        cnpj: '20.664.328/0001-10',
        municipio: cidade_origem || 'Rio Largo',
        uf: uf_origem
      },
      remetente: {
        nome: remetente_nome,
        cnpj: remetente_cnpj
      },
      destinatario: {
        nome: destinatario_nome,
        cnpj: destinatario_cnpj
      },
      cronograma: {
        dataSaida: dataSaidaReal,
        previsaoChegada: previsaoChegadaReal
      },
      ufsPercurso: ufs_percurso,
      veiculo: {
        placa_tracao,
        placa_reboque,
        rntrc: '00000000'
      },
      origem_cadastro: 'MANUAL'
    };

    // Create minimal valid MDF-e XML
    const xmlMock = `<?xml version="1.0" encoding="UTF-8"?>
<mdfeProc xmlns="http://www.portalfiscal.inf.br/mdfe" versao="3.00">
  <MDFe>
    <infMDFe Id="MDFe${chaveAcesso}" versao="3.00">
      <ide>
        <cUF>27</cUF>
        <tpAmb>1</tpAmb>
        <tpEmit>1</tpEmit>
        <mod>58</mod>
        <serie>${docSerie}</serie>
        <nMDF>${docNumero}</nMDF>
        <dhEmi>${docDate}</dhEmi>
        <dhIniViagem>${dataSaidaReal}</dhIniViagem>
        <UFIni>${uf_origem}</UFIni>
        <UFFim>${uf_destino}</UFFim>
        <infPercurso><UFPer>${ufs_percurso || 'PE'}</UFPer></infPercurso>
      </ide>
      <emit>
        <CNPJ>20664328000110</CNPJ>
        <xNome>AUTO VIACAO TRANSPORTE LTDA</xNome>
      </emit>
      <infModal versaoModal="3.00">
        <rodo>
          <veicTracao>
            <placa>${placa_tracao}</placa>
            <condutor>
              <xNome>${driver.nome}</xNome>
              <CPF>${driver.cpf.replace(/\D/g, '')}</CPF>
            </condutor>
          </veicTracao>
          <veicReboque>
            <placa>${placa_reboque}</placa>
          </veicReboque>
        </rodo>
      </infModal>
      <tot>
        <qCTe>1</qCTe>
        <vCarga>${valorCarga.toFixed(2)}</vCarga>
        <cUnid>01</cUnid>
        <qCarga>${peso.toFixed(2)}</qCarga>
      </tot>
    </infMDFe>
  </MDFe>
</mdfeProc>`;

    fs.writeFileSync(xmlFilePath, xmlMock, 'utf-8');

    execute(`
      INSERT INTO manifestos_mdfe (
        id, chave_acesso, numero, serie, data_emissao,
        uf_origem, uf_destino, ufs_percurso,
        remetente_nome, remetente_cnpj, destinatario_nome, destinatario_cnpj,
        data_saida, previsao_chegada,
        placa_tracao, placa_reboque,
        peso_bruto, motorista_id, valor_total_carga, caminho_xml, dados_extras
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      chaveAcesso,
      docNumero,
      docSerie,
      docDate,
      uf_origem,
      uf_destino,
      ufs_percurso,
      remetente_nome,
      remetente_cnpj,
      destinatario_nome,
      destinatario_cnpj,
      dataSaidaReal,
      previsaoChegadaReal,
      placa_tracao,
      placa_reboque,
      peso,
      motorista_id,
      valorCarga,
      xmlFilePath,
      JSON.stringify(dadosExtras)
    ]);

    return {
      success: true,
      tipo: 'MDF-e',
      id,
      chave_acesso: chaveAcesso,
      numero: docNumero,
      motorista_nome: driver.nome,
      motorista_cpf: driver.cpf,
      remetente_nome,
      destinatario_nome,
      data_saida: dataSaidaReal,
      previsao_chegada: previsaoChegadaReal,
      ufs_percurso,
      valor_total_carga: valorCarga,
      origem: uf_origem,
      destino: uf_destino,
      message: `Manifesto MDF-e nº ${docNumero} inserido manualmente com sucesso!`
    };
  }
}

/**
 * Delete a document (CT-e or MDF-e) by type and id or access key
 */
function deleteDocument(type, idOrKey) {
  const normType = String(type || '').trim().toLowerCase();
  
  if (normType === 'ct-e' || normType === 'cte') {
    const existing = queryOne('SELECT * FROM conhecimentos_cte WHERE id = ? OR chave_acesso = ?', [idOrKey, idOrKey]);
    if (existing) {
      execute('DELETE FROM conhecimentos_cte WHERE id = ?', [existing.id]);
      return {
        success: true,
        tipo: 'CT-e',
        numero: existing.numero,
        message: `CT-e nº ${existing.numero} excluído com sucesso.`
      };
    }
  }

  if (normType === 'mdf-e' || normType === 'mdfe') {
    const existing = queryOne('SELECT * FROM manifestos_mdfe WHERE id = ? OR chave_acesso = ?', [idOrKey, idOrKey]);
    if (existing) {
      execute('UPDATE conhecimentos_cte SET manifesto_id = NULL WHERE manifesto_id = ?', [existing.id]);
      execute('DELETE FROM manifestos_mdfe WHERE id = ?', [existing.id]);
      return {
        success: true,
        tipo: 'MDF-e',
        numero: existing.numero,
        message: `MDF-e nº ${existing.numero} excluído com sucesso.`
      };
    }
  }

  // Fallback: search both tables regardless of type parameter
  const cte = queryOne('SELECT * FROM conhecimentos_cte WHERE id = ? OR chave_acesso = ?', [idOrKey, idOrKey]);
  if (cte) {
    execute('DELETE FROM conhecimentos_cte WHERE id = ?', [cte.id]);
    return { success: true, tipo: 'CT-e', numero: cte.numero, message: `CT-e nº ${cte.numero} excluído com sucesso.` };
  }

  const mdfe = queryOne('SELECT * FROM manifestos_mdfe WHERE id = ? OR chave_acesso = ?', [idOrKey, idOrKey]);
  if (mdfe) {
    execute('UPDATE conhecimentos_cte SET manifesto_id = NULL WHERE manifesto_id = ?', [mdfe.id]);
    execute('DELETE FROM manifestos_mdfe WHERE id = ?', [mdfe.id]);
    return { success: true, tipo: 'MDF-e', numero: mdfe.numero, message: `MDF-e nº ${mdfe.numero} excluído com sucesso.` };
  }

  throw new Error(`Documento fiscal "${idOrKey}" não encontrado para exclusão.`);
}

module.exports = {
  getFilteredDocuments,
  getInterstateManifestos,
  getDocumentByKey,
  createManualTrip,
  deleteDocument,
  parseSafeTimestamp,
  getDocPrimaryTimestamp,
  compareDocumentsDesc
};

