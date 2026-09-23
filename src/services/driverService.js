const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database/db');

// Format CPF to 000.000.000-00
function formatCPF(raw) {
  if (!raw) return '000.000.000-00';
  const digits = String(raw).replace(/\D/g, '').padStart(11, '0').slice(-11);
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Retrieve all drivers with aggregated balance, 75% commission, and trip counts
 */
function getAllDriversWithBalance() {
  const sql = `
    SELECT 
      m.id,
      m.nome,
      m.cpf,
      m.cnh,
      COALESCE(m.percentual_comissao, 75.0) AS percentual_comissao,
      COALESCE(m.placa_cavalo, '') AS placa_cavalo,
      COALESCE(m.placa_carreta, '') AS placa_carreta,
      COALESCE(m.tipo_vinculo, 'frota_propria') AS tipo_vinculo,
      m.telefone,
      m.chave_pix,
      m.ativo,
      m.criado_em,
      COUNT(DISTINCT c.id) AS total_ctes,
      COUNT(DISTINCT mdf.id) AS total_mdfes,
      COALESCE(SUM(c.valor_frete), 0.0) AS total_frete,
      COALESCE(SUM(c.valor_comissao_motorista), 0.0) AS total_comissao,
      COALESCE(SUM(CASE WHEN c.interestadual = 1 OR c.uf_destino != 'AL' THEN 1 ELSE 0 END), 0) AS viagens_fora_al
    FROM motoristas m
    LEFT JOIN conhecimentos_cte c ON c.motorista_id = m.id
    LEFT JOIN manifestos_mdfe mdf ON mdf.motorista_id = m.id
    GROUP BY m.id
    ORDER BY m.nome ASC
  `;
  return queryAll(sql);
}

/**
 * Get single driver by ID
 */
function getDriverById(id) {
  return queryOne('SELECT * FROM motoristas WHERE id = ?', [id]);
}

/**
 * Create a new driver with memory persistence
 */
function createDriver(data) {
  const {
    nome,
    cpf,
    cnh = '',
    percentual_comissao = 75.0,
    placa_cavalo = '',
    placa_carreta = '',
    tipo_vinculo = 'frota_propria',
    telefone = '',
    chave_pix = '',
    ativo = 1
  } = data;

  if (!nome || !cpf) {
    throw new Error('Nome e CPF são obrigatórios para o cadastro do motorista.');
  }

  const formattedCpf = formatCPF(cpf);

  // Check if CPF already exists
  const existing = queryOne('SELECT id FROM motoristas WHERE cpf = ?', [formattedCpf]);
  if (existing) {
    throw new Error(`Motorista com CPF ${formattedCpf} já está cadastrado.`);
  }

  const id = uuidv4();
  const comissao = parseFloat(percentual_comissao) || 75.0;
  const safeVinculo = ['frota_propria', 'agregado', 'terceirizado'].includes(tipo_vinculo) 
    ? tipo_vinculo 
    : 'frota_propria';

  execute(`
    INSERT INTO motoristas (
      id, nome, cpf, cnh, percentual_comissao, placa_cavalo, placa_carreta, tipo_vinculo, telefone, chave_pix, ativo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, 
    nome.trim().toUpperCase(), 
    formattedCpf, 
    cnh.trim(), 
    comissao,
    placa_cavalo.trim().toUpperCase(),
    placa_carreta.trim().toUpperCase(),
    safeVinculo,
    telefone.trim(), 
    chave_pix.trim(), 
    ativo ? 1 : 0
  ]);

  return getDriverById(id);
}

/**
 * Update driver details and recalculate related commissions if requested
 */
function updateDriver(id, data) {
  const driver = getDriverById(id);
  if (!driver) {
    throw new Error('Motorista não encontrado.');
  }

  const nome = data.nome ? data.nome.trim().toUpperCase() : driver.nome;
  const formattedCpf = data.cpf ? formatCPF(data.cpf) : driver.cpf;
  const cnh = data.cnh !== undefined ? data.cnh.trim() : (driver.cnh || '');
  const percentual = data.percentual_comissao !== undefined 
    ? (parseFloat(data.percentual_comissao) || 75.0) 
    : (driver.percentual_comissao || 75.0);
  const placa_cavalo = data.placa_cavalo !== undefined ? data.placa_cavalo.trim().toUpperCase() : (driver.placa_cavalo || '');
  const placa_carreta = data.placa_carreta !== undefined ? data.placa_carreta.trim().toUpperCase() : (driver.placa_carreta || '');
  const tipo_vinculo = data.tipo_vinculo !== undefined && ['frota_propria', 'agregado', 'terceirizado'].includes(data.tipo_vinculo)
    ? data.tipo_vinculo
    : (driver.tipo_vinculo || 'frota_propria');
  const telefone = data.telefone !== undefined ? data.telefone.trim() : (driver.telefone || '');
  const chave_pix = data.chave_pix !== undefined ? data.chave_pix.trim() : (driver.chave_pix || '');
  const ativo = data.ativo !== undefined ? (data.ativo ? 1 : 0) : driver.ativo;

  // Check unique CPF if changed
  if (formattedCpf !== driver.cpf) {
    const existing = queryOne('SELECT id FROM motoristas WHERE cpf = ? AND id != ?', [formattedCpf, id]);
    if (existing) {
      throw new Error(`Já existe outro motorista com o CPF ${formattedCpf}.`);
    }
  }

  execute(`
    UPDATE motoristas SET
      nome = ?,
      cpf = ?,
      cnh = ?,
      percentual_comissao = ?,
      placa_cavalo = ?,
      placa_carreta = ?,
      tipo_vinculo = ?,
      telefone = ?,
      chave_pix = ?,
      ativo = ?
    WHERE id = ?
  `, [nome, formattedCpf, cnh, percentual, placa_cavalo, placa_carreta, tipo_vinculo, telefone, chave_pix, ativo, id]);

  // Recalculate CT-e commissions for this driver
  execute(`
    UPDATE conhecimentos_cte 
    SET valor_comissao_motorista = ROUND(valor_frete * (? / 100.0), 2)
    WHERE motorista_id = ?
  `, [percentual, id]);

  return getDriverById(id);
}

/**
 * Delete or deactivate driver
 */
function deleteDriver(id) {
  const driver = getDriverById(id);
  if (!driver) {
    throw new Error('Motorista não encontrado.');
  }

  // Check if driver has linked CT-e or MDF-e
  const cteCount = queryOne('SELECT COUNT(*) AS total FROM conhecimentos_cte WHERE motorista_id = ?', [id])?.total || 0;
  const mdfeCount = queryOne('SELECT COUNT(*) AS total FROM manifestos_mdfe WHERE motorista_id = ?', [id])?.total || 0;

  if (cteCount > 0 || mdfeCount > 0) {
    // Cannot hard-delete due to foreign key integrity; soft-delete (deactivate)
    execute('UPDATE motoristas SET ativo = 0 WHERE id = ?', [id]);
    return {
      success: true,
      softDeleted: true,
      message: `Motorista desativado com sucesso (possui ${cteCount} CT-es e ${mdfeCount} MDF-es vinculados).`
    };
  }

  execute('DELETE FROM motoristas WHERE id = ?', [id]);
  return {
    success: true,
    softDeleted: false,
    message: 'Motorista excluído com sucesso.'
  };
}

/**
 * Batch delete drivers
 * @param {string[]} ids - Array of driver IDs to delete or deactivate
 */
function batchDeleteDrivers(ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('Nenhum motorista foi selecionado para exclusão.');
  }

  let hardDeleted = 0;
  let softDeleted = 0;

  for (const id of ids) {
    const driver = getDriverById(id);
    if (!driver) continue;

    const cteCount = queryOne('SELECT COUNT(*) AS total FROM conhecimentos_cte WHERE motorista_id = ?', [id])?.total || 0;
    const mdfeCount = queryOne('SELECT COUNT(*) AS total FROM manifestos_mdfe WHERE motorista_id = ?', [id])?.total || 0;

    if (cteCount > 0 || mdfeCount > 0) {
      execute('UPDATE motoristas SET ativo = 0 WHERE id = ?', [id]);
      softDeleted++;
    } else {
      execute('DELETE FROM motoristas WHERE id = ?', [id]);
      hardDeleted++;
    }
  }

  return {
    success: true,
    totalRequested: ids.length,
    hardDeleted,
    softDeleted,
    message: `${hardDeleted + softDeleted} motorista(s) processado(s): ${hardDeleted} excluído(s) em definitivo e ${softDeleted} desativado(s) por possuir viagens vinculadas.`
  };
}

/**
 * Analytics and performance report for drivers
 */
function getDriversAnalytics() {
  const drivers = getAllDriversWithBalance();

  let totalFaturamentoGeral = 0;
  let totalComissoes75 = 0;
  let totalViagens = 0;

  const byCategory = {
    frota_propria: { label: 'Frota Própria', count: 0, frete: 0, comissao: 0, viagens: 0 },
    agregado: { label: 'Agregados', count: 0, frete: 0, comissao: 0, viagens: 0 },
    terceirizado: { label: 'Terceirizados', count: 0, frete: 0, comissao: 0, viagens: 0 }
  };

  const ranking = drivers.map(d => {
    const frete = parseFloat(d.total_frete || 0);
    const comissao = parseFloat(d.total_comissao || 0);
    const ctes = parseInt(d.total_ctes || 0, 10);
    const mdfes = parseInt(d.total_mdfes || 0, 10);
    const viagens = ctes + mdfes;
    const ticketMedio = ctes > 0 ? (frete / ctes) : 0;
    const vinculo = d.tipo_vinculo || 'frota_propria';

    totalFaturamentoGeral += frete;
    totalComissoes75 += comissao;
    totalViagens += viagens;

    if (byCategory[vinculo]) {
      byCategory[vinculo].count++;
      byCategory[vinculo].frete += frete;
      byCategory[vinculo].comissao += comissao;
      byCategory[vinculo].viagens += viagens;
    }

    return {
      id: d.id,
      nome: d.nome,
      cpf: d.cpf,
      cnh: d.cnh,
      placa_cavalo: d.placa_cavalo || '',
      placa_carreta: d.placa_carreta || '',
      tipo_vinculo: vinculo,
      percentual_comissao: d.percentual_comissao || 75.0,
      total_ctes: ctes,
      total_mdfes: mdfes,
      total_viagens: viagens,
      total_frete: frete,
      total_comissao: comissao,
      ticket_medio: ticketMedio,
      ativo: d.ativo
    };
  });

  // Sort by revenue descending
  ranking.sort((a, b) => b.total_frete - a.total_frete);

  const topByRevenue = [...ranking].slice(0, 10);
  const topByTrips = [...ranking].sort((a, b) => b.total_viagens - a.total_viagens).slice(0, 10);

  return {
    summary: {
      total_drivers: drivers.length,
      totalMotoristas: drivers.length,
      total_frete: totalFaturamentoGeral,
      totalFaturamentoGeral,
      total_comissao: totalComissoes75,
      totalComissoes75,
      total_trips: totalViagens,
      totalViagens,
      topDriverRevenue: topByRevenue[0] || null,
      topDriverTrips: topByTrips[0] || null
    },
    byCategory,
    categoryStats: byCategory,
    topByRevenue,
    topRevenue: topByRevenue,
    topByTrips,
    topTrips: topByTrips,
    ranking,
    drivers: ranking
  };
}

module.exports = {
  formatCPF,
  getAllDriversWithBalance,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver,
  batchDeleteDrivers,
  getDriversAnalytics
};
