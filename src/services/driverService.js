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

  execute(`
    INSERT INTO motoristas (
      id, nome, cpf, cnh, percentual_comissao, telefone, chave_pix, ativo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, nome.trim().toUpperCase(), formattedCpf, cnh.trim(), comissao,
    telefone.trim(), chave_pix.trim(), ativo ? 1 : 0
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
  const cnh = data.cnh !== undefined ? data.cnh.trim() : driver.cnh;
  const percentual = data.percentual_comissao !== undefined 
    ? (parseFloat(data.percentual_comissao) || 75.0) 
    : (driver.percentual_comissao || 75.0);
  const telefone = data.telefone !== undefined ? data.telefone.trim() : driver.telefone;
  const chave_pix = data.chave_pix !== undefined ? data.chave_pix.trim() : driver.chave_pix;
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
      telefone = ?,
      chave_pix = ?,
      ativo = ?
    WHERE id = ?
  `, [nome, formattedCpf, cnh, percentual, telefone, chave_pix, ativo, id]);

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

module.exports = {
  formatCPF,
  getAllDriversWithBalance,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver
};
