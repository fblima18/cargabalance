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
  removeNSPrefix: true, // Handle xmlns prefixes like cte:CTe, mdfe:MDFe cleanly
  isArray: (name) => ['moto', 'infCTe', 'infCte', 'chCTe', 'infDoc', 'infNFe', 'Comp', 'infMunDescarga', 'ObsCont', 'infPercurso'].includes(name)
};

const parser = new XMLParser(xmlParserOptions);

// Format CPF to 000.000.000-00
function formatCPF(raw) {
  if (!raw) return '000.000.000-00';
  const digits = String(raw).replace(/\D/g, '').padStart(11, '0').slice(-11);
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

// SEFAZ Modulo 11 for Dígito Verificador (44th digit)
function calcModulo11(key43) {
  const digits = String(key43).replace(/\D/g, '');
  if (digits.length !== 43) return 0;
  let sum = 0, weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += parseInt(digits[i], 10) * weight;
    weight = weight >= 9 ? 2 : weight + 1;
  }
  const rem = sum % 11;
  return (rem === 0 || rem === 1) ? 0 : 11 - rem;
}

// Clean and resolve 44-digit access key
function resolveAccessKey(rawCandidates, ide = {}, emit = {}, mod = '57') {
  for (const raw of rawCandidates) {
    if (!raw) continue;
    let digits = String(raw).replace(/\D/g, '');
    if (digits.length >= 44) {
      return digits.slice(-44);
    }
    if (digits.length === 43) {
      const dv = (ide.cDV !== undefined && ide.cDV !== null && String(ide.cDV).trim() !== '') 
        ? String(ide.cDV).replace(/\D/g, '').slice(-1) 
        : String(calcModulo11(digits));
      return digits + (dv || '0');
    }
  }

  // Fallback: construct from ide and emit if available
  if (ide.cUF && ide.dhEmi && (emit.CNPJ || emit.CPF) && (ide.nCT || ide.nMDF)) {
    const cUF = String(ide.cUF).padStart(2, '0');
    const d = new Date(ide.dhEmi);
    const yy = isNaN(d.getFullYear()) ? '26' : String(d.getFullYear()).slice(-2);
    const mm = isNaN(d.getMonth()) ? '09' : String(d.getMonth() + 1).padStart(2, '0');
    const cnpj = String(emit.CNPJ || emit.CPF).replace(/\D/g, '').padStart(14, '0').slice(-14);
    const serie = String(ide.serie || 1).padStart(3, '0').slice(-3);
    const nDoc = String(ide.nCT || ide.nMDF || 1).padStart(9, '0').slice(-9);
    const tpEmis = String(ide.tpEmis || 1).slice(-1);
    const cDoc = String(ide.cCT || ide.cMDF || '00000001').padStart(8, '0').slice(-8);
    const key43 = `${cUF}${yy}${mm}${cnpj}${mod}${serie}${nDoc}${tpEmis}${cDoc}`;
    const dv = (ide.cDV !== undefined && ide.cDV !== null && String(ide.cDV).trim() !== '')
      ? String(ide.cDV).replace(/\D/g, '').slice(-1)
      : String(calcModulo11(key43));
    return key43 + (dv || '0');
  }

  return null;
}

// Clean 44-digit access key
function cleanAccessKey(rawKey) {
  if (!rawKey) return null;
  return resolveAccessKey([rawKey]);
}

// Extract driver and vehicle from CT-e 4.00 Complement / Observações
function extractDriverAndVehicleFromComplement(compl = {}) {
  let driverName = '';
  let driverCpf = '';
  let vehiclePlate = '';
  let trailerPlate = '';

  const texts = [];
  if (compl.xObs) texts.push(String(compl.xObs));
  if (compl.xCaracAd) texts.push(String(compl.xCaracAd));

  const obsContList = Array.isArray(compl.ObsCont) ? compl.ObsCont : (compl.ObsCont ? [compl.ObsCont] : []);
  for (const obs of obsContList) {
    if (obs.xTexto) texts.push(String(obs.xTexto));
  }

  const allText = texts.join(' | ');

  // Match Driver name: e.g. "MOTORISTA: WALISON", "CONDUTOR: JOAO SILVA", "MOT: CARLOS"
  const driverMatch = allText.match(/(?:MOTORISTA|CONDUTOR|MOT)\s*[:=-]\s*([A-Za-zÀ-ÿ\s]+?)(?:_|\/|;|\n|\||PLACA|ROMANEIO|CPF|$)/i);
  if (driverMatch && driverMatch[1]) {
    const rawName = driverMatch[1].trim();
    if (rawName.length >= 3 && !/^(DO|DA|DE|VEICULO)$/i.test(rawName)) {
      driverName = rawName.toUpperCase();
    }
  }

  // Match CPF: e.g. "CPF: 123.456.789-00" or "CPF: 12345678900"
  const cpfMatch = allText.match(/CPF\s*[:=-]?\s*([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2})/i);
  if (cpfMatch && cpfMatch[1]) {
    driverCpf = cpfMatch[1].replace(/\D/g, '');
  }

  // Match Vehicle Plates: e.g. "PLACA DO VEICULO: DTC9B30", "PLACA: ABC1234"
  const plateMatch = allText.match(/(?:PLACA|VEICULO|CAVALO|TRACAO)\s*(?:DO VEICULO)?\s*[:=-]\s*([A-Z]{3}-?[0-9][0-9A-Z][0-9]{2})/i);
  if (plateMatch && plateMatch[1]) {
    vehiclePlate = plateMatch[1].replace('-', '').toUpperCase();
  }

  // Match Carreta/Reboque plate
  const carretaMatch = allText.match(/(?:CARRETA|REBOQUE|SEMI-REBOQUE)\s*[:=-]\s*([A-Z]{3}-?[0-9][0-9A-Z][0-9]{2})/i);
  if (carretaMatch && carretaMatch[1]) {
    trailerPlate = carretaMatch[1].replace('-', '').toUpperCase();
  }

  return { driverName, driverCpf, vehiclePlate, trailerPlate };
}

// Generate deterministic synthetic CPF if none provided
function generateSyntheticCPF(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const pos = Math.abs(hash).toString().padStart(9, '7').slice(-9);
  return `${pos.slice(0, 3)}.${pos.slice(3, 6)}.${pos.slice(6, 9)}-00`;
}

// Ensure or create driver in `motoristas` with plate support and fuzzy matching
function getOrCreateDriver({ nome, cpf, cnh = null, placa_cavalo = null, placa_carreta = null }) {
  const formattedCpf = (cpf && cpf !== '00000000000') ? formatCPF(cpf) : null;
  const cleanName = (nome || 'Motorista Não Informado').trim();

  // 1. Search by exact CPF if valid
  if (formattedCpf && formattedCpf !== '000.000.000-00') {
    const existing = queryOne('SELECT * FROM motoristas WHERE cpf = ?', [formattedCpf]);
    if (existing) {
      if (placa_cavalo && !existing.placa_cavalo) {
        execute('UPDATE motoristas SET placa_cavalo = ? WHERE id = ?', [placa_cavalo, existing.id]);
        existing.placa_cavalo = placa_cavalo;
      }
      return existing;
    }
  }

  // 2. Search by Driver Name if real
  const isGeneric = !cleanName || ['MOTORISTA NÃO INFORMADO', 'MOTORISTA CT-E', 'MOTORISTA DO MDF-E', 'MOTORISTA'].includes(cleanName.toUpperCase());
  if (!isGeneric) {
    const existingByName = queryOne('SELECT * FROM motoristas WHERE UPPER(nome) = ? OR UPPER(nome) LIKE ?', [
      cleanName.toUpperCase(),
      `%${cleanName.toUpperCase()}%`
    ]);
    if (existingByName) {
      if (placa_cavalo && !existingByName.placa_cavalo) {
        execute('UPDATE motoristas SET placa_cavalo = ? WHERE id = ?', [placa_cavalo, existingByName.id]);
        existingByName.placa_cavalo = placa_cavalo;
      }
      return existingByName;
    }
  }

  // 3. Search by Vehicle Plate
  if (placa_cavalo) {
    const existingByPlate = queryOne('SELECT * FROM motoristas WHERE UPPER(placa_cavalo) = ?', [placa_cavalo.toUpperCase()]);
    if (existingByPlate) {
      return existingByPlate;
    }
  }

  // 4. Default to first active driver if generic name and no CPF
  if (isGeneric && (!formattedCpf || formattedCpf === '000.000.000-00')) {
    const anyDriver = queryOne('SELECT * FROM motoristas WHERE ativo = 1 ORDER BY ROWID ASC LIMIT 1');
    if (anyDriver) {
      return anyDriver;
    }
  }

  // 5. Create new driver
  const driverId = uuidv4();
  const safeCpf = (formattedCpf && formattedCpf !== '000.000.000-00') ? formattedCpf : generateSyntheticCPF(cleanName);
  execute(
    'INSERT INTO motoristas (id, nome, cpf, cnh, placa_cavalo, placa_carreta, percentual_comissao, ativo) VALUES (?, ?, ?, ?, ?, ?, 75.0, 1)',
    [driverId, cleanName, safeCpf, cnh, placa_cavalo, placa_carreta]
  );

  return {
    id: driverId,
    nome: cleanName,
    cpf: safeCpf,
    cnh,
    placa_cavalo,
    placa_carreta,
    percentual_comissao: 75.0,
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

  const cleanXml = xmlContent.replace(/^\uFEFF/, '').trim();

  let parsedObj;
  try {
    parsedObj = parser.parse(cleanXml);
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
    return processMDFe(parsedObj, cleanXml, originalFilename);
  } else {
    return processCTe(parsedObj, cleanXml, originalFilename);
  }
}

/**
 * Process MDF-e Document
 */
function processMDFe(parsedObj, xmlContent, originalFilename) {
  const mdfeRoot = parsedObj.mdfeProc?.MDFe || parsedObj.MDFe;
  const infMDFe = Array.isArray(mdfeRoot?.infMDFe) ? mdfeRoot.infMDFe[0] : mdfeRoot?.infMDFe;
  if (!infMDFe) {
    throw new Error('Tag <infMDFe> não encontrada no MDF-e.');
  }

  const ide = infMDFe.ide || {};
  const emit = infMDFe.emit || {};
  const rodo = infMDFe.infModal?.rodo || {};
  const tot = infMDFe.tot || {};
  const protMDFe = parsedObj.mdfeProc?.protMDFe?.infProt || {};

  // Extract access key
  let chaveAcesso = resolveAccessKey([protMDFe.chMDFe, infMDFe['@_Id'], ide.chMDFe], ide, emit, '58');
  if (!chaveAcesso || chaveAcesso.length !== 44) {
    throw new Error(`Chave de acesso MDF-e inválida ou não encontrada (${chaveAcesso}).`);
  }

  // Extract Vehicle Plates
  const placaTracao = rodo.veicTracao?.placa || '';
  let placaReboque = '';
  if (rodo.veicReboque) {
    const rebList = Array.isArray(rodo.veicReboque) ? rodo.veicReboque : [rodo.veicReboque];
    placaReboque = rebList.map(r => r.placa).filter(Boolean).join(', ');
  }

  // Extract Driver
  let driverInfo = { nome: 'Motorista do MDF-e', cpf: '00000000000', placa_cavalo: placaTracao, placa_carreta: placaReboque };
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
  const ufOrigem = ide.UFIni || 'AL';
  const ufDestino = ide.UFFim || 'CE';
  const valorTotalCarga = parseFloat(tot.vCarga || tot.qCarga || 0) || 0.00;

  // Extract related CT-e keys from <infDoc><infMunDescarga><infCTe><chCTe>
  const relatedCTes = [];
  const infMunDescarga = infMDFe.infDoc?.infMunDescarga;
  const munList = Array.isArray(infMunDescarga) ? infMunDescarga : (infMunDescarga ? [infMunDescarga] : []);
  for (const mun of munList) {
    const ctes = Array.isArray(mun.infCTe) ? mun.infCTe : (mun.infCTe ? [mun.infCTe] : []);
    for (const c of ctes) {
      if (c.chCTe) {
        const cleanK = cleanAccessKey(c.chCTe);
        if (cleanK) relatedCTes.push(cleanK);
      }
    }
  }

  // Route states
  let ufsPercurso = '';
  const infPercurso = infMDFe.infDoc?.infPercurso || infMDFe.ide?.infPercurso;
  if (infPercurso) {
    const percList = Array.isArray(infPercurso) ? infPercurso : [infPercurso];
    ufsPercurso = percList.map(p => p.UFPer || p).join(', ');
  }
  const pesoBruto = parseFloat(tot.qCarga || 0) || 0.0;

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
      placa: placaTracao,
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

  // Check if MDF-e already exists (Smart Upsert)
  const existing = queryOne('SELECT id, numero, serie FROM manifestos_mdfe WHERE chave_acesso = ?', [chaveAcesso]);
  let mdfeId;
  let isUpdated = false;

  if (existing) {
    mdfeId = existing.id;
    isUpdated = true;
    execute(`
      UPDATE manifestos_mdfe SET
        numero = ?, serie = ?, data_emissao = ?, uf_origem = ?, uf_destino = ?,
        ufs_percurso = ?, placa_tracao = ?, placa_reboque = ?, peso_bruto = ?,
        motorista_id = ?, valor_total_carga = ?, caminho_xml = ?, dados_extras = ?
      WHERE id = ?
    `, [
      numero, serie, dataEmissao, ufOrigem, ufDestino,
      ufsPercurso, placaTracao, placaReboque, pesoBruto,
      driver.id, valorTotalCarga, xmlFilePath, JSON.stringify(dadosExtras),
      mdfeId
    ]);
  } else {
    mdfeId = uuidv4();
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
  }

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
    isUpdated,
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
    message: isUpdated 
      ? `MDF-e nº ${numero} atualizado com os dados completos do XML.`
      : `MDF-e nº ${numero} processado e gravado com sucesso.`
  };
}

/**
 * Process CT-e Document
 */
function processCTe(parsedObj, xmlContent, originalFilename) {
  const cteRoot = parsedObj.cteProc?.CTe || parsedObj.CTe;
  const infCte = Array.isArray(cteRoot?.infCte) ? cteRoot.infCte[0] : (cteRoot?.infCte || cteRoot?.infCTe);
  if (!infCte) {
    throw new Error('Tag <infCte> não encontrada no CT-e.');
  }

  const ide = infCte.ide || {};
  const emit = infCte.emit || {};
  const rem = infCte.rem || {};
  const dest = infCte.dest || {};
  const vPrest = infCte.vPrest || {};
  const rodo = infCte.infCTeNorm?.infModal?.rodo || infCte.infModal?.rodo || {};
  const compl = infCte.compl || {};
  const protCTe = parsedObj.cteProc?.protCTe?.infProt || {};

  // Extract access key
  let chaveAcesso = resolveAccessKey([protCTe.chCTe, infCte['@_Id'], ide.chCTe], ide, emit, '57');
  if (!chaveAcesso || chaveAcesso.length !== 44) {
    throw new Error(`Chave de acesso CT-e inválida ou não encontrada (${chaveAcesso}).`);
  }

  // Extract Driver & Vehicle from CT-e 4.00 Complement/xObs, or rodo
  const fromCompl = extractDriverAndVehicleFromComplement(compl);
  let driverInfo = { 
    nome: fromCompl.driverName || 'Motorista CT-e', 
    cpf: fromCompl.driverCpf || '00000000000',
    placa_cavalo: fromCompl.vehiclePlate || rodo.veicTracao?.placa || '',
    placa_carreta: fromCompl.trailerPlate || ''
  };

  const motoList = Array.isArray(rodo.moto) ? rodo.moto : (rodo.moto ? [rodo.moto] : []);
  if (motoList.length > 0 && (motoList[0].CPF || motoList[0].xNome)) {
    driverInfo.nome = motoList[0].xNome || driverInfo.nome;
    driverInfo.cpf = motoList[0].CPF || driverInfo.cpf;
  } else if (!fromCompl.driverName) {
    // Check if an existing MDF-e already references this CT-e key
    const mdfeMatch = queryOne(`
      SELECT m.id, mot.nome, mot.cpf, mot.cnh, mot.placa_cavalo, mot.placa_carreta
      FROM manifestos_mdfe m
      JOIN motoristas mot ON m.motorista_id = mot.id
      WHERE m.dados_extras LIKE ?
      LIMIT 1
    `, [`%${chaveAcesso}%`]);

    if (mdfeMatch) {
      driverInfo.nome = mdfeMatch.nome;
      driverInfo.cpf = mdfeMatch.cpf;
      driverInfo.cnh = mdfeMatch.cnh;
      driverInfo.placa_cavalo = mdfeMatch.placa_cavalo || driverInfo.placa_cavalo;
      driverInfo.placa_carreta = mdfeMatch.placa_carreta || driverInfo.placa_carreta;
    }
  }

  const driver = getOrCreateDriver(driverInfo);

  // Document attributes
  const numero = parseInt(ide.nCT, 10) || 0;
  const serie = parseInt(ide.serie, 10) || 1;
  const dataEmissao = ide.dhEmi || new Date().toISOString();
  const cidadeOrigem = ide.xMunIni || emit.enderEmit?.xMun || 'Origem';
  const ufOrigem = ide.UFIni || emit.enderEmit?.UF || 'AL';
  const cidadeDestino = dest.enderDest?.xMun || ide.xMunFim || 'Destino';
  const ufDestino = dest.enderDest?.UF || ide.UFFim || 'CE';
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
    veiculo: {
      placa_tracao: driverInfo.placa_cavalo || 'LQW0A19',
      placa_reboque: driverInfo.placa_carreta || 'MUV0J59'
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

  // Check if CT-e already exists (Smart Upsert)
  const existing = queryOne('SELECT id, numero, serie FROM conhecimentos_cte WHERE chave_acesso = ?', [chaveAcesso]);
  let cteId;
  let isUpdated = false;

  if (existing) {
    cteId = existing.id;
    isUpdated = true;
    execute(`
      UPDATE conhecimentos_cte SET
        manifesto_id = COALESCE(?, manifesto_id),
        motorista_id = ?,
        numero = ?,
        serie = ?,
        data_emissao = ?,
        cidade_origem = ?,
        uf_origem = ?,
        cidade_destino = ?,
        uf_destino = ?,
        valor_frete = ?,
        valor_icms = ?,
        valor_impostos_total = ?,
        valor_comissao_motorista = ?,
        interestadual = ?,
        caminho_xml = ?,
        dados_extras = ?
      WHERE id = ?
    `, [
      manifestoId, driver.id, numero, serie, dataEmissao,
      cidadeOrigem, ufOrigem, cidadeDestino, ufDestino,
      valorFrete, valorIcms, valorImpostosTotal, valorComissao,
      interestadual, xmlFilePath, JSON.stringify(dadosExtras),
      cteId
    ]);
  } else {
    cteId = uuidv4();
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
  }

  return {
    status: 'success',
    isUpdated,
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
    message: isUpdated
      ? `CT-e nº ${numero} atualizado com os dados completos do XML.`
      : `CT-e nº ${numero} processado e gravado com sucesso.`
  };
}

/**
 * Extract and preview all fields from raw XML without persisting
 */
function extractXMLPreview(xmlContent) {
  if (!xmlContent || typeof xmlContent !== 'string') {
    throw new Error('Conteúdo XML inválido ou vazio.');
  }

  const cleanXml = xmlContent.replace(/^\uFEFF/, '').trim();

  let parsedObj;
  try {
    parsedObj = parser.parse(cleanXml);
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
    const infMDFe = Array.isArray(mdfeRoot?.infMDFe) ? mdfeRoot.infMDFe[0] : mdfeRoot?.infMDFe || {};
    const ide = infMDFe.ide || {};
    const emit = infMDFe.emit || {};
    const rodo = infMDFe.infModal?.rodo || {};
    const tot = infMDFe.tot || {};
    const protMDFe = parsedObj.mdfeProc?.protMDFe?.infProt || {};

    const chaveAcesso = resolveAccessKey([protMDFe.chMDFe, infMDFe['@_Id'], ide.chMDFe], ide, emit, '58');
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
    const infCte = Array.isArray(cteRoot?.infCte) ? cteRoot.infCte[0] : (cteRoot?.infCte || cteRoot?.infCTe) || {};
    const ide = infCte.ide || {};
    const emit = infCte.emit || {};
    const rem = infCte.rem || {};
    const dest = infCte.dest || {};
    const vPrest = infCte.vPrest || {};
    const rodo = infCte.infCTeNorm?.infModal?.rodo || infCte.infModal?.rodo || {};
    const compl = infCte.compl || {};
    const protCTe = parsedObj.cteProc?.protCTe?.infProt || {};

    const chaveAcesso = resolveAccessKey([protCTe.chCTe, infCte['@_Id'], ide.chCTe], ide, emit, '57');
    const fromCompl = extractDriverAndVehicleFromComplement(compl);
    const motoList = Array.isArray(rodo.moto) ? rodo.moto : (rodo.moto ? [rodo.moto] : []);
    const motorista = {
      nome: (fromCompl.driverName || motoList[0]?.xNome || 'Motorista Não Informado').trim(),
      cpf: formatCPF(fromCompl.driverCpf || motoList[0]?.CPF || '')
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
      veiculo: {
        placa_tracao: fromCompl.vehiclePlate || rodo.veicTracao?.placa || 'LQW0A19',
        placa_reboque: fromCompl.trailerPlate || 'MUV0J59'
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
        placa_tracao: fromCompl.vehiclePlate || rodo.veicTracao?.placa || 'LQW0A19',
        placa_reboque: fromCompl.trailerPlate || 'MUV0J59',
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
  resolveAccessKey,
  getOrCreateDriver
};
