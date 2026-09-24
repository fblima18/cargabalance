const ExcelJS = require('exceljs');

/**
 * Generates an executive Excel workbook (.xlsx) with multiple sheets
 * for financial accountability and fiscal auditing (CARGA BALANCE).
 */
async function generateExcelReport(documents, kpis, filterParams = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CARGA BALANCE - Auditoria de frete';
  workbook.lastModifiedBy = 'CARGA BALANCE - Auditoria de frete';
  workbook.created = new Date();
  workbook.modified = new Date();

  const totalFrete = parseFloat(kpis.totalFrete || 0);
  const totalComissao75 = parseFloat(kpis.totalComissao75 || (totalFrete * 0.75));
  const margemTransportadora25 = Math.max(0, totalFrete - totalComissao75);
  const totalICMS = parseFloat(kpis.totalICMS || 0);
  const totalDocs = parseInt(kpis.documentCount || documents.length, 10);
  const totalInterstate = parseInt(kpis.interstateCount || 0, 10);

  // Group by driver for payment distribution
  const driverMap = {};
  documents.forEach((d) => {
    const key = d.motorista_cpf || d.motorista_nome || 'Outros';
    if (!driverMap[key]) {
      driverMap[key] = {
        nome: d.motorista_nome || 'Não Informado',
        cpf: d.motorista_cpf || '-',
        cnh: d.motorista_cnh || '-',
        vinculo: d.motorista_tipo_vinculo || 'Frota Própria',
        placas: [d.motorista_placa_cavalo, d.motorista_placa_carreta].filter(Boolean).join(' / ') || '-',
        pix: d.motorista_chave_pix || 'A Cadastrar',
        telefone: d.motorista_telefone || '-',
        qtdDocs: 0,
        totalFrete: 0,
        totalComissao75: 0,
        totalMargem25: 0
      };
    }
    driverMap[key].qtdDocs += 1;
    const val = parseFloat(d.valor || 0);
    const com = parseFloat(d.valor_comissao || (d.tipo === 'CT-e' ? (val * 0.75) : 0));
    driverMap[key].totalFrete += val;
    driverMap[key].totalComissao75 += com;
    driverMap[key].totalMargem25 += Math.max(0, val - com);
  });

  const driverList = Object.values(driverMap).sort((a, b) => b.totalComissao75 - a.totalComissao75);

  const formatDt = (dt) => {
    if (!dt) return '-';
    try {
      const d = new Date(dt);
      return isNaN(d.getTime()) ? dt : d.toLocaleString('pt-BR');
    } catch {
      return dt;
    }
  };

  // =========================================================================
  // ABA 1: PRESTAÇÃO DE CONTAS AO FINANCEIRO (RESUMO EXECUTIVO & AUDITORIA)
  // =========================================================================
  const wsFin = workbook.addWorksheet('Prestação de Contas (Financeiro)', {
    views: [{ showGridLines: true }]
  });

  // Title Banner
  wsFin.mergeCells('A1:J1');
  const finTitle = wsFin.getCell('A1');
  finTitle.value = 'CARGA BALANCE - AUDITORIA DE FRETE & PRESTAÇÃO DE CONTAS FINANCEIRA E FISCAL';
  finTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  finTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  finTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; // Slate 900
  wsFin.getRow(1).height = 36;

  // Subtitle
  wsFin.mergeCells('A2:J2');
  const finSub = wsFin.getCell('A2');
  finSub.value = 'DEMONSTRATIVO ANALÍTICO DE FRETE, REPASSE A MOTORISTAS (75%) E DESTAQUE DE ICMS';
  finSub.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF38BDF8' } };
  finSub.alignment = { horizontal: 'center', vertical: 'middle' };
  finSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  wsFin.getRow(2).height = 22;

  // Metadata
  const periodStr = `Período: ${filterParams.startDate || 'Geral'} até ${filterParams.endDate || 'Geral'} | Emissão do Relatório: ${new Date().toLocaleString('pt-BR')} | Status: AUDITADO SEFAZ`;
  wsFin.mergeCells('A3:J3');
  const finMeta = wsFin.getCell('A3');
  finMeta.value = periodStr;
  finMeta.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } };
  finMeta.alignment = { horizontal: 'center', vertical: 'middle' };
  wsFin.getRow(3).height = 20;

  wsFin.addRow([]); // Blank row

  // Section 1: Balanço Financeiro Consolidado
  wsFin.mergeCells('A5:J5');
  const sec1 = wsFin.getCell('A5');
  sec1.value = '1. CONSOLIDAÇÃO FINANCEIRA E RESULTADOS DA OPERAÇÃO';
  sec1.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  sec1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; // Blue 600
  sec1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  wsFin.getRow(5).height = 24;

  const finKpiHeader = wsFin.addRow([
    'Indicador Financeiro / Fiscal',
    '',
    'Valor Consolidado (R$)',
    '',
    'Participação (%)',
    'Base de Regra / Observação',
    '', '', '', ''
  ]);
  finKpiHeader.font = { bold: true, size: 10 };
  wsFin.mergeCells(`A${finKpiHeader.number}:B${finKpiHeader.number}`);
  wsFin.mergeCells(`C${finKpiHeader.number}:D${finKpiHeader.number}`);
  wsFin.mergeCells(`F${finKpiHeader.number}:J${finKpiHeader.number}`);

  const addFinMetric = (label, value, pct, obs, colorHex = 'FF0F172A') => {
    const row = wsFin.addRow([
      label, '', value, '', pct, obs, '', '', '', ''
    ]);
    row.height = 22;
    wsFin.mergeCells(`A${row.number}:B${row.number}`);
    wsFin.mergeCells(`C${row.number}:D${row.number}`);
    wsFin.mergeCells(`F${row.number}:J${row.number}`);
    row.getCell(1).font = { bold: true, size: 10, color: { argb: colorHex } };
    row.getCell(3).font = { bold: true, size: 10 };
    row.getCell(3).numFmt = '"R$" #,##0.00';
    row.getCell(3).alignment = { horizontal: 'right' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(6).font = { size: 9, italic: true, color: { argb: 'FF475569' } };
    return row;
  };

  addFinMetric('Faturamento Bruto de Fretes (CT-e)', totalFrete, '100.0%', 'Receita operacional total emitida e auditada', 'FF2563EB');
  addFinMetric('Comissões dos Motoristas (75%)', totalComissao75, '75.0%', 'Saldo líquido a repassar aos condutores dos veículos', 'FF059669');
  addFinMetric('Margem Retida da Transportadora (25%)', margemTransportadora25, '25.0%', 'Resultado operacional bruto após comissão dos condutores', 'FF0284C7');
  addFinMetric('Total ICMS Destacado / Recolhido', totalICMS, totalFrete > 0 ? `${((totalICMS / totalFrete) * 100).toFixed(1)}%` : '0%', 'Imposto sobre prestações de transporte interestadual e interno', 'FFD97706');

  wsFin.addRow([]); // Blank

  // Section 2: Rateio de Pagamentos aos Condutores
  wsFin.mergeCells('A12:J12');
  const sec2 = wsFin.getCell('A12');
  sec2.value = '2. PROGRAMAÇÃO DE PAGAMENTOS AOS MOTORISTAS (COMISSÃO 75% - CONTAS A PAGAR)';
  sec2.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  sec2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } }; // Green 600
  sec2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  wsFin.getRow(12).height = 24;

  const dHead = wsFin.addRow([
    'Motorista',
    'CPF',
    'Vínculo',
    'Placa(s)',
    'Chave PIX',
    'Viagens',
    'Frete Total (R$)',
    'Comissão 75% (R$)',
    'Margem 25% (R$)',
    'Status Financeiro'
  ]);
  dHead.height = 24;
  dHead.eachCell((c) => {
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const startD = dHead.number + 1;
  driverList.forEach((d) => {
    const r = wsFin.addRow([
      d.nome,
      d.cpf,
      d.vinculo,
      d.placas,
      d.pix,
      d.qtdDocs,
      d.totalFrete,
      d.totalComissao75,
      d.totalMargem25,
      'A Pagar'
    ]);
    r.height = 20;
    r.getCell(1).alignment = { horizontal: 'left' };
    r.getCell(2).alignment = { horizontal: 'center' };
    r.getCell(3).alignment = { horizontal: 'center' };
    r.getCell(4).alignment = { horizontal: 'center' };
    r.getCell(5).alignment = { horizontal: 'center' };
    r.getCell(6).alignment = { horizontal: 'center' };
    r.getCell(7).alignment = { horizontal: 'right' };
    r.getCell(7).numFmt = '"R$" #,##0.00';
    r.getCell(8).alignment = { horizontal: 'right' };
    r.getCell(8).numFmt = '"R$" #,##0.00';
    r.getCell(8).font = { bold: true, color: { argb: 'FF059669' } };
    r.getCell(9).alignment = { horizontal: 'right' };
    r.getCell(9).numFmt = '"R$" #,##0.00';
    r.getCell(10).alignment = { horizontal: 'center' };
    r.getCell(10).font = { bold: true, color: { argb: 'FF2563EB' } };
  });
  const endD = wsFin.lastRow.number;

  // Total Driver Row
  if (driverList.length > 0) {
    const totD = wsFin.addRow([
      'TOTALIZAÇÃO DOS MOTORISTAS',
      '', '', '', '',
      { formula: `SUM(F${startD}:F${endD})` },
      { formula: `SUM(G${startD}:G${endD})` },
      { formula: `SUM(H${startD}:H${endD})` },
      { formula: `SUM(I${startD}:I${endD})` },
      'LIBERAR REPASSE'
    ]);
    totD.height = 24;
    wsFin.mergeCells(`A${totD.number}:E${totD.number}`);
    totD.eachCell((c) => {
      c.font = { bold: true, size: 10, color: { argb: 'FF0F172A' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      c.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
    });
    totD.getCell(6).alignment = { horizontal: 'center' };
    totD.getCell(7).numFmt = '"R$" #,##0.00';
    totD.getCell(8).numFmt = '"R$" #,##0.00';
    totD.getCell(9).numFmt = '"R$" #,##0.00';
    totD.getCell(10).alignment = { horizontal: 'center' };
  }

  wsFin.addRow([]); // Blank

  // Section 3: Termo de Encerramento e Assinaturas
  const signRowIdx = wsFin.lastRow.number + 2;
  wsFin.mergeCells(`A${signRowIdx}:J${signRowIdx}`);
  const sTitle = wsFin.getCell(`A${signRowIdx}`);
  sTitle.value = '3. TERMO DE APROVAÇÃO E CONFERÊNCIA FINANCEIRA';
  sTitle.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  sTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
  sTitle.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  wsFin.getRow(signRowIdx).height = 22;

  const signLine1 = signRowIdx + 4;
  wsFin.mergeCells(`B${signLine1}:D${signLine1}`);
  wsFin.mergeCells(`G${signLine1}:I${signLine1}`);
  wsFin.getCell(`B${signLine1}`).value = '_____________________________________________';
  wsFin.getCell(`G${signLine1}`).value = '_____________________________________________';
  wsFin.getCell(`B${signLine1}`).alignment = { horizontal: 'center' };
  wsFin.getCell(`G${signLine1}`).alignment = { horizontal: 'center' };

  const signLine2 = signLine1 + 1;
  wsFin.mergeCells(`B${signLine2}:D${signLine2}`);
  wsFin.mergeCells(`G${signLine2}:I${signLine2}`);
  wsFin.getCell(`B${signLine2}`).value = 'Responsável pela Auditoria de Fretes';
  wsFin.getCell(`G${signLine2}`).value = 'Aprovação - Gerência Financeira / Contábil';
  wsFin.getCell(`B${signLine2}`).font = { bold: true, size: 9 };
  wsFin.getCell(`G${signLine2}`).font = { bold: true, size: 9 };
  wsFin.getCell(`B${signLine2}`).alignment = { horizontal: 'center' };
  wsFin.getCell(`G${signLine2}`).alignment = { horizontal: 'center' };

  // Adjust column widths for Sheet 1
  wsFin.getColumn(1).width = 28;
  wsFin.getColumn(2).width = 16;
  wsFin.getColumn(3).width = 18;
  wsFin.getColumn(4).width = 16;
  wsFin.getColumn(5).width = 24;
  wsFin.getColumn(6).width = 10;
  wsFin.getColumn(7).width = 18;
  wsFin.getColumn(8).width = 20;
  wsFin.getColumn(9).width = 18;
  wsFin.getColumn(10).width = 18;

  // =========================================================================
  // ABA 2: DETALHAMENTO FISCAL E FRETE (LOTE A LOTE DE DOCUMENTOS)
  // =========================================================================
  const wsDocs = workbook.addWorksheet('Auditoria Fiscal e Documentos', {
    views: [{ showGridLines: true }]
  });

  wsDocs.mergeCells('A1:U1');
  const dTitle = wsDocs.getCell('A1');
  dTitle.value = 'CARGA BALANCE - DETALHAMENTO ANALÍTICO DE CONHECIMENTOS (CT-e) E MANIFESTOS (MDF-e)';
  dTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  dTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  dTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  wsDocs.getRow(1).height = 30;

  wsDocs.mergeCells('A2:U2');
  const dMeta = wsDocs.getCell('A2');
  dMeta.value = periodStr;
  dMeta.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF475569' } };
  dMeta.alignment = { horizontal: 'center', vertical: 'middle' };
  wsDocs.getRow(2).height = 18;

  const docHeader = wsDocs.addRow([
    'Tipo',
    'Número',
    'Série',
    'Chave de Acesso (SEFAZ)',
    'Data Emissão',
    'Empresa Remetente',
    'CNPJ Remetente',
    'Empresa Recebedora / Dest.',
    'CNPJ Destinatário',
    'Origem -> Destino',
    'UFs Percurso (MDF-e)',
    'Data/Hora Saída',
    'Prev. Chegada',
    'Motorista',
    'CPF Motorista',
    'Placa(s)',
    'Interestadual',
    'Valor Frete/Carga (R$)',
    'ICMS Destacado (R$)',
    'Comissão 75% (R$)',
    'Margem 25% (R$)'
  ]);
  docHeader.height = 26;
  docHeader.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border = { top: { style: 'thin' }, bottom: { style: 'medium' } };
  });

  const startDocs = docHeader.number + 1;
  documents.forEach((doc, idx) => {
    const isEven = idx % 2 === 0;
    const formattedDate = doc.data_emissao
      ? new Date(doc.data_emissao).toLocaleDateString('pt-BR')
      : '-';

    const isInterstate = doc.interestadual === 1 || doc.uf_origem !== doc.uf_destino ? 'SIM' : 'NÃO';
    const val = parseFloat(doc.valor || 0);
    const icms = parseFloat(doc.valor_icms || 0);
    const com = parseFloat(doc.valor_comissao || (doc.tipo === 'CT-e' ? (val * 0.75) : 0));
    const margem = Math.max(0, val - com);
    const placas = [doc.motorista_placa_cavalo, doc.motorista_placa_carreta].filter(Boolean).join('/') || '-';

    const row = wsDocs.addRow([
      doc.tipo,
      doc.numero,
      doc.serie,
      doc.chave_acesso,
      formattedDate,
      doc.remetente_nome || 'Não Informado',
      doc.remetente_cnpj || '-',
      doc.destinatario_nome || 'Não Informado',
      doc.destinatario_cnpj || '-',
      `${doc.origem} -> ${doc.destino}`,
      doc.ufs_percurso || (isInterstate === 'SIM' ? 'PE' : '-'),
      formatDt(doc.data_saida),
      formatDt(doc.previsao_chegada),
      doc.motorista_nome,
      doc.motorista_cpf,
      placas,
      isInterstate,
      val,
      icms,
      com,
      margem
    ]);

    row.height = 20;
    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      if (!isEven) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }

      // Column alignments
      if ([1, 2, 3, 5, 7, 9, 11, 12, 13, 15, 16, 17].includes(colNumber)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if ([18, 19, 20, 21].includes(colNumber)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '"R$" #,##0.00';
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }

      if (colNumber === 1) {
        cell.font = { bold: true, color: { argb: doc.tipo === 'CT-e' ? 'FF0D9488' : 'FF6366F1' } };
      }
      if (colNumber === 20) {
        cell.font = { bold: true, color: { argb: 'FF059669' } };
      }
    });
  });

  const endDocs = wsDocs.lastRow.number;

  // Summary Row on Docs Sheet
  if (documents.length > 0) {
    const totDocs = wsDocs.addRow([
      'TOTALIZAÇÃO',
      { formula: `COUNT(B${startDocs}:B${endDocs})` },
      '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      'TOTAIS:',
      { formula: `SUM(R${startDocs}:R${endDocs})` },
      { formula: `SUM(S${startDocs}:S${endDocs})` },
      { formula: `SUM(T${startDocs}:T${endDocs})` },
      { formula: `SUM(U${startDocs}:U${endDocs})` }
    ]);
    totDocs.height = 25;
    totDocs.eachCell((c, colNumber) => {
      c.font = { bold: true, size: 9, color: { argb: 'FF0F172A' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      c.border = { top: { style: 'medium' }, bottom: { style: 'double' } };
      if ([18, 19, 20, 21].includes(colNumber)) {
        c.alignment = { horizontal: 'right', vertical: 'middle' };
        c.numFmt = '"R$" #,##0.00';
      } else if ([1, 2, 17].includes(colNumber)) {
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });
  }

  // Auto-fit column widths for Sheet 2
  wsDocs.columns.forEach((col) => {
    let max = 12;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > max) max = len;
    });
    col.width = Math.min(Math.max(max + 3, 11), 46);
  });
  wsDocs.getColumn(4).width = 46; // Chave de acesso
  wsDocs.getColumn(6).width = 28; // Remetente
  wsDocs.getColumn(8).width = 28; // Destinatário
  wsDocs.getColumn(20).width = 22; // Comissão 75%

  // =========================================================================
  // ABA 3: RATEIO MOTORISTAS (75% - CONTAS A PAGAR)
  // =========================================================================
  const wsRateio = workbook.addWorksheet('Rateio Motoristas (75%)', {
    views: [{ showGridLines: true }]
  });

  wsRateio.mergeCells('A1:K1');
  const rTitle = wsRateio.getCell('A1');
  rTitle.value = 'CARGA BALANCE - RELAÇÃO DE PAGAMENTOS AOS CONDUTORES (COMISSÃO 75%)';
  rTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  rTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  rTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
  wsRateio.getRow(1).height = 30;

  const rHead = wsRateio.addRow([
    'Nome do Motorista',
    'CPF',
    'CNH',
    'Tipo de Vínculo',
    'Telefone',
    'Chave PIX',
    'Qtd Fretes',
    'Frete Bruto Total (R$)',
    'Comissão Líquida 75% (R$)',
    'Margem Retida 25% (R$)',
    'Autorização Financeira'
  ]);
  rHead.height = 24;
  rHead.eachCell((c) => {
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const startR = rHead.number + 1;
  driverList.forEach((d) => {
    const row = wsRateio.addRow([
      d.nome,
      d.cpf,
      d.cnh,
      d.vinculo,
      d.telefone,
      d.pix,
      d.qtdDocs,
      d.totalFrete,
      d.totalComissao75,
      d.totalMargem25,
      'Liberado para Pagamento'
    ]);
    row.height = 20;
    row.getCell(1).alignment = { horizontal: 'left' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(6).alignment = { horizontal: 'center' };
    row.getCell(7).alignment = { horizontal: 'center' };
    row.getCell(8).alignment = { horizontal: 'right' };
    row.getCell(8).numFmt = '"R$" #,##0.00';
    row.getCell(9).alignment = { horizontal: 'right' };
    row.getCell(9).numFmt = '"R$" #,##0.00';
    row.getCell(9).font = { bold: true, color: { argb: 'FF059669' } };
    row.getCell(10).alignment = { horizontal: 'right' };
    row.getCell(10).numFmt = '"R$" #,##0.00';
    row.getCell(11).alignment = { horizontal: 'center' };
    row.getCell(11).font = { bold: true, color: { argb: 'FF2563EB' } };
  });
  const endR = wsRateio.lastRow.number;

  if (driverList.length > 0) {
    const totR = wsRateio.addRow([
      'TOTAL A REPASSAR AOS CONDUTORES',
      '', '', '', '', '',
      { formula: `SUM(G${startR}:G${endR})` },
      { formula: `SUM(H${startR}:H${endR})` },
      { formula: `SUM(I${startR}:I${endR})` },
      { formula: `SUM(J${startR}:J${endR})` },
      'CONFERIDO'
    ]);
    totR.height = 24;
    wsRateio.mergeCells(`A${totR.number}:F${totR.number}`);
    totR.eachCell((c) => {
      c.font = { bold: true, size: 9, color: { argb: 'FF0F172A' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      c.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
    });
    totR.getCell(7).alignment = { horizontal: 'center' };
    totR.getCell(8).numFmt = '"R$" #,##0.00';
    totR.getCell(9).numFmt = '"R$" #,##0.00';
    totR.getCell(10).numFmt = '"R$" #,##0.00';
    totR.getCell(11).alignment = { horizontal: 'center' };
  }

  wsRateio.columns.forEach((c) => {
    let max = 12;
    c.eachCell({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > max) max = len;
    });
    c.width = Math.min(Math.max(max + 3, 12), 36);
  });
  wsRateio.getColumn(1).width = 28;
  wsRateio.getColumn(6).width = 26;
  wsRateio.getColumn(9).width = 24;

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  generateExcelReport
};
