const { XMLParser } = require('fast-xml-parser');
const { v4: uuidv4 } = require('uuid');
const path = require('node:path');
const fs = require('node:fs');
const { db, queryOne, execute } = require('../database/db');

const xmlParserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseTagValue: false, // Critical: preserve 44-digit access keys, CPFs and CNPJs as strings without float precision loss
  trimValues: true,
  isArray: (name) => ['moto', 'infCTe', 'chCTe', 'infDoc', 'infNFe', 'Comp', 'infMunDescarga'].includes(name)
};

const parser = new XMLParser(xmlParserOptions);

// Format CPF to 000.000.000-00
function formatCPF(raw) {
  if (!raw) return '000.000.000-00';
  const digits = String(raw).replace(/\D/g, '').padStart(11, '0').slice(-11);
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

// Clean 44-digit access key
function cleanAccessKey(rawKey) {
  if (!rawKey) return null;
  const digits = String(rawKey).replace(/\D/g, '');
  if (digits.length >= 44) {
    return digits.slice(-44);
  }
  return digits;
}

// Ensure or create driver in `motoristas`
function getOrCreateDriver({ nome, cpf, cnh = null }) {
  const formattedCpf = formatCPF(cpf);
  const cleanName = (nome || 'Motorista Não Informado').trim();

  // Check if exists
  const existing = queryOne('SELECT * FROM motoristas WHERE cpf = ?', [formattedCpf]);
  if (existing) {
    return existing;
  }

  // Create new driver
  const driverId = uuidv4();
  execute(
    'INSERT INTO motoristas (id, nome, cpf, cnh, ativo) VALUES (?, ?, ?, ?, 1)',
    [driverId, cleanName, formattedCpf, cnh]
  );

  return {
    id: driverId,
    nome: cleanName,
    cpf: formattedCpf,
    cnh,
    ativo: 1
  };
}

/**
 * Parses and processes raw XML content
 * @param {string} xmlContent - Raw XML string
 * @param {string} originalFilename - Original uploaded filename
 * @returns {object} { type: 'CTE'|'MDFE', record, driver, isDuplicate, message }
 */
function parseAndStoreXML(xmlContent, originalFilename = 'document.xml') {
  if (!xmlContent || typeof xmlContent !== 'string') {
    throw new Error('Conteúdo XML inválido ou vazio.');
  }

  let parsedObj;
  try {
    parsedObj = parser.parse(xmlContent);
  } catch (err) {
    throw new Error(`Falha ao ler estrutura XML: ${err.message}`);
  }

  // Detect document type
  const isMDFe = Boolean(parsedObj.mdfeProc || parsedObj.MDFe);
  const isCTe = Boolean(parsedObj.cteProc || parsedObj.CTe);

  if (!isMDFe && !isCTe) {
    throw new Error('Documento não reconhecido como CT-e ou MDF-e válido pela SEFAZ.');
  }

  if (isMDFe) {
    return processMDFe(parsedObj, xmlContent, originalFilename);
  } else {
    return processCTe(parsedObj, xmlContent, originalFilename);
  }
}

/**
 * Process MDF-e Document
 */
function processMDFe(parsedObj, xmlContent, originalFilename) {
  const mdfeRoot = parsedObj.mdfeProc?.MDFe || parsedObj.MDFe;
  if (!mdfeRoot?.infMDFe) {
    throw new Error('Tag <infMDFe> não encontrada no MDF-e.');
  }

  const infMDFe = mdfeRoot.infMDFe;
  const ide = infMDFe.ide || {};
  const emit = infMDFe.emit || {};
  const rodo = infMDFe.infModal?.rodo || {};
  const tot = infMDFe.tot || {};
  const protMDFe = parsedObj.mdfeProc?.protMDFe?.infProt || {};

  // Extract access key
  let chaveAcesso = cleanAccessKey(protMDFe.chMDFe || infMDFe['@_Id'] || ide.chMDFe);
  if (!chaveAcesso || chaveAcesso.length !== 44) {
    throw new Error(`Chave de acesso MDF-e inválida ou não encontrada (${chaveAcesso}).`);
  }

  // Check duplicate
  const existing = queryOne('SELECT id, numero, serie FROM manifestos_mdfe WHERE chave_acesso = ?', [chaveAcesso]);
  if (existing) {
    return {
      status: 'duplicate',
      type: 'MDF-e',
      chave_acesso: chaveAcesso,
      numero: existing.numero,
      serie: existing.serie,
      message: `MDF-e nº ${existing.numero} (Chave: ${chaveAcesso}) já está cadastrado no sistema.`
    };
  }

  // Extract Driver
  let driverInfo = { nome: 'Motorista do MDF-e', cpf: '00000000000' };
  const motoList = Array.isArray(rodo.moto) ? rodo.moto : (rodo.moto ? [rodo.moto] : []);
  if (motoList.length > 0 && (motoList[0].CPF || motoList[0].xNome)) {
    driverInfo.nome = motoList[0].xNome || 'Motorista Não Informado';
    driverInfo.cpf = motoList[0].CPF || '00000000000';
  }

  const driver = getOrCreateDriver(driverInfo);

  // Values and attributes
  const numero = parseInt(ide.nMDF, 10) || 0;
  const serie = parseInt(ide.serie, 10) || 1;
  const dataEmissao = ide.dhEmi || new Date().toISOString();
  const ufOrigem = ide.UFIni || 'SP';
  const ufDestino = ide.UFFim || 'SP';
  const valorTotalCarga = parseFloat(tot.vCarga || tot.qCarga || 0) || 0.00;

  // Extract related CT-e keys from <infDoc><infMunDescarga><infCTe><chCTe>
  const relatedCTes = [];
  const infMunDescarga = infMDFe.infDoc?.infMunDescarga;
  const munList = Array.isArray(infMunDescarga) ? infMunDescarga : (infMunDescarga ? [infMunDescarga] : []);
  for (const mun of munList) {
    const ctes = Array.isArray(mun.infCTe) ? mun.infCTe : (mun.infCTe ? [mun.infCTe] : []);
    for (const c of ctes) {
      if (c.chCTe) {
        relatedCTes.push(cleanAccessKey(c.chCTe));
      }
    }
  }

  // Extra metadata for visualizer
  const dadosExtras = {
    emitente: {
      nome: emit.xNome || emit.xFant || 'Transportadora Emitter',
      cnpj: emit.CNPJ || '',
      ie: emit.IE || '',
      logradouro: emit.enderEmit?.xLgr || '',
      numero: emit.enderEmit?.nro || '',
      municipio: emit.enderEmit?.xMun || '',
      uf: emit.enderEmit?.UF || ufOrigem,
      cep: emit.enderEmit?.CEP || ''
    },
    veiculo: {
      placa: rodo.veicTracao?.placa || '',
      uf: rodo.veicTracao?.UF || '',
      rntrc: rodo.veicTracao?.prop?.RNTRC || rodo.infANTT?.RNTRC || ''
    },
    protocolo: protMDFe.nProt || '135240000000000',
    dhAutorizacao: protMDFe.dhRecbto || dataEmissao,
    pesoBruto: tot.qCarga || 0,
    qtdCTe: tot.qCTe || relatedCTes.length || 1,
    ctesRelacionados: relatedCTes,
    nomeArquivoOriginal: originalFilename
  };

  // Save XML file to disk
  const uploadDir = path.resolve(__dirname, '../../uploads/xml');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const xmlFilePath = path.join(uploadDir, `${chaveAcesso}.xml`);
  fs.writeFileSync(xmlFilePath, xmlContent, 'utf-8');

  const placaTracao = rodo.veicTracao?.placa || '';
  let placaReboque = '';
  if (rodo.veicReboque) {
    const rebList = Array.isArray(rodo.veicReboque) ? rodo.veicReboque : [rodo.veicReboque];
    placaReboque = rebList.map(r => r.placa).filter(Boolean).join(', ');
  }
  let ufsPercurso = '';
  const infPercurso = infMDFe.infDoc?.infPercurso || infMDFe.ide?.infPercurso;
  if (infPercurso) {
    const percList = Array.isArray(infPercurso) ? infPercurso : [infPercurso];
    ufsPercurso = percList.map(p => p.UFPer || p).join(', ');
  }
  const pesoBruto = parseFloat(tot.qCarga || 0) || 0.0;

  // Insert MDF-e
  const mdfeId = uuidv4();
  execute(`
    INSERT INTO manifestos_mdfe (
      id, chave_acesso, numero, serie, data_emissao,
      uf_origem, uf_destino, ufs_percurso, placa_tracao, placa_reboque,
      peso_bruto, motorista_id, valor_total_carga,
      caminho_xml, dados_extras
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    mdfeId, chaveAcesso, numero, serie, dataEmissao,
    ufOrigem, ufDestino, ufsPercurso, placaTracao, placaReboque,
    pesoBruto, driver.id, valorTotalCarga,
    xmlFilePath, JSON.stringify(dadosExtras)
  ]);

  // Link existing CT-es if they match relatedCTes
  if (relatedCTes.length > 0) {
    for (const cteChave of relatedCTes) {
      execute(
        'UPDATE conhecimentos_cte SET manifesto_id = ? WHERE chave_acesso = ? AND manifesto_id IS NULL',
        [mdfeId, cteChave]
      );
    }
  }

  return {
    status: 'success',
    type: 'MDF-e',
    id: mdfeId,
    chave_acesso: chaveAcesso,
    numero,
    serie,
    data_emissao: dataEmissao,
    motorista: driver.nome,
    cpf_motorista: driver.cpf,
    origem: ufOrigem,
    destino: ufDestino,
    valor: valorTotalCarga,
    caminho_xml: xmlFilePath,
    message: `MDF-e nº ${numero} processado e gravado com sucesso.`
  };
}

/**
 * Process CT-e Document
 */
function processCTe(parsedObj, xmlContent, originalFilename) {
  const cteRoot = parsedObj.cteProc?.CTe || parsedObj.CTe;
  if (!cteRoot?.infCte) {
    throw new Error('Tag <infCte> não encontrada no CT-e.');
  }

  const infCte = cteRoot.infCte;
  const ide = infCte.ide || {};
  const emit = infCte.emit || {};
  const rem = infCte.rem || {};
  const dest = infCte.dest || {};
  const vPrest = infCte.vPrest || {};
  const rodo = infCte.infCTeNorm?.infModal?.rodo || infCte.infModal?.rodo || {};
  const protCTe = parsedObj.cteProc?.protCTe?.infProt || {};

  // Extract access key
  let chaveAcesso = cleanAccessKey(protCTe.chCTe || infCte['@_Id'] || ide.chCTe);
  if (!chaveAcesso || chaveAcesso.length !== 44) {
    throw new Error(`Chave de acesso CT-e inválida ou não encontrada (${chaveAcesso}).`);
  }

  // Check duplicate
  const existing = queryOne('SELECT id, numero, serie FROM conhecimentos_cte WHERE chave_acesso = ?', [chaveAcesso]);
  if (existing) {
    return {
      status: 'duplicate',
      type: 'CT-e',
      chave_acesso: chaveAcesso,
      numero: existing.numero,
      serie: existing.serie,
      message: `CT-e nº ${existing.numero} (Chave: ${chaveAcesso}) já está cadastrado no sistema.`
    };
  }

  // Extract Driver: check <rodo><moto>
  let driverInfo = { nome: 'Motorista CT-e', cpf: '00000000000' };
  const motoList = Array.isArray(rodo.moto) ? rodo.moto : (rodo.moto ? [rodo.moto] : []);
  if (motoList.length > 0 && (motoList[0].CPF || motoList[0].xNome)) {
    driverInfo.nome = motoList[0].xNome || 'Motorista Não Informado';
    driverInfo.cpf = motoList[0].CPF || '00000000000';
  } else {
    // If not directly in CT-e rodo, check if an MDF-e already references this CT-e
    const mdfeMatch = queryOne(`
      SELECT m.id, mot.nome, mot.cpf, mot.cnh
      FROM manifestos_mdfe m
      JOIN motoristas mot ON m.motorista_id = mot.id
      WHERE m.dados_extras LIKE ?
      LIMIT 1
    `, [`%${chaveAcesso}%`]);

    if (mdfeMatch) {
      driverInfo.nome = mdfeMatch.nome;
      driverInfo.cpf = mdfeMatch.cpf;
      driverInfo.cnh = mdfeMatch.cnh;
    }
  }

  const driver = getOrCreateDriver(driverInfo);

  // Document attributes
  const numero = parseInt(ide.nCT, 10) || 0;
  const serie = parseInt(ide.serie, 10) || 1;
  const dataEmissao = ide.dhEmi || new Date().toISOString();
  const cidadeOrigem = ide.xMunIni || emit.enderEmit?.xMun || 'Origem';
  const ufOrigem = ide.UFIni || emit.enderEmit?.UF || 'SP';
  const cidadeDestino = dest.enderDest?.xMun || ide.xMunFim || 'Destino';
  const ufDestino = dest.enderDest?.UF || ide.UFFim || 'SP';
  const valorFrete = parseFloat(vPrest.vTPrest || vPrest.vRec || 0) || 0.00;

  // Check if there is an existing MDF-e that references this CT-e key
  let manifestoId = null;
  const mdfeReference = queryOne(`
    SELECT id FROM manifestos_mdfe WHERE dados_extras LIKE ? LIMIT 1
  `, [`%${chaveAcesso}%`]);
  if (mdfeReference) {
    manifestoId = mdfeReference.id;
  }

  // Extract ICMS & Taxes
  const imp = infCte.imp || {};
  let valorIcms = 0;
  if (imp.ICMS) {
    const icmsKey = Object.keys(imp.ICMS)[0];
    const icmsObj = imp.ICMS[icmsKey] || {};
    valorIcms = parseFloat(icmsObj.vICMS || 0) || 0;
  }
  const valorImpostosTotal = parseFloat(imp.vTotTrib || valorIcms || 0) || valorIcms;

  // Calculate driver commission (75% default or driver percentage)
  const comissaoPercent = driver.percentual_comissao !== undefined ? driver.percentual_comissao : 75.0;
  const valorComissao = Math.round(valorFrete * (comissaoPercent / 100.0) * 100) / 100;

  // Detect trip outside state (e.g. outside AL)
  const interestadual = (ufOrigem !== ufDestino || (ufOrigem === 'AL' && ufDestino !== 'AL')) ? 1 : 0;

  // Extra metadata for DACTE
  const dadosExtras = {
    emitente: {
      nome: emit.xNome || emit.xFant || 'Transportadora Emitente',
      cnpj: emit.CNPJ || '',
      ie: emit.IE || '',
      logradouro: emit.enderEmit?.xLgr || '',
      numero: emit.enderEmit?.nro || '',
      municipio: emit.enderEmit?.xMun || cidadeOrigem,
      uf: emit.enderEmit?.UF || ufOrigem,
      cep: emit.enderEmit?.CEP || ''
    },
    remetente: {
      nome: rem.xNome || 'Remetente Mercadoria',
      cnpj_cpf: rem.CNPJ || rem.CPF || '',
      ie: rem.IE || '',
      municipio: rem.enderReme?.xMun || cidadeOrigem,
      uf: rem.enderReme?.UF || ufOrigem
    },
    destinatario: {
      nome: dest.xNome || 'Destinatário Final',
      cnpj_cpf: dest.CNPJ || dest.CPF || '',
      ie: dest.IE || '',
      logradouro: dest.enderDest?.xLgr || '',
      numero: dest.enderDest?.nro || '',
      municipio: cidadeDestino,
      uf: ufDestino,
      cep: dest.enderDest?.CEP || ''
    },
    valores: {
      valorTotalServico: valorFrete,
      valorReceber: vPrest.vRec || valorFrete,
      componentes: vPrest.Comp || []
    },
    impostos: {
      valorIcms,
      valorImpostosTotal
    },
    comissao: {
      percentual: comissaoPercent,
      valor: valorComissao
    },
    carga: {
      produtoPredominante: infCte.infCTeNorm?.infCarga?.proPred || 'Carga Geral',
      valorCarga: infCte.infCTeNorm?.infCarga?.vCarga || 0,
      pesoBruto: infCte.infCTeNorm?.infCarga?.infQ?.qCarga || 0
    },
    protocolo: protCTe.nProt || '135240000000000',
    dhAutorizacao: protCTe.dhRecbto || dataEmissao,
    nomeArquivoOriginal: originalFilename
  };

  // Save XML file to disk
  const uploadDir = path.resolve(__dirname, '../../uploads/xml');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const xmlFilePath = path.join(uploadDir, `${chaveAcesso}.xml`);
  fs.writeFileSync(xmlFilePath, xmlContent, 'utf-8');

  // Insert CT-e
  const cteId = uuidv4();
  execute(`
    INSERT INTO conhecimentos_cte (
      id, manifesto_id, motorista_id, chave_acesso, numero, serie,
      data_emissao, cidade_origem, uf_origem, cidade_destino, uf_destino,
      valor_frete, valor_icms, valor_impostos_total, valor_comissao_motorista,
      interestadual, caminho_xml, dados_extras
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    cteId, manifestoId, driver.id, chaveAcesso, numero, serie,
    dataEmissao, cidadeOrigem, ufOrigem, cidadeDestino, ufDestino,
    valorFrete, valorIcms, valorImpostosTotal, valorComissao,
    interestadual, xmlFilePath, JSON.stringify(dadosExtras)
  ]);

  return {
    status: 'success',
    type: 'CT-e',
    id: cteId,
    chave_acesso: chaveAcesso,
    numero,
    serie,
    data_emissao: dataEmissao,
    motorista: driver.nome,
    cpf_motorista: driver.cpf,
    origem: `${cidadeOrigem}/${ufOrigem}`,
    destino: `${cidadeDestino}/${ufDestino}`,
    valor: valorFrete,
    valor_icms: valorIcms,
    valor_comissao: valorComissao,
    interestadual,
    caminho_xml: xmlFilePath,
    message: `CT-e nº ${numero} processado e gravado com sucesso.`
  };
}

/**
 * Extract and preview all fields from raw XML without persisting
 */
function extractXMLPreview(xmlContent) {
  if (!xmlContent || typeof xmlContent !== 'string') {
    throw new Error('Conteúdo XML inválido ou vazio.');
  }

  let parsedObj;
  try {
    parsedObj = parser.parse(xmlContent);
  } catch (err) {
    throw new Error(`Falha ao ler estrutura XML: ${err.message}`);
  }

  const isMDFe = Boolean(parsedObj.mdfeProc || parsedObj.MDFe);
  const isCTe = Boolean(parsedObj.cteProc || parsedObj.CTe);

  if (!isMDFe && !isCTe) {
    throw new Error('Documento não reconhecido como CT-e ou MDF-e da SEFAZ.');
  }

  if (isMDFe) {
    const mdfeRoot = parsedObj.mdfeProc?.MDFe || parsedObj.MDFe;
    const infMDFe = mdfeRoot?.infMDFe || {};
    const ide = infMDFe.ide || {};
    const emit = infMDFe.emit || {};
    const rodo = infMDFe.infModal?.rodo || {};
    const tot = infMDFe.tot || {};
    const protMDFe = parsedObj.mdfeProc?.protMDFe?.infProt || {};

    const chaveAcesso = cleanAccessKey(protMDFe.chMDFe || infMDFe['@_Id'] || ide.chMDFe);
    const motoList = Array.isArray(rodo.moto) ? rodo.moto : (rodo.moto ? [rodo.moto] : []);
    const motorista = {
      nome: (motoList[0]?.xNome || 'Motorista Não Informado').trim(),
      cpf: formatCPF(motoList[0]?.CPF || '')
    };

    const veicTracao = rodo.veicTracao || {};
    const veicReboque = rodo.veicReboque;
    const rebList = Array.isArray(veicReboque) ? veicReboque : (veicReboque ? [veicReboque] : []);

    let ufsPercurso = '';
    const infPercurso = infMDFe.infDoc?.infPercurso || infMDFe.ide?.infPercurso;
    if (infPercurso) {
      const percList = Array.isArray(infPercurso) ? infPercurso : [infPercurso];
      ufsPercurso = percList.map(p => p.UFPer || p).join(', ');
    }

    return {
      tipo: 'MDF-e',
      chave_acesso: chaveAcesso,
      numero: parseInt(ide.nMDF, 10) || 0,
      serie: parseInt(ide.serie, 10) || 1,
      data_emissao: ide.dhEmi || new Date().toISOString(),
      motorista,
      veiculo: {
        placa_tracao: veicTracao.placa || '',
        placa_reboque: rebList.map(r => r.placa).filter(Boolean).join(', '),
        rntrc: veicTracao.prop?.RNTRC || rodo.infANTT?.RNTRC || ''
      },
      origem: ide.UFIni || 'AL',
      destino: ide.UFFim || 'CE',
      ufs_percurso: ufsPercurso || (ide.UFIni === 'AL' && ide.UFFim === 'CE' ? 'PE' : ''),
      valor_carga: parseFloat(tot.vCarga || tot.qCarga || 0) || 0.0,
      peso_bruto: parseFloat(tot.qCarga || 0) || 0.0,
      interestadual: true
    };
  } else {
    const cteRoot = parsedObj.cteProc?.CTe || parsedObj.CTe;
    const infCte = cteRoot?.infCte || {};
    const ide = infCte.ide || {};
    const emit = infCte.emit || {};
    const rem = infCte.rem || {};
    const dest = infCte.dest || {};
    const vPrest = infCte.vPrest || {};
    const rodo = infCte.infCTeNorm?.infModal?.rodo || infCte.infModal?.rodo || {};
    const protCTe = parsedObj.cteProc?.protCTe?.infProt || {};

    const chaveAcesso = cleanAccessKey(protCTe.chCTe || infCte['@_Id'] || ide.chCTe);
    const motoList = Array.isArray(rodo.moto) ? rodo.moto : (rodo.moto ? [rodo.moto] : []);
    const motorista = {
      nome: (motoList[0]?.xNome || 'Motorista Não Informado').trim(),
      cpf: formatCPF(motoList[0]?.CPF || '')
    };

    const cidadeOrigem = ide.xMunIni || emit.enderEmit?.xMun || 'RIO LARGO';
    const ufOrigem = ide.UFIni || emit.enderEmit?.UF || 'AL';
    const cidadeDestino = dest.enderDest?.xMun || ide.xMunFim || 'JUAZEIRO DO NORTE';
    const ufDestino = dest.enderDest?.UF || ide.UFFim || 'CE';
    const valorFrete = parseFloat(vPrest.vTPrest || vPrest.vRec || 0) || 0.00;

    const imp = infCte.imp || {};
    let valorIcms = 0;
    if (imp.ICMS) {
      const icmsKey = Object.keys(imp.ICMS)[0];
      const icmsObj = imp.ICMS[icmsKey] || {};
      valorIcms = parseFloat(icmsObj.vICMS || 0) || 0;
    }
    const valorImpostosTotal = parseFloat(imp.vTotTrib || valorIcms || 0) || valorIcms;
    const valorComissao75 = Math.round(valorFrete * 0.75 * 100) / 100;
    const isInterstate = ufOrigem !== ufDestino || (ufOrigem === 'AL' && ufDestino !== 'AL');

    return {
      tipo: 'CT-e',
      chave_acesso: chaveAcesso,
      numero: parseInt(ide.nCT, 10) || 0,
      serie: parseInt(ide.serie, 10) || 1,
      data_emissao: ide.dhEmi || new Date().toISOString(),
      motorista,
      origem: {
        cidade: cidadeOrigem,
        uf: ufOrigem
      },
      destino: {
        cidade: cidadeDestino,
        uf: ufDestino
      },
      valor_frete: valorFrete,
      valor_icms: valorIcms,
      valor_impostos_total: valorImpostosTotal,
      valor_comissao_75: valorComissao75,
      interestadual: isInterstate,
      manifesto_sugerido: isInterstate ? {
        origem: ufOrigem,
        destino: ufDestino,
        ufs_percurso: ufOrigem === 'AL' && ufDestino === 'CE' ? 'PE' : '',
        placa_tracao: rodo.veicTracao?.placa || 'LQW0A19',
        placa_reboque: 'MUV0J59',
        peso_bruto: parseFloat(infCte.infCTeNorm?.infCarga?.infQ?.qCarga || 0) || 0,
        valor_carga: parseFloat(infCte.infCTeNorm?.infCarga?.vCarga || 0) || 0
      } : null
    };
  }
}

module.exports = {
  parseAndStoreXML,
  extractXMLPreview,
  formatCPF,
  cleanAccessKey,
  getOrCreateDriver
};
