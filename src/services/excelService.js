/**
 * Excel Export Service for CT-e / MDF-e Audit & Driver Balance Platform
 * Built using ExcelJS with formatting, formulas, and driver summaries.
 */

const ExcelJS = require('exceljs');
const { compareDocumentsDesc } = require('./documentService');

/**
 * Formats date string into Brazilian format DD/MM/YYYY HH:mm
 */
function formatDateTime(dtStr) {
  if (!dtStr) return '-';
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return dtStr;
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch (e) {
    return dtStr;
  }
}

/**
 * Builds the complete Excel workbook matching active filters.
 */
async function generateAuditExcel(documents, kpis, filterInfo = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistema de Auditoria CT-e/MDF-e';
  workbook.lastModifiedBy = 'Logística Antigravity';
  workbook.created = new Date();

  // -------------------------------------------------------------
  // WORKSHEET 1: Extrato de Documentos (CT-e & MDF-e)
  // -------------------------------------------------------------
  const sheet = workbook.addWorksheet('Auditoria de Documentos', {
    views: [{ state: 'frozen', ySplit: 7 }]
  });

  // Title Banner
  sheet.mergeCells('A1:J1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'RELATÓRIO DE AUDITORIA FISCAL & ACERTO DE FRETES (CT-e / MDF-e)';
  titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 36;

  // Metadata Subtitle
  sheet.mergeCells('A2:J2');
  const metaCell = sheet.getCell('A2');
  const periodText = filterInfo.startDate || filterInfo.endDate
    ? `Período: ${filterInfo.startDate || 'Início'} até ${filterInfo.endDate || 'Hoje'}`
    : 'Período: Histórico Completo';
  const driverText = filterInfo.driverName ? ` | Motorista: ${filterInfo.driverName}` : ' | Todos os Motoristas';
  const typeText = filterInfo.docType && filterInfo.docType !== 'ALL' ? ` | Filtro: Apenas ${filterInfo.docType}` : ' | Tipo: CT-e e MDF-e';
  const dateGenerated = ` | Emitido em: ${formatDateTime(new Date().toISOString())}`;
  metaCell.value = `${periodText}${driverText}${typeText}${dateGenerated}`;
  metaCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FFCBD5E1' } };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(2).height = 22;

  // KPI Summary Bar inside Excel
  sheet.mergeCells('A4:C4');
  sheet.getCell('A4').value = `Total Geral: R$ ${(kpis.totalValor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  sheet.getCell('A4').font = { bold: true, color: { argb: 'FF0F766E' } };
  sheet.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFBF1' } };
  sheet.getCell('A4').alignment = { vertical: 'middle', horizontal: 'center' };

  sheet.mergeCells('D4:F4');
  sheet.getCell('D4').value = `Documentos: ${kpis.totalCount || 0} (${kpis.cteCount || 0} CT-e / ${kpis.mdfeCount || 0} MDF-e)`;
  sheet.getCell('D4').font = { bold: true, color: { argb: 'FF1D4ED8' } };
  sheet.getCell('D4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
  sheet.getCell('D4').alignment = { vertical: 'middle', horizontal: 'center' };

  sheet.mergeCells('G4:J4');
  sheet.getCell('G4').value = `Ticket Médio: R$ ${(kpis.ticketMedio || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  sheet.getCell('G4').font = { bold: true, color: { argb: 'FF854D0E' } };
  sheet.getCell('G4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  sheet.getCell('G4').alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(4).height = 24;

  // Table Column Headers
  const headers = [
    { header: 'Tipo', key: 'tipo', width: 10 },
    { header: 'Número', key: 'numero', width: 12 },
    { header: 'Série', key: 'serie', width: 8 },
    { header: 'Data Emissão', key: 'data_emissao', width: 18 },
    { header: 'Motorista', key: 'motorista_nome', width: 28 },
    { header: 'CPF Motorista', key: 'motorista_cpf', width: 18 },
    { header: 'Origem', key: 'origem', width: 18 },
    { header: 'Destino', key: 'destino', width: 22 },
    { header: 'Valor Bruto (R$)', key: 'valor', width: 18 },
    { header: 'Repasse Motorista 75% (R$)', key: 'comissao_75', width: 25 },
    { header: 'Chave de Acesso (44 dígitos)', key: 'chave_acesso', width: 48 }
  ];

  sheet.getRow(6).values = headers.map(h => h.header);
  sheet.getRow(6).height = 26;

  sheet.getRow(6).eachCell((cell, colNumber) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colNumber === 10 ? 'FFB45309' : 'FF334155' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } }
    };
  });

  // Populate Data Rows (Descending by most recent movement/timestamp)
  const sortedDocs = [...(documents || [])].sort(compareDocumentsDesc);
  let currentRow = 7;
  for (const doc of sortedDocs) {
    const row = sheet.getRow(currentRow);
    const origem = doc.cidade_origem ? `${doc.cidade_origem}/${doc.uf_origem}` : doc.uf_origem;
    const destino = doc.cidade_destino ? `${doc.cidade_destino}/${doc.uf_destino}` : doc.uf_destino;
    const valorNum = Number(doc.valor) || 0.0;
    const isCte = doc.tipo === 'CTE';
    const repasse75 = isCte ? Number((valorNum * 0.75).toFixed(2)) : 0.0;

    row.values = [
      doc.tipo,
      Number(doc.numero),
      Number(doc.serie),
      formatDateTime(doc.data_emissao),
      doc.motorista_nome,
      doc.motorista_cpf,
      origem,
      destino,
      valorNum,
      repasse75,
      doc.chave_acesso
    ];

    // Styling per row
    row.height = 20;
    const isEven = currentRow % 2 === 0;
    const bg = isEven ? 'FFF8FAFC' : 'FFFFFFFF';

    row.eachCell((cell, colNumber) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colNumber === 10 ? 'FFFFFBEB' : bg } };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if (colNumber === 1) { // Tipo
        cell.alignment = { horizontal: 'center' };
        cell.font = { bold: true, color: { argb: doc.tipo === 'CTE' ? 'FF047857' : 'FF1D4ED8' } };
      } else if (colNumber === 2 || colNumber === 3) { // Número, Série
        cell.alignment = { horizontal: 'center' };
      } else if (colNumber === 4) { // Data
        cell.alignment = { horizontal: 'center' };
      } else if (colNumber === 6) { // CPF
        cell.alignment = { horizontal: 'center' };
      } else if (colNumber === 9) { // Valor Bruto
        cell.numFmt = '"R$ "#,##0.00;[Red]-"R$ "#,##0.00';
        cell.alignment = { horizontal: 'right' };
        cell.font = { bold: true };
      } else if (colNumber === 10) { // Repasse Motorista 75%
        cell.numFmt = '"R$ "#,##0.00;[Red]-"R$ "#,##0.00';
        cell.alignment = { horizontal: 'right' };
        cell.font = { bold: true, color: { argb: 'FFB45309' } };
      } else if (colNumber === 11) { // Chave de acesso
        cell.font = { name: 'Consolas', size: 9 };
        cell.alignment = { horizontal: 'center' };
      }
    });

    currentRow++;
  }

  // Summary Row with automated Excel formulas
  const totalRow = sheet.getRow(currentRow);
  totalRow.height = 28;
  const startRow = 7;
  const endRow = currentRow - 1;

  if (documents.length > 0) {
    totalRow.getCell(1).value = 'TOTAL GERAL';
    totalRow.getCell(2).value = { formula: `COUNTA(B${startRow}:B${endRow})` };
    totalRow.getCell(9).value = { formula: `SUM(I${startRow}:I${endRow})` };
    totalRow.getCell(9).numFmt = '"R$ "#,##0.00;[Red]-"R$ "#,##0.00';
    totalRow.getCell(10).value = { formula: `SUM(J${startRow}:J${endRow})` };
    totalRow.getCell(10).numFmt = '"R$ "#,##0.00;[Red]-"R$ "#,##0.00';
  } else {
    totalRow.getCell(1).value = 'Nenhum documento encontrado com os filtros aplicados.';
  }

  totalRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colNumber === 10 ? 'FFB45309' : 'FF0F172A' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } }
    };
    if (colNumber === 9 || colNumber === 10) {
      cell.alignment = { horizontal: 'right' };
    } else {
      cell.alignment = { horizontal: 'center' };
    }
  });

  // Apply column widths
  headers.forEach((h, i) => {
    sheet.getColumn(i + 1).width = h.width;
  });

  // -------------------------------------------------------------
  // WORKSHEET 2: Resumo por Motorista (Driver Balance Sheet)
  // -------------------------------------------------------------
  const driverSheet = workbook.addWorksheet('Resumo por Motorista');
  driverSheet.mergeCells('A1:I1');
  const dTitle = driverSheet.getCell('A1');
  dTitle.value = 'BALANÇO CONSOLIDADO POR MOTORISTA & REPASSE DE COMISSÃO (75%)';
  dTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  dTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  dTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  driverSheet.getRow(1).height = 32;

  const dHeaders = ['Motorista', 'CPF', 'Qtd CT-e', 'Qtd MDF-e', 'Total Frete (R$)', 'Repasse Motorista 75% (R$)', 'Margem Emp. 25% (R$)', 'Total Carga (R$)', 'Total Geral (R$)'];
  driverSheet.getRow(3).values = dHeaders;
  driverSheet.getRow(3).height = 24;
  driverSheet.getRow(3).eachCell((cell, colIdx) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colIdx === 6 ? 'FFB45309' : 'FF334155' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Aggregate by driver
  const driverMap = new Map();
  for (const doc of documents) {
    const key = doc.motorista_cpf || 'SEM_CPF';
    if (!driverMap.has(key)) {
      driverMap.set(key, {
        nome: doc.motorista_nome,
        cpf: doc.motorista_cpf,
        cteCount: 0,
        mdfeCount: 0,
        totalFrete: 0,
        totalCarga: 0
      });
    }
    const item = driverMap.get(key);
    const val = Number(doc.valor) || 0;
    if (doc.tipo === 'CTE') {
      item.cteCount++;
      item.totalFrete += val;
    } else {
      item.mdfeCount++;
      item.totalCarga += val;
    }
  }

  let dRowIdx = 4;
  for (const item of driverMap.values()) {
    const r = driverSheet.getRow(dRowIdx);
    const repasse75 = Number((item.totalFrete * 0.75).toFixed(2));
    const margem25 = Number((item.totalFrete * 0.25).toFixed(2));
    const totalGeral = item.totalFrete + item.totalCarga;

    r.values = [
      item.nome,
      item.cpf,
      item.cteCount,
      item.mdfeCount,
      item.totalFrete,
      repasse75,
      margem25,
      item.totalCarga,
      totalGeral
    ];

    r.eachCell((cell, colIdx) => {
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
      if (colIdx >= 5) {
        cell.numFmt = '"R$ "#,##0.00;[Red]-"R$ "#,##0.00';
        cell.alignment = { horizontal: 'right' };
        if (colIdx === 6) {
          cell.font = { bold: true, color: { argb: 'FFB45309' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
        }
      } else if (colIdx >= 2 && colIdx <= 4) {
        cell.alignment = { horizontal: 'center' };
      }
    });

    dRowIdx++;
  }

  // Driver summary row
  if (driverMap.size > 0) {
    const sumRow = driverSheet.getRow(dRowIdx);
    sumRow.getCell(1).value = 'TOTAIS';
    sumRow.getCell(3).value = { formula: `SUM(C4:C${dRowIdx - 1})` };
    sumRow.getCell(4).value = { formula: `SUM(D4:D${dRowIdx - 1})` };
    sumRow.getCell(5).value = { formula: `SUM(E4:E${dRowIdx - 1})` };
    sumRow.getCell(6).value = { formula: `SUM(F4:F${dRowIdx - 1})` };
    sumRow.getCell(7).value = { formula: `SUM(G4:G${dRowIdx - 1})` };
    sumRow.getCell(8).value = { formula: `SUM(H4:H${dRowIdx - 1})` };
    sumRow.getCell(9).value = { formula: `SUM(I4:I${dRowIdx - 1})` };

    sumRow.eachCell((cell, colIdx) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colIdx === 6 ? 'FFB45309' : 'FFF1F5F9' } };
      if (colIdx === 6) {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      }
      if (colIdx >= 5) {
        cell.numFmt = '"R$ "#,##0.00;[Red]-"R$ "#,##0.00';
      }
    });
  }

  driverSheet.columns = [
    { width: 30 },
    { width: 18 },
    { width: 12 },
    { width: 12 },
    { width: 20 },
    { width: 24 },
    { width: 20 },
    { width: 20 },
    { width: 22 }
  ];

  return workbook;
}

module.exports = {
  generateAuditExcel,
  formatDateTime
};
