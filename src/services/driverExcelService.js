const ExcelJS = require('exceljs');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database/db');
const driverService = require('./driverService');

/**
 * Format CPF to 000.000.000-00
 */
function formatCPF(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '').padStart(11, '0').slice(-11);
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Extract clean string from cell value (handles ExcelJS rich text, formula, objects)
 */
function getCellString(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if (val.text) return String(val.text).trim();
    if (val.result !== undefined) return String(val.result).trim();
    if (Array.isArray(val.richText)) {
      return val.richText.map(r => r.text || '').join('').trim();
    }
  }
  return String(val).trim();
}

/**
 * Normalize fleet link type
 */
function normalizeVinculo(str) {
  if (!str) return 'frota_propria';
  const s = String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (s.includes('agregad')) return 'agregado';
  if (s.includes('terceir')) return 'terceirizado';
  if (s.includes('propria') || s.includes('proprio') || s.includes('frota')) return 'frota_propria';
  return 'frota_propria';
}

/**
 * Scan and parse Excel buffer for Drivers & Fleets
 * @param {Buffer} buffer - Excel file buffer (.xlsx or .csv)
 * @returns {Promise<Object>} Scan result with statistics, headers, and rows
 */
async function scanDriversExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  
  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    // Fallback: try CSV parse
    try {
      const csvStr = buffer.toString('utf-8');
      const lines = csvStr.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length > 0) {
        const sheet = workbook.addWorksheet('CSV');
        lines.forEach(line => {
          const cols = line.split(/[;,]/).map(c => c.replace(/^["']|["']$/g, '').trim());
          sheet.addRow(cols);
        });
      }
    } catch (csvErr) {
      throw new Error(`Falha ao ler arquivo Excel: ${err.message}`);
    }
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('A planilha enviada não contém abas ou dados legíveis.');
  }

  // 1. Locate Header Row
  let headerRowIndex = -1;
  let colMap = {};

  const ALIASES = {
    nome: ['nome', 'motorista', 'condutor', 'nome motorista', 'nome condutor', 'nome_motorista', 'nome completo', 'nome_completo'],
    cpf: ['cpf', 'documento', 'cpf_motorista', 'cpf_condutor', 'doc', 'cpf/cnpj'],
    cnh: ['cnh', 'registro_cnh', 'num_cnh', 'carteira', 'numero cnh'],
    tipo_vinculo: ['tipo_vinculo', 'vinculo', 'tipo vinculo', 'categoria', 'tipo', 'pertencimento', 'frota', 'tipo de vinculo', 'tipo de frota'],
    placa_cavalo: ['placa_cavalo', 'placa cavalo', 'placa_tracao', 'placa tracao', 'cavalo', 'tracao', 'placa 1', 'placa tracao / cavalo', 'placa'],
    placa_carreta: ['placa_carreta', 'placa carreta', 'placa_reboque', 'placa reboque', 'carreta', 'reboque', 'placa 2', 'semi reboque'],
    percentual_comissao: ['percentual_comissao', 'comissao', 'percentual', '% comissao', 'comissao (%)', '%', 'taxa', 'comissao motorista'],
    telefone: ['telefone', 'fone', 'contato', 'whatsapp', 'celular', 'tel'],
    chave_pix: ['chave_pix', 'pix', 'chave pix', 'pix_chave', 'dados_bancarios', 'chave'],
    ativo: ['ativo', 'status', 'situacao', 'ativo (sim/nao)']
  };

  worksheet.eachRow((row, rowNumber) => {
    if (headerRowIndex !== -1) return; // already found
    const rowValues = [];
    row.eachCell((cell, colNumber) => {
      rowValues.push({ colNumber, text: getCellString(cell.value).toLowerCase() });
    });

    const detected = {};
    for (const item of rowValues) {
      const clean = item.text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      for (const [canonical, aliases] of Object.entries(ALIASES)) {
        if (!detected[canonical] && aliases.some(al => clean === al || clean.includes(al))) {
          detected[canonical] = item.colNumber;
        }
      }
    }

    // Require at least 'nome' and 'cpf' or 'placa_cavalo' to consider this the header
    if (detected.nome && (detected.cpf || detected.placa_cavalo)) {
      headerRowIndex = rowNumber;
      colMap = detected;
    }
  });

  // If no header found by aliases, use default column order from row 1
  if (headerRowIndex === -1) {
    headerRowIndex = 1;
    colMap = {
      nome: 1,
      cpf: 2,
      cnh: 3,
      tipo_vinculo: 4,
      placa_cavalo: 5,
      placa_carreta: 6,
      percentual_comissao: 7,
      telefone: 8,
      chave_pix: 9,
      ativo: 10
    };
  }

  // Pre-load all registered drivers from DB to verify duplicates
  const existingDrivers = queryAll('SELECT id, nome, cpf, tipo_vinculo, placa_cavalo, placa_carreta FROM motoristas');
  const existingCpfMap = new Map();
  for (const d of existingDrivers) {
    existingCpfMap.set(d.cpf, d);
  }

  const scannedRows = [];
  const sheetSeenCpfs = new Set();
  let rowIdCounter = 1;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowIndex) return; // skip header and preamble

    const getVal = (field) => {
      const colIdx = colMap[field];
      if (!colIdx) return '';
      return getCellString(row.getCell(colIdx).value);
    };

    const rawNome = getVal('nome');
    const rawCpf = getVal('cpf');
    const rawCnh = getVal('cnh');
    const rawVinculo = getVal('tipo_vinculo');
    const rawCavalo = getVal('placa_cavalo');
    const rawCarreta = getVal('placa_carreta');
    const rawComissao = getVal('percentual_comissao');
    const rawTelefone = getVal('telefone');
    const rawPix = getVal('chave_pix');
    const rawAtivo = getVal('ativo');

    // Skip empty lines or instructional footers
    if (!rawNome && !rawCpf && !rawCavalo) return;
    const cleanDigitsCpf = String(rawCpf).replace(/\D/g, '');
    const cleanCavalo = rawCavalo.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const cleanCarreta = rawCarreta.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    // If text looks like a title or instruction (e.g. starts with "1.", "2.", "💡" or longer than 45 chars without full 11 digits CPF)
    const lowerNome = rawNome.toLowerCase().trim();
    if (lowerNome.includes('instruç') || lowerNome.includes('instruc') || lowerNome.includes('observa') || lowerNome.includes('atenç') || lowerNome.includes('atenc') || lowerNome.includes('regras') || /^\d+[\.\)]\s*/.test(lowerNome)) return;
    if (rawNome.length > 45 && cleanDigitsCpf.length !== 11) return;
    if (cleanDigitsCpf.length < 11 && !cleanCavalo && !cleanCarreta) return;

    const nome = rawNome.toUpperCase();
    const formattedCpf = cleanDigitsCpf.length > 0 ? formatCPF(cleanDigitsCpf) : '';

    // Commission parse (handles 75, 75%, 0.75, etc.)
    let comissao = 75.0;
    if (rawComissao) {
      const cleanNum = parseFloat(String(rawComissao).replace(',', '.').replace('%', '').trim());
      if (!isNaN(cleanNum)) {
        if (cleanNum > 0 && cleanNum <= 1) comissao = cleanNum * 100;
        else if (cleanNum > 0) comissao = cleanNum;
      }
    }

    const vinculo = normalizeVinculo(rawVinculo);
    const placaCavalo = cleanCavalo;
    const placaCarreta = cleanCarreta;

    let ativo = 1;
    if (rawAtivo) {
      const s = rawAtivo.toLowerCase().trim();
      if (['nao', 'não', '0', 'inativo', 'false', 'desativado'].includes(s)) {
        ativo = 0;
      }
    }

    const warnings = [];
    let isValid = true;

    if (!nome || nome.length < 3) {
      warnings.push('Nome incompleto ou ausente');
      isValid = false;
    }

    if (!cleanDigitsCpf || cleanDigitsCpf.length !== 11) {
      warnings.push('CPF com quantidade de dígitos inválida (deve ter 11 números)');
      isValid = false;
    }

    // Check duplicate inside sheet
    if (formattedCpf && sheetSeenCpfs.has(formattedCpf)) {
      warnings.push('CPF repetido em mais de uma linha desta planilha');
    } else if (formattedCpf) {
      sheetSeenCpfs.add(formattedCpf);
    }

    // Check duplicate in database
    let existsInDb = false;
    let existingDriverData = null;
    if (formattedCpf && existingCpfMap.has(formattedCpf)) {
      existsInDb = true;
      existingDriverData = existingCpfMap.get(formattedCpf);
      warnings.push(`Já cadastrado no banco: "${existingDriverData.nome}" (Será atualizado)`);
    }

    scannedRows.push({
      tempId: `scanned-${rowIdCounter++}`,
      rowNumber,
      nome,
      cpf: formattedCpf,
      cnh: rawCnh.trim(),
      tipo_vinculo: vinculo,
      placa_cavalo: placaCavalo,
      placa_carreta: placaCarreta,
      percentual_comissao: comissao,
      telefone: rawTelefone.trim(),
      chave_pix: rawPix.trim(),
      ativo,
      isValid,
      warnings,
      existsInDb,
      existingId: existingDriverData ? existingDriverData.id : null
    });
  });

  const validRows = scannedRows.filter(r => r.isValid && !r.warnings.some(w => w.includes('inválida') || w.includes('incompleto')));
  const warningRows = scannedRows.filter(r => r.warnings.length > 0);
  const newRegistrations = scannedRows.filter(r => !r.existsInDb && r.isValid);
  const existingRegistrations = scannedRows.filter(r => r.existsInDb);

  return {
    success: true,
    totalRows: scannedRows.length,
    validCount: validRows.length,
    warningCount: warningRows.length,
    newCount: newRegistrations.length,
    updateCount: existingRegistrations.length,
    detectedHeaders: colMap,
    headerRowNumber: headerRowIndex,
    rows: scannedRows
  };
}

/**
 * Commit and import scanned & edited rows to the database
 * @param {Array} rows - Rows reviewed and validated by the user
 * @returns {Object} Import summary
 */
function importScannedDrivers(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Nenhum registro selecionado para importação.');
  }

  let createdCount = 0;
  let updatedCount = 0;
  const errors = [];

  for (const item of rows) {
    try {
      const nome = (item.nome || '').trim().toUpperCase();
      const cpf = formatCPF(item.cpf);
      if (!nome || !cpf) {
        errors.push(`Linha ignorada: Nome ou CPF ausente.`);
        continue;
      }

      const payload = {
        nome,
        cpf,
        cnh: (item.cnh || '').trim(),
        percentual_comissao: parseFloat(item.percentual_comissao) || 75.0,
        placa_cavalo: (item.placa_cavalo || '').trim().toUpperCase(),
        placa_carreta: (item.placa_carreta || '').trim().toUpperCase(),
        tipo_vinculo: item.tipo_vinculo || 'frota_propria',
        telefone: (item.telefone || '').trim(),
        chave_pix: (item.chave_pix || '').trim(),
        ativo: item.ativo !== undefined ? (item.ativo ? 1 : 0) : 1
      };

      // Check if driver exists
      const existing = queryOne('SELECT id FROM motoristas WHERE cpf = ?', [cpf]);
      if (existing) {
        driverService.updateDriver(existing.id, payload);
        updatedCount++;
      } else {
        driverService.createDriver(payload);
        createdCount++;
      }
    } catch (err) {
      errors.push(`Erro ao processar "${item.nome || item.cpf}": ${err.message}`);
    }
  }

  return {
    success: true,
    totalProcessed: rows.length,
    createdCount,
    updatedCount,
    errorCount: errors.length,
    errors,
    message: `${createdCount} novo(s) motorista(s) cadastrado(s) e ${updatedCount} atualizado(s) com sucesso!`
  };
}

/**
 * Generate standard Excel template (.xlsx) for user to download and fill
 */
async function generateDriverTemplateExcel() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CARGA BALANCE - Auditoria de frete';
  workbook.lastModifiedBy = 'CARGA BALANCE';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Cadastro Motoristas e Frotas', {
    views: [{ state: 'frozen', ySplit: 4 }]
  });

  // 1. Header Banner
  sheet.mergeCells('A1:J1');
  const banner = sheet.getCell('A1');
  banner.value = 'CARGA BALANCE • MODELO OFICIAL PARA CADASTRO DE CONDUTORES E FROTAS';
  banner.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  banner.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 32;

  // 2. Subtitle Instructions
  sheet.mergeCells('A2:J2');
  const subtitle = sheet.getCell('A2');
  subtitle.value = 'Preencha os dados dos condutores e veículos abaixo. Colunas com (*) são de preenchimento obrigatório para auditoria fiscal e comissão (75%).';
  subtitle.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF475569' } };
  subtitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  subtitle.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(2).height = 20;

  // Blank row
  sheet.getRow(3).height = 6;

  // 3. Columns Definition
  const columns = [
    { key: 'nome', header: 'Nome Completo Condutor *', width: 32 },
    { key: 'cpf', header: 'CPF (000.000.000-00) *', width: 22 },
    { key: 'cnh', header: 'Registro CNH', width: 18 },
    { key: 'tipo_vinculo', header: 'Tipo Vínculo (Frota / Agregado / Terceiro)', width: 28 },
    { key: 'placa_cavalo', header: 'Placa Cavalo (Tração)', width: 18 },
    { key: 'placa_carreta', header: 'Placa Carreta (Reboque)', width: 18 },
    { key: 'percentual_comissao', header: '% Comissão (Padrão: 75)', width: 22 },
    { key: 'telefone', header: 'Telefone / WhatsApp', width: 20 },
    { key: 'chave_pix', header: 'Chave PIX (Para Pagamentos)', width: 26 },
    { key: 'ativo', header: 'Status (Ativo / Inativo)', width: 18 }
  ];

  sheet.columns = columns;

  // Style Header Row (Row 4)
  const headerRow = sheet.getRow(4);
  headerRow.height = 28;
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF334155' } },
      bottom: { style: 'medium', color: { argb: 'FF2563EB' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } }
    };
  });

  // 4. Sample Rows (Row 5, 6, 7)
  const sampleData = [
    {
      nome: 'MARCOS VINICIUS DOS SANTOS',
      cpf: '012.345.678-90',
      cnh: '05987654321',
      tipo_vinculo: 'Frota Própria',
      placa_cavalo: 'LQW0A19',
      placa_carreta: 'MUV0J59',
      percentual_comissao: 75.0,
      telefone: '(82) 99876-5432',
      chave_pix: '01234567890',
      ativo: 'Ativo'
    },
    {
      nome: 'CARLOS EDUARDO SILVEIRA',
      cpf: '123.456.789-01',
      cnh: '04123456789',
      tipo_vinculo: 'Agregado',
      placa_cavalo: 'BRA2E19',
      placa_carreta: 'RIO1K88',
      percentual_comissao: 75.0,
      telefone: '(82) 98765-4321',
      chave_pix: 'carlos.silveira@pix.com',
      ativo: 'Ativo'
    },
    {
      nome: 'ANTONIO PEREIRA LIMA',
      cpf: '234.567.890-12',
      cnh: '03987654321',
      tipo_vinculo: 'Terceirizado',
      placa_cavalo: 'KZZ9J40',
      placa_carreta: 'OXE4A50',
      percentual_comissao: 75.0,
      telefone: '(82) 97654-3210',
      chave_pix: '(82) 97654-3210',
      ativo: 'Ativo'
    }
  ];

  sampleData.forEach((item, rIdx) => {
    const row = sheet.getRow(5 + rIdx);
    row.height = 22;
    row.values = [
      item.nome,
      item.cpf,
      item.cnh,
      item.tipo_vinculo,
      item.placa_cavalo,
      item.placa_carreta,
      item.percentual_comissao,
      item.telefone,
      item.chave_pix,
      item.ativo
    ];

    row.eachCell((cell, colNum) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
      if (colNum === 1) cell.alignment = { vertical: 'middle', horizontal: 'left' };
      else if ([2, 3, 5, 6, 7, 8, 10].includes(colNum)) cell.alignment = { vertical: 'middle', horizontal: 'center' };
      else cell.alignment = { vertical: 'middle', horizontal: 'left' };

      if (rIdx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });
  });

  // 5. Separate Instructions Worksheet
  const sheetInstrucoes = workbook.addWorksheet('Instruções de Importação');
  sheetInstrucoes.columns = [{ width: 85 }];
  
  const addInfoRow = (text, isHeader = false) => {
    const row = sheetInstrucoes.addRow([text]);
    if (isHeader) {
      row.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF1E3A8A' } };
      row.height = 24;
    } else {
      row.font = { name: 'Calibri', size: 10, color: { argb: 'FF334155' } };
      row.height = 18;
    }
  };

  addInfoRow('CARGA BALANCE • GUIA DE IMPORTAÇÃO DE MOTORISTAS & FROTAS', true);
  addInfoRow('');
  addInfoRow('1. Preenchimento de Nome e CPF:');
  addInfoRow('   - O nome e o CPF são obrigatórios para validação fiscal e emissão de CT-e / MDF-e.');
  addInfoRow('   - O CPF pode ser digitado com ou sem pontuação (ex: 12345678900 ou 123.456.789-00).');
  addInfoRow('');
  addInfoRow('2. Categorias e Vínculos de Frota:');
  addInfoRow('   - Frota Própria: Veículos próprios da transportadora.');
  addInfoRow('   - Agregado: Veículos parceiros fixos que prestam serviços recorrentes.');
  addInfoRow('   - Terceirizado: Motoristas terceiros avulsos para complementar rotas.');
  addInfoRow('');
  addInfoRow('3. Placas e Comissões:');
  addInfoRow('   - Placa Cavalo (Tração) e Placa Carreta (Reboque) no padrão Mercosul ou tradicional.');
  addInfoRow('   - O percentual padrão da CARGA BALANCE é de 75,0% do valor do frete contratado.');
  addInfoRow('');
  addInfoRow('4. Dados Bancários / PIX:');
  addInfoRow('   - A chave PIX informada será utilizada automaticamente nos relatórios de prestação de contas.');

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  scanDriversExcel,
  importScannedDrivers,
  generateDriverTemplateExcel
};
