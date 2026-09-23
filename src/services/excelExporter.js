const ExcelJS = require('exceljs');

/**
 * Generates an Excel workbook (.xlsx) from filtered documents including 75% commission
 */
async function generateExcelReport(documents, kpis, filterParams = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CargaBalance Audit Platform';
  workbook.lastModifiedBy = 'CargaBalance System';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('Auditoria e Saldo', {
    views: [{ showGridLines: true }]
  });

  // 1. Title Banner
  worksheet.mergeCells('A1:L1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'PLATAFORMA CARGABALANCE - AUDITORIA CT-e / MDF-e & SALDO DE MOTORISTAS (75% COMISSÃO)';
  titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' } // Slate 800
  };
  worksheet.getRow(1).height = 32;

  // 2. Metadata / Filter Summary
  const periodText = `Período: ${filterParams.startDate || 'Início'} até ${filterParams.endDate || 'Fim'} | Tipo: ${filterParams.docType ? filterParams.docType.toUpperCase() : 'TODOS'} | Data Emissão: ${new Date().toLocaleString('pt-BR')}`;
  worksheet.mergeCells('A2:L2');
  const metaCell = worksheet.getCell('A2');
  metaCell.value = periodText;
  metaCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(2).height = 20;

  // 3. KPI Summary Row
  worksheet.addRow([]);
  const kpiRow = worksheet.addRow([
    'Total Documentos:',
    kpis.documentCount || documents.length,
    'Frete Total:',
    kpis.totalFrete || 0,
    'ICMS Total:',
    kpis.totalICMS || 0,
    'Total Comissões (75%):',
    kpis.totalComissao75 || 0,
    'Viagens Interestaduais:',
    kpis.interstateCount || 0,
    '',
    ''
  ]);
  kpiRow.font = { bold: true, size: 10 };
  kpiRow.height = 24;
  worksheet.getCell(`D${kpiRow.number}`).numFmt = '"R$" #,##0.00';
  worksheet.getCell(`F${kpiRow.number}`).numFmt = '"R$" #,##0.00';
  worksheet.getCell(`H${kpiRow.number}`).numFmt = '"R$" #,##0.00';
  worksheet.addRow([]);

  // 4. Table Header
  const headerRow = worksheet.addRow([
    'Tipo',
    'Número',
    'Série',
    'Chave de Acesso',
    'Data Emissão',
    'Motorista',
    'CPF',
    'Origem -> Destino',
    'Interestadual',
    'Valor Frete/Carga (R$)',
    'ICMS (R$)',
    'Comissão Motorista 75% (R$)'
  ]);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' } // Slate 900
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };
  });

  const startDataRow = headerRow.number + 1;

  // 5. Populate Data Rows
  documents.forEach((doc, idx) => {
    const isEven = idx % 2 === 0;
    const formattedDate = doc.data_emissao
      ? new Date(doc.data_emissao).toLocaleDateString('pt-BR')
      : '-';

    const isInterstate = doc.interestadual === 1 || doc.uf_origem !== doc.uf_destino ? 'SIM' : 'NÃO';

    const row = worksheet.addRow([
      doc.tipo,
      doc.numero,
      doc.serie,
      doc.chave_acesso,
      formattedDate,
      doc.motorista_nome,
      doc.motorista_cpf,
      `${doc.origem} -> ${doc.destino}`,
      isInterstate,
      parseFloat(doc.valor || 0),
      parseFloat(doc.valor_icms || 0),
      parseFloat(doc.valor_comissao || (doc.tipo === 'CT-e' ? (doc.valor * 0.75) : 0))
    ]);

    row.height = 20;

    // Cell styling
    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if (!isEven) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' }
        };
      }

      // Column alignments
      if ([1, 2, 3, 5, 7, 9].includes(colNumber)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if ([10, 11, 12].includes(colNumber)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '"R$" #,##0.00';
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }

      // Badge coloring for Type
      if (colNumber === 1) {
        if (doc.tipo === 'CT-e') {
          cell.font = { bold: true, color: { argb: 'FF0D9488' } };
        } else {
          cell.font = { bold: true, color: { argb: 'FF6366F1' } };
        }
      }

      // Commission highlight
      if (colNumber === 12) {
        cell.font = { bold: true, color: { argb: 'FF059669' } }; // Green
      }
    });
  });

  const endDataRow = worksheet.lastRow.number;

  // 6. Summary / Total Row with Formulas
  if (documents.length > 0) {
    const totalRow = worksheet.addRow([
      'TOTALIZAÇÃO',
      { formula: `COUNT(B${startDataRow}:B${endDataRow})` },
      '',
      '',
      '',
      '',
      '',
      '',
      'TOTAIS:',
      { formula: `SUM(J${startDataRow}:J${endDataRow})` },
      { formula: `SUM(K${startDataRow}:K${endDataRow})` },
      { formula: `SUM(L${startDataRow}:L${endDataRow})` }
    ]);
    totalRow.height = 25;

    totalRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' }
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0F172A' } },
        bottom: { style: 'double', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };

      if ([10, 11, 12].includes(colNumber)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '"R$" #,##0.00';
      } else if ([1, 2, 9].includes(colNumber)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });
  }

  // 7. Auto-fit column widths
  worksheet.columns.forEach((column, index) => {
    let maxLength = 12;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const length = cell.value ? String(cell.value).length : 0;
      if (length > maxLength) {
        maxLength = length;
      }
    });
    column.width = Math.min(Math.max(maxLength + 3, 12), 48);
  });

  worksheet.getColumn(4).width = 46; // Chave de acesso
  worksheet.getColumn(12).width = 24; // Comissão 75%

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  generateExcelReport
};
