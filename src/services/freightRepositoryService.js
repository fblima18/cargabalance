const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database/db');

/**
 * Service for Managing Freight Parameters, Destination Rules and Tax Calculation
 * Based on SEFAZ CT-e / MDF-e audit standards and Corporate Rate Cards
 */

/**
 * Seeds the initial reference record from CARAJAS MATERIAL DE CONSTRUCAO if table is empty
 */
function seedFreightRepositoryIfNeeded() {
  try {
    const existing = queryOne('SELECT COUNT(*) AS total FROM repositorio_fretes');
    if (existing && existing.total > 0) {
      return;
    }

    const id = 'carajas-frete-infor-001';
    const sql = `
      INSERT INTO repositorio_fretes (
        id, codigo_tabela, numero_tabela, tipo_pagamento,
        pagador_nome, pagador_cnpj, cfop_pagador, cfop_destinatario,
        mercadoria_codigo, especie, nota_fiscal_ref, nfs_agrupadas,
        uf_origem, cidade_origem, uf_destino, cidade_destino,
        peso_real_kg, qtde_volume, volume_m3, valor_mercadoria,
        frete_valor, frete_peso, despacho, pedagio, gris,
        tas, tda, tde, tar, trt, cat, itr, adicional_frete,
        paletizacao, capatazia, agendamento,
        aliquota_icms, valor_icms,
        aliquota_cbs, valor_cbs,
        aliquota_ibs_estadual, valor_ibs_estadual,
        aliquota_ibs_municipal, valor_ibs_municipal,
        aliquota_iss, valor_iss,
        base_tributos, valor_total_frete, valor_receber,
        comissao_motorista_75, margem_operacional_25,
        observacoes, ativo
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?
      )
    `;

    execute(sql, [
      id,
      'FRETE INFOR',
      '(CPLR/PALR)',
      'FOB CARTEIRA',
      'CARAJAS MATERIAL DE CONSTRUCAO',
      '03.656.804/0001-31',
      'C',
      'C',
      '001',
      '01',
      '3 1259697',
      20,
      'AL',
      'Maceió',
      'AL',
      'Maceió / Rio Largo',
      30604.924,
      2217,
      0.0,
      20553.44,
      850.00,
      0.0,
      0.0,
      0.0,
      0.0,
      0.0,
      0.0,
      0.0,
      0.0,
      0.0,
      0.0,
      0.0,
      0.0,
      0.0,
      0.0,
      0.0,
      21.50,
      182.75,
      0.90,
      5.78,
      0.10,
      0.64,
      0.0,
      0.0,
      0.0,
      0.0,
      642.59,
      850.00,
      850.00,
      637.50, // 75% de 850.00
      212.50, // 25% margem transportadora
      'Tabela Padrão CARAJAS MATERIAL DE CONSTRUCAO - Cotação FRETE INFOR (CPLR/PALR) - 20 NFs Agrupadas - Peso 30,6t - Alíquota ICMS 21,5%',
      1
    ]);

    console.log('[Freight Repository] Seeded reference CARAJAS MATERIAL DE CONSTRUCAO record successfully.');
  } catch (err) {
    console.warn('[Freight Repository Seed Warning]', err.message);
  }
}

/**
 * List all registered freight rate records
 */
function getAllFreightRules(search = '') {
  seedFreightRepositoryIfNeeded();
  let sql = `SELECT * FROM repositorio_fretes WHERE ativo = 1`;
  const params = [];
  if (search) {
    sql += ` AND (pagador_nome LIKE ? OR pagador_cnpj LIKE ? OR codigo_tabela LIKE ? OR cidade_destino LIKE ? OR uf_destino LIKE ?)`;
    const term = `%${search}%`;
    params.push(term, term, term, term, term);
  }
  sql += ` ORDER BY criado_em DESC`;
  return queryAll(sql, params);
}

/**
 * Get a single freight rate record by ID
 */
function getFreightRuleById(id) {
  seedFreightRepositoryIfNeeded();
  return queryOne('SELECT * FROM repositorio_fretes WHERE id = ?', [id]);
}

/**
 * Create a new freight rate record
 */
function createFreightRule(data) {
  seedFreightRepositoryIfNeeded();
  const id = data.id || `fr-${uuidv4()}`;
  const frete = parseFloat(data.frete_valor || data.valor_total_frete || 850.00);
  const aliqIcms = parseFloat(data.aliquota_icms || 21.50);
  const aliqCbs = parseFloat(data.aliquota_cbs || 0.90);
  const aliqIbsEst = parseFloat(data.aliquota_ibs_estadual || 0.10);
  const aliqIbsMun = parseFloat(data.aliquota_ibs_municipal || 0.0);
  const aliqIss = parseFloat(data.aliquota_iss || 0.0);

  const baseTributos = parseFloat(data.base_tributos || (frete * (1 - (aliqIcms / 100))));
  const valorIcms = parseFloat(data.valor_icms || (frete * (aliqIcms / 100)));
  const valorCbs = parseFloat(data.valor_cbs || (baseTributos * (aliqCbs / 100)));
  const valorIbsEst = parseFloat(data.valor_ibs_estadual || (baseTributos * (aliqIbsEst / 100)));
  const valorIbsMun = parseFloat(data.valor_ibs_municipal || (baseTributos * (aliqIbsMun / 100)));
  const valorIss = parseFloat(data.valor_iss || (frete * (aliqIss / 100)));

  const comissao75 = parseFloat(data.comissao_motorista_75 || (frete * 0.75));
  const margem25 = parseFloat(data.margem_operacional_25 || Math.max(0, frete - comissao75));

  const sql = `
    INSERT INTO repositorio_fretes (
      id, codigo_tabela, numero_tabela, tipo_pagamento,
      pagador_nome, pagador_cnpj, cfop_pagador, cfop_destinatario,
      mercadoria_codigo, especie, nota_fiscal_ref, nfs_agrupadas,
      uf_origem, cidade_origem, uf_destino, cidade_destino,
      peso_real_kg, qtde_volume, volume_m3, valor_mercadoria,
      frete_valor, frete_peso, despacho, pedagio, gris,
      tas, tda, tde, tar, trt, cat, itr, adicional_frete,
      paletizacao, capatazia, agendamento,
      aliquota_icms, valor_icms,
      aliquota_cbs, valor_cbs,
      aliquota_ibs_estadual, valor_ibs_estadual,
      aliquota_ibs_municipal, valor_ibs_municipal,
      aliquota_iss, valor_iss,
      base_tributos, valor_total_frete, valor_receber,
      comissao_motorista_75, margem_operacional_25,
      observacoes, ativo
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?
    )
  `;

  execute(sql, [
    id,
    data.codigo_tabela || 'FRETE INFOR',
    data.numero_tabela || '(CPLR/PALR)',
    data.tipo_pagamento || 'FOB CARTEIRA',
    data.pagador_nome || 'CARAJAS MATERIAL DE CONSTRUCAO',
    data.pagador_cnpj || '03.656.804/0001-31',
    data.cfop_pagador || 'C',
    data.cfop_destinatario || 'C',
    data.mercadoria_codigo || '001',
    data.especie || '01',
    data.nota_fiscal_ref || '',
    parseInt(data.nfs_agrupadas || 1, 10),
    data.uf_origem || 'AL',
    data.cidade_origem || 'Maceió',
    data.uf_destino || 'AL',
    data.cidade_destino || 'Maceió',
    parseFloat(data.peso_real_kg || 0.0),
    parseInt(data.qtde_volume || 0, 10),
    parseFloat(data.volume_m3 || 0.0),
    parseFloat(data.valor_mercadoria || 0.0),
    frete,
    parseFloat(data.frete_peso || 0.0),
    parseFloat(data.despacho || 0.0),
    parseFloat(data.pedagio || 0.0),
    parseFloat(data.gris || 0.0),
    parseFloat(data.tas || 0.0),
    parseFloat(data.tda || 0.0),
    parseFloat(data.tde || 0.0),
    parseFloat(data.tar || 0.0),
    parseFloat(data.trt || 0.0),
    parseFloat(data.cat || 0.0),
    parseFloat(data.itr || 0.0),
    parseFloat(data.adicional_frete || 0.0),
    parseFloat(data.paletizacao || 0.0),
    parseFloat(data.capatazia || 0.0),
    parseFloat(data.agendamento || 0.0),
    aliqIcms,
    valorIcms,
    aliqCbs,
    valorCbs,
    aliqIbsEst,
    valorIbsEst,
    aliqIbsMun,
    valorIbsMun,
    aliqIss,
    valorIss,
    baseTributos,
    frete,
    frete,
    comissao75,
    margem25,
    data.observacoes || '',
    1
  ]);

  return getFreightRuleById(id);
}

/**
 * Update an existing freight rate record
 */
function updateFreightRule(id, data) {
  const existing = getFreightRuleById(id);
  if (!existing) {
    throw new Error('Registro de tabela de frete não encontrado');
  }

  const frete = parseFloat(data.frete_valor !== undefined ? data.frete_valor : existing.frete_valor);
  const aliqIcms = parseFloat(data.aliquota_icms !== undefined ? data.aliquota_icms : existing.aliquota_icms);
  const aliqCbs = parseFloat(data.aliquota_cbs !== undefined ? data.aliquota_cbs : existing.aliquota_cbs);
  const aliqIbsEst = parseFloat(data.aliquota_ibs_estadual !== undefined ? data.aliquota_ibs_estadual : existing.aliquota_ibs_estadual);
  const comissao75 = frete * 0.75;
  const margem25 = Math.max(0, frete - comissao75);
  const valorIcms = frete * (aliqIcms / 100);

  const sql = `
    UPDATE repositorio_fretes SET
      codigo_tabela = ?, numero_tabela = ?, tipo_pagamento = ?,
      pagador_nome = ?, pagador_cnpj = ?,
      uf_origem = ?, cidade_origem = ?, uf_destino = ?, cidade_destino = ?,
      peso_real_kg = ?, qtde_volume = ?, valor_mercadoria = ?,
      frete_valor = ?, valor_total_frete = ?, valor_receber = ?,
      aliquota_icms = ?, valor_icms = ?,
      aliquota_cbs = ?, aliquota_ibs_estadual = ?,
      comissao_motorista_75 = ?, margem_operacional_25 = ?,
      observacoes = ?
    WHERE id = ?
  `;

  execute(sql, [
    data.codigo_tabela || existing.codigo_tabela,
    data.numero_tabela || existing.numero_tabela,
    data.tipo_pagamento || existing.tipo_pagamento,
    data.pagador_nome || existing.pagador_nome,
    data.pagador_cnpj || existing.pagador_cnpj,
    data.uf_origem || existing.uf_origem,
    data.cidade_origem || existing.cidade_origem,
    data.uf_destino || existing.uf_destino,
    data.cidade_destino || existing.cidade_destino,
    parseFloat(data.peso_real_kg !== undefined ? data.peso_real_kg : existing.peso_real_kg),
    parseInt(data.qtde_volume !== undefined ? data.qtde_volume : existing.qtde_volume, 10),
    parseFloat(data.valor_mercadoria !== undefined ? data.valor_mercadoria : existing.valor_mercadoria),
    frete,
    frete,
    frete,
    aliqIcms,
    valorIcms,
    aliqCbs,
    aliqIbsEst,
    comissao75,
    margem25,
    data.observacoes !== undefined ? data.observacoes : existing.observacoes,
    id
  ]);

  return getFreightRuleById(id);
}

/**
 * Delete / deactivate a freight rate record
 */
function deleteFreightRule(id) {
  execute('UPDATE repositorio_fretes SET ativo = 0 WHERE id = ?', [id]);
  return { success: true };
}

/**
 * Calculate dynamic quotation and tax distribution for a given destination and freight value
 */
function calculateFreightQuote(params = {}) {
  const frete = parseFloat(params.frete_valor || 850.00);
  const aliqIcms = parseFloat(params.aliquota_icms !== undefined ? params.aliquota_icms : 21.50);
  const aliqCbs = parseFloat(params.aliquota_cbs !== undefined ? params.aliquota_cbs : 0.90);
  const aliqIbsEst = parseFloat(params.aliquota_ibs_estadual !== undefined ? params.aliquota_ibs_estadual : 0.10);
  const aliqIbsMun = parseFloat(params.aliquota_ibs_municipal !== undefined ? params.aliquota_ibs_municipal : 0.0);
  const aliqIss = parseFloat(params.aliquota_iss !== undefined ? params.aliquota_iss : 0.0);

  // ICMS and reform taxes
  const valorIcms = Number((frete * (aliqIcms / 100)).toFixed(2));
  const baseTributos = Number((frete - valorIcms).toFixed(2));
  const valorCbs = Number((baseTributos * (aliqCbs / 100)).toFixed(2));
  const valorIbsEst = Number((baseTributos * (aliqIbsEst / 100)).toFixed(2));
  const valorIbsMun = Number((baseTributos * (aliqIbsMun / 100)).toFixed(2));
  const valorIss = Number((frete * (aliqIss / 100)).toFixed(2));

  // Commission 75% and Transport Company Margin 25%
  const comissao75 = Number((frete * 0.75).toFixed(2));
  const margem25 = Number((frete * 0.25).toFixed(2));

  return {
    frete_valor: frete,
    valor_total_frete: frete,
    valor_receber: frete,
    base_tributos: baseTributos,
    aliquota_icms: aliqIcms,
    valor_icms: valorIcms,
    aliquota_cbs: aliqCbs,
    valor_cbs: valorCbs,
    aliquota_ibs_estadual: aliqIbsEst,
    valor_ibs_estadual: valorIbsEst,
    aliquota_ibs_municipal: aliqIbsMun,
    valor_ibs_municipal: valorIbsMun,
    aliquota_iss: aliqIss,
    valor_iss: valorIss,
    total_impostos: Number((valorIcms + valorCbs + valorIbsEst + valorIbsMun + valorIss).toFixed(2)),
    comissao_motorista_75: comissao75,
    margem_operacional_25: margem25,
    percentual_comissao: 75.0
  };
}

module.exports = {
  seedFreightRepositoryIfNeeded,
  getAllFreightRules,
  getFreightRuleById,
  createFreightRule,
  updateFreightRule,
  deleteFreightRule,
  calculateFreightQuote
};
