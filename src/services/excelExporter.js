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
      const pct = (d.motorista_percentual_comissao !== undefined && d.motorista_percentual_comissao !== null)
        ? parseFloat(d.motorista_percentual_comissao)
        : 75.0;
      driverMap[key] = {
        nome: d.motorista_nome || 'Não Informado',
        cpf: d.motorista_cpf || '-',
        cnh: d.motorista_cnh || '-',
        vinculo: d.motorista_tipo_vinculo || 'Frota Própria',
        placas: [d.motorista_placa_cavalo, d.motorista_placa_carreta].filter(Boolean).join(' / ') || '-',
        pix: d.motorista_chave_pix || 'A Cadastrar',
        telefone: d.motorista_telefone || '-',
        percentualComissao: pct,
        qtdDocs: 0,
        totalFrete: 0,
        totalComissao: 0,
        totalMargem: 0
      };
    }
    driverMap[key].qtdDocs += 1;
    const val = parseFloat(d.valor || 0);
    const pct = driverMap[key].percentualComissao || 75.0;
    const com = parseFloat(d.valor_comissao != null ? d.valor_comissao : (d.tipo === 'CT-e' ? (val * (pct / 100.0)) : 0));
    driverMap[key].totalFrete += val;
    driverMap[key].totalComissao += com;
    driverMap[key].totalMargem += Math.max(0, val - com);
  });

  const driverList = Object.values(driverMap).sort((a, b) => b.totalComissao - a.totalComissao);

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
  wsFin.mergeCells('A1:K1');
  const finTitle = wsFin.getCell('A1');
  finTitle.value = 'CARGA BALANCE - AUDITORIA DE FRETE & PRESTAÇÃO DE CONTAS FINANCEIRA E FISCAL';
  finTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  finTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  finTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; // Slate 900
  wsFin.getRow(1).height = 36;

  // Subtitle
  wsFin.mergeCells('A2:K2');
  const finSub = wsFin.getCell('A2');
  finSub.value = 'DEMONSTRATIVO ANALÍTICO DE FRETE, REPASSE A MOTORISTAS E DESTAQUE DE ICMS';
  finSub.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF38BDF8' } };
  finSub.alignment = { horizontal: 'center', vertical: 'middle' };
  finSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  wsFin.getRow(2).height = 22;

  // Metadata
  const periodStr = `Período: ${filterParams.startDate || 'Geral'} até ${filterParams.endDate || 'Geral'} | Emissão do Relatório: ${new Date().toLocaleString('pt-BR')} | Status: AUDITADO SEFAZ`;
  wsFin.mergeCells('A3:K3');
  const finMeta = wsFin.getCell('A3');
  finMeta.value = periodStr;
  finMeta.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } };
  finMeta.alignment = { horizontal: 'center', vertical: 'middle' };
  wsFin.getRow(3).height = 20;

  wsFin.addRow([]); // Blank row

  // Section 1: Balanço Financeiro Consolidado
  wsFin.mergeCells('A5:K5');
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
    '', '', '', '', ''
  ]);
  finKpiHeader.font = { bold: true, size: 10 };
  wsFin.mergeCells(`A${finKpiHeader.number}:B${finKpiHeader.number}`);
  wsFin.mergeCells(`C${finKpiHeader.number}:D${finKpiHeader.number}`);
  wsFin.mergeCells(`F${finKpiHeader.number}:K${finKpiHeader.number}`);

  const addFinMetric = (label, value, pct, obs, colorHex = 'FF0F172A') => {
    const row = wsFin.addRow([
      label, '', value, '', pct, obs, '', '', '', '', ''
    ]);
    row.height = 22;
    wsFin.mergeCells(`A${row.number}:B${row.number}`);
    wsFin.mergeCells(`C${row.number}:D${row.number}`);
    wsFin.mergeCells(`F${row.number}:K${row.number}`);
    row.getCell(1).font = { bold: true, size: 10, color: { argb: colorHex } };
    row.getCell(3).font = { bold: true, size: 10 };
    row.getCell(3).numFmt = '"R$" #,##0.00';
    row.getCell(3).alignment = { horizontal: 'right' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(6).font = { size: 9, italic: true, color: { argb: 'FF475569' } };
    return row;
  };

  const pctRepasseTotal = totalFrete > 0 ? `${((totalComissao75 / totalFrete) * 100).toFixed(1)}%` : '75.0%';
  const pctMargemTotal = totalFrete > 0 ? `${((margemTransportadora25 / totalFrete) * 100).toFixed(1)}%` : '25.0%';

  addFinMetric('Faturamento Bruto de Fretes (CT-e)', totalFrete, '100.0%', 'Receita operacional total emitida e auditada', 'FF2563EB');
  addFinMetric('Comissões dos Motoristas (Repasse)', totalComissao75, pctRepasseTotal, 'Saldo líquido a repassar aos condutores (taxas individuais configuradas)', 'FF059669');
  addFinMetric('Margem Retida da Transportadora', margemTransportadora25, pctMargemTotal, 'Resultado operacional bruto após comissão dos condutores', 'FF0284C7');
  addFinMetric('Total ICMS Destacado / Recolhido', totalICMS, totalFrete > 0 ? `${((totalICMS / totalFrete) * 100).toFixed(1)}%` : '0%', 'Imposto sobre prestações de transporte interestadual e interno', 'FFD97706');

  wsFin.addRow([]); // Blank

  // Section 2: Rateio de Pagamentos aos Condutores
  wsFin.mergeCells('A12:K12');
  const sec2 = wsFin.getCell('A12');
  sec2.value = '2. PROGRAMAÇÃO DE PAGAMENTOS AOS MOTORISTAS (REPASSE DE COMISSÃO - CONTAS A PAGAR)';
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
    '% Repasse',
    'Comissão Líquida (R$)',
    'Margem Empresa (R$)',
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
      `${d.percentualComissao || 75}%`,
      d.totalComissao,
      d.totalMargem,
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
    r.getCell(8).alignment = { horizontal: 'center' };
    r.getCell(8).font = { bold: true, color: { argb: 'FF059669' } };
    r.getCell(9).alignment = { horizontal: 'right' };
    r.getCell(9).numFmt = '"R$" #,##0.00';
    r.getCell(9).font = { bold: true, color: { argb: 'FF059669' } };
    r.getCell(10).alignment = { horizontal: 'right' };
    r.getCell(10).numFmt = '"R$" #,##0.00';
    r.getCell(11).alignment = { horizontal: 'center' };
    r.getCell(11).font = { bold: true, color: { argb: 'FF2563EB' } };
  });
  const endD = wsFin.lastRow.number;

  // Total Driver Row
  if (driverList.length > 0) {
    const totD = wsFin.addRow([
      'TOTALIZAÇÃO DOS MOTORISTAS',
      '', '', '', '',
      { formula: `SUM(F${startD}:F${endD})` },
      { formula: `SUM(G${startD}:G${endD})` },
      '-',
      { formula: `SUM(I${startD}:I${endD})` },
      { formula: `SUM(J${startD}:J${endD})` },
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
    totD.getCell(8).alignment = { horizontal: 'center' };
    totD.getCell(9).numFmt = '"R$" #,##0.00';
    totD.getCell(10).numFmt = '"R$" #,##0.00';
    totD.getCell(11).alignment = { horizontal: 'center' };
  }

  wsFin.addRow([]); // Blank

  // Section 3: Termo de Encerramento e Assinaturas
  const signRowIdx = wsFin.lastRow.number + 2;
  wsFin.mergeCells(`A${signRowIdx}:K${signRowIdx}`);
  const sTitle = wsFin.getCell(`A${signRowIdx}`);
  sTitle.value = '3. TERMO DE APROVAÇÃO E CONFERÊNCIA FINANCEIRA';
  sTitle.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  sTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
  sTitle.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  wsFin.getRow(signRowIdx).height = 22;

  const signLine1 = signRowIdx + 4;
  wsFin.mergeCells(`B${signLine1}:D${signLine1}`);
  wsFin.mergeCells(`G${signLine1}:J${signLine1}`);
  wsFin.getCell(`B${signLine1}`).value = '_____________________________________________';
  wsFin.getCell(`G${signLine1}`).value = '_____________________________________________';
  wsFin.getCell(`B${signLine1}`).alignment = { horizontal: 'center' };
  wsFin.getCell(`G${signLine1}`).alignment = { horizontal: 'center' };

  const signLine2 = signLine1 + 1;
  wsFin.mergeCells(`B${signLine2}:D${signLine2}`);
  wsFin.mergeCells(`G${signLine2}:J${signLine2}`);
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
  wsFin.getColumn(8).width = 14;
  wsFin.getColumn(9).width = 20;
  wsFin.getColumn(10).width = 18;
  wsFin.getColumn(11).width = 18;

  // =========================================================================
  // ABA 2: DETALHAMENTO FISCAL E FRETE (LOTE A LOTE DE DOCUMENTOS)
  // =========================================================================
  const wsDocs = workbook.addWorksheet('Auditoria Fiscal e Documentos', {
    views: [{ showGridLines: true }]
  });

  wsDocs.mergeCells('A1:V1');
  const dTitle = wsDocs.getCell('A1');
  dTitle.value = 'CARGA BALANCE - DETALHAMENTO ANALÍTICO DE CONHECIMENTOS (CT-e) E MANIFESTOS (MDF-e)';
  dTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  dTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  dTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  wsDocs.getRow(1).height = 30;

  wsDocs.mergeCells('A2:V2');
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
    '% Repasse',
    'Comissão Condutor (R$)',
    'Margem Retida (R$)'
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
    const pct = (doc.motorista_percentual_comissao !== undefined && doc.motorista_percentual_comissao !== null)
      ? parseFloat(doc.motorista_percentual_comissao)
      : 75.0;
    const com = parseFloat(doc.valor_comissao != null ? doc.valor_comissao : (doc.tipo === 'CT-e' ? (val * (pct / 100.0)) : 0));
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
      doc.tipo === 'CT-e' ? `${pct}%` : '-',
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
      if ([1, 2, 3, 5, 7, 9, 11, 12, 13, 15, 16, 17, 20].includes(colNumber)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if ([18, 19, 21, 22].includes(colNumber)) {
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
      if (colNumber === 21) {
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
      '-',
      { formula: `SUM(U${startDocs}:U${endDocs})` },
      { formula: `SUM(V${startDocs}:V${endDocs})` }
    ]);
    totDocs.height = 25;
    totDocs.eachCell((c, colNumber) => {
      c.font = { bold: true, size: 9, color: { argb: 'FF0F172A' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      c.border = { top: { style: 'medium' }, bottom: { style: 'double' } };
      if ([18, 19, 21, 22].includes(colNumber)) {
        c.alignment = { horizontal: 'right', vertical: 'middle' };
        c.numFmt = '"R$" #,##0.00';
      } else if ([1, 2, 17, 20].includes(colNumber)) {
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
  wsDocs.getColumn(20).width = 14; // % Repasse
  wsDocs.getColumn(21).width = 22; // Comissão

  // =========================================================================
  // ABA 3: RATEIO MOTORISTAS (REPASSE DE COMISSÃO - CONTAS A PAGAR)
  // =========================================================================
  const wsRateio = workbook.addWorksheet('Rateio Motoristas', {
    views: [{ showGridLines: true }]
  });

  wsRateio.mergeCells('A1:L1');
  const rTitle = wsRateio.getCell('A1');
  rTitle.value = 'CARGA BALANCE - RELAÇÃO DE PAGAMENTOS AOS CONDUTORES (REPASSE DE COMISSÃO)';
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
    '% Repasse',
    'Comissão Líquida (R$)',
    'Margem Retida (R$)',
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
      `${d.percentualComissao || 75}%`,
      d.totalComissao,
      d.totalMargem,
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
    row.getCell(9).alignment = { horizontal: 'center' };
    row.getCell(9).font = { bold: true, color: { argb: 'FF059669' } };
    row.getCell(10).alignment = { horizontal: 'right' };
    row.getCell(10).numFmt = '"R$" #,##0.00';
    row.getCell(10).font = { bold: true, color: { argb: 'FF059669' } };
    row.getCell(11).alignment = { horizontal: 'right' };
    row.getCell(11).numFmt = '"R$" #,##0.00';
    row.getCell(12).alignment = { horizontal: 'center' };
    row.getCell(12).font = { bold: true, color: { argb: 'FF2563EB' } };
  });
  const endR = wsRateio.lastRow.number;

  if (driverList.length > 0) {
    const totR = wsRateio.addRow([
      'TOTAL A REPASSAR AOS CONDUTORES',
      '', '', '', '', '',
      { formula: `SUM(G${startR}:G${endR})` },
      { formula: `SUM(H${startR}:H${endR})` },
      '-',
      { formula: `SUM(J${startR}:J${endR})` },
      { formula: `SUM(K${startR}:K${endR})` },
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
    totR.getCell(9).alignment = { horizontal: 'center' };
    totR.getCell(10).numFmt = '"R$" #,##0.00';
    totR.getCell(11).numFmt = '"R$" #,##0.00';
    totR.getCell(12).alignment = { horizontal: 'center' };
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
  wsRateio.getColumn(9).width = 16;
  wsRateio.getColumn(10).width = 24;

  return await workbook.xlsx.writeBuffer();
}

/**
 * Generate Excel (.xlsx) workbook for Processed NF-e Batch & CT-e Grouping
 */
async function generateNFeBatchExcel(batchData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CARGA BALANCE - Roteador de NF-e para CT-e';
  workbook.lastModifiedBy = 'CARGA BALANCE';
  workbook.created = new Date();
  workbook.modified = new Date();

  const grupos = batchData.grupos_cte || [];
  const kpis = batchData.kpis || {};

  // -------------------------------------------------------------------------
  // ABA 1: LOTES E GRUPOS DE CT-E POR DESTINO / ROTA
  // -------------------------------------------------------------------------
  const wsGrupos = workbook.addWorksheet('Lotes de CT-e por Rota', {
    views: [{ showGridLines: true }]
  });

  // Title Banner
  wsGrupos.mergeCells('A1:J1');
  const gTitle = wsGrupos.getCell('A1');
  gTitle.value = 'CARGA BALANCE - AGRUPAMENTO DE NF-e POR DESTINO & ROTEAMENTO DE CT-e';
  gTitle.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  gTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  gTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  wsGrupos.getRow(1).height = 32;

  // Subtitle
  wsGrupos.mergeCells('A2:J2');
  const gSub = wsGrupos.getCell('A2');
  gSub.value = `Total NF-es: ${kpis.totalNfes || 0} | Lotes/Rotas: ${kpis.totalGrupos || 0} | Carga: R$ ${(kpis.totalValor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Peso: ${(kpis.totalPeso || 0).toLocaleString('pt-BR')} kg | PF (Filiais): ${kpis.totalPf || 0} | PJ (Direto): ${kpis.totalPj || 0}`;
  gSub.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF38BDF8' } };
  gSub.alignment = { horizontal: 'center', vertical: 'middle' };
  gSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  wsGrupos.getRow(2).height = 20;

  wsGrupos.addRow([]); // Blank

  const gHead = wsGrupos.addRow([
    'Destino (Cidade / UF)',
    'Tipo Rota',
    'Destinatário Fiscal do CT-e',
    'CNPJ Destinatário',
    'Regra Aplicada',
    'Qtd NF-es',
    'Peso Bruto (kg)',
    'Volumes',
    'Valor Total Carga (R$)',
    'Resumo da Mercadoria (CT-e)'
  ]);
  gHead.height = 25;
  gHead.eachCell((c) => {
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const startG = gHead.number + 1;
  grupos.forEach((grp) => {
    const destF = grp.destinatario_fiscal_consolidado || {};
    const row = wsGrupos.addRow([
      grp.rota_label,
      grp.is_interestadual ? 'Interestadual' : 'Estadual / Local',
      destF.razao_social || '-',
      destF.cnpj || '-',
      grp.regra_aplicada === 'PF_PARA_FILIAL' ? 'PF ➔ Roteado Filial' : 'PJ Direto',
      grp.total_nfes,
      grp.somatorio_peso_bruto,
      grp.somatorio_volumes,
      grp.somatorio_valor_carga,
      grp.resumo_mercadoria
    ]);
    row.height = 22;
    row.getCell(1).alignment = { horizontal: 'left' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'left' };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(5).font = { bold: true, color: { argb: grp.regra_aplicada === 'PF_PARA_FILIAL' ? 'FFD97706' : 'FF059669' } };
    row.getCell(6).alignment = { horizontal: 'center' };
    row.getCell(7).alignment = { horizontal: 'right' };
    row.getCell(7).numFmt = '#,##0.000 "kg"';
    row.getCell(8).alignment = { horizontal: 'center' };
    row.getCell(9).alignment = { horizontal: 'right' };
    row.getCell(9).numFmt = '"R$" #,##0.00';
    row.getCell(10).alignment = { horizontal: 'left' };
  });
  const endG = wsGrupos.lastRow.number;

  if (grupos.length > 0) {
    const totG = wsGrupos.addRow([
      'TOTALIZAÇÃO DOS LOTES',
      '', '', '', '',
      { formula: `SUM(F${startG}:F${endG})` },
      { formula: `SUM(G${startG}:G${endG})` },
      { formula: `SUM(H${startG}:H${endG})` },
      { formula: `SUM(I${startG}:I${endG})` },
      'PRONTO PARA EMISSÃO'
    ]);
    totG.height = 24;
    wsGrupos.mergeCells(`A${totG.number}:E${totG.number}`);
    totG.eachCell((c) => {
      c.font = { bold: true, size: 9, color: { argb: 'FF0F172A' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      c.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
    });
    totG.getCell(6).alignment = { horizontal: 'center' };
    totG.getCell(7).numFmt = '#,##0.000 "kg"';
    totG.getCell(8).alignment = { horizontal: 'center' };
    totG.getCell(9).numFmt = '"R$" #,##0.00';
    totG.getCell(10).alignment = { horizontal: 'center' };
  }

  // Adjust widths
  wsGrupos.getColumn(1).width = 22;
  wsGrupos.getColumn(2).width = 16;
  wsGrupos.getColumn(3).width = 36;
  wsGrupos.getColumn(4).width = 20;
  wsGrupos.getColumn(5).width = 20;
  wsGrupos.getColumn(6).width = 12;
  wsGrupos.getColumn(7).width = 18;
  wsGrupos.getColumn(8).width = 12;
  wsGrupos.getColumn(9).width = 20;
  wsGrupos.getColumn(10).width = 46;

  // -------------------------------------------------------------------------
  // ABA 2: TRIAGEM DETALHADA DE TODAS AS NF-e DO LOTE
  // -------------------------------------------------------------------------
  const wsNfes = workbook.addWorksheet('Triagem Detalhada de NF-e', {
    views: [{ showGridLines: true }]
  });

  wsNfes.mergeCells('A1:L1');
  const nTitle = wsNfes.getCell('A1');
  nTitle.value = 'CARGA BALANCE - RELAÇÃO DETALHADA DE NOTAS FISCAIS (NF-e MOD. 55)';
  nTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  nTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  nTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  wsNfes.getRow(1).height = 30;

  const nHead = wsNfes.addRow([
    'Lote / Rota',
    'NF-e Nº',
    'Série',
    'Chave de Acesso (SEFAZ)',
    'Data Emissão',
    'Remetente (Emitente)',
    'Destinatário NF-e',
    'Tipo (PF/PJ)',
    'CPF / CNPJ Destinatário',
    'Destinatário Fiscal CT-e (Filial / PJ)',
    'Peso Bruto (kg)',
    'Valor Total NF-e (R$)'
  ]);
  nHead.height = 24;
  nHead.eachCell((c) => {
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const allNfes = [];
  grupos.forEach(grp => {
    (grp.nfes || []).forEach(n => {
      allNfes.push({ ...n, rota_label: grp.rota_label });
    });
  });

  const startN = nHead.number + 1;
  allNfes.forEach((nfe) => {
    const rInfo = nfe.routing_info || {};
    const formattedDate = nfe.data_emissao
      ? new Date(nfe.data_emissao).toLocaleDateString('pt-BR')
      : '-';

    const row = wsNfes.addRow([
      nfe.rota_label,
      nfe.numero,
      nfe.serie,
      nfe.chave_acesso,
      formattedDate,
      nfe.emitente.nome,
      nfe.destinatario.nome,
      nfe.destinatario.tipo_pessoa,
      nfe.destinatario.documento,
      rInfo.destinatario_fiscal_nome || '-',
      nfe.carga.peso_bruto,
      nfe.valores.valor_total_nfe
    ]);
    row.height = 20;
    row.getCell(1).alignment = { horizontal: 'left' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(6).alignment = { horizontal: 'left' };
    row.getCell(7).alignment = { horizontal: 'left' };
    row.getCell(8).alignment = { horizontal: 'center' };
    row.getCell(8).font = { bold: true, color: { argb: nfe.destinatario.is_pj ? 'FF059669' : 'FFD97706' } };
    row.getCell(9).alignment = { horizontal: 'center' };
    row.getCell(10).alignment = { horizontal: 'left' };
    row.getCell(11).alignment = { horizontal: 'right' };
    row.getCell(11).numFmt = '#,##0.000 "kg"';
    row.getCell(12).alignment = { horizontal: 'right' };
    row.getCell(12).numFmt = '"R$" #,##0.00';
  });
  const endN = wsNfes.lastRow.number;

  if (allNfes.length > 0) {
    const totN = wsNfes.addRow([
      'TOTAL DE NOTAS FISCAIS',
      { formula: `COUNT(B${startN}:B${endN})` },
      '', '', '', '', '', '', '', 'TOTAIS:',
      { formula: `SUM(K${startN}:K${endN})` },
      { formula: `SUM(L${startN}:L${endN})` }
    ]);
    totN.height = 24;
    totN.eachCell((c) => {
      c.font = { bold: true, size: 9, color: { argb: 'FF0F172A' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      c.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
    });
    totN.getCell(2).alignment = { horizontal: 'center' };
    totN.getCell(10).alignment = { horizontal: 'right' };
    totN.getCell(11).numFmt = '#,##0.000 "kg"';
    totN.getCell(12).numFmt = '"R$" #,##0.00';
  }

  // Adjust widths for Sheet 2
  wsNfes.getColumn(1).width = 22;
  wsNfes.getColumn(2).width = 12;
  wsNfes.getColumn(3).width = 8;
  wsNfes.getColumn(4).width = 46;
  wsNfes.getColumn(5).width = 14;
  wsNfes.getColumn(6).width = 30;
  wsNfes.getColumn(7).width = 30;
  wsNfes.getColumn(8).width = 12;
  wsNfes.getColumn(9).width = 20;
  wsNfes.getColumn(10).width = 36;
  wsNfes.getColumn(11).width = 16;
  wsNfes.getColumn(12).width = 18;

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  generateExcelReport,
  generateNFeBatchExcel
};
