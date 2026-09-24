const { XMLParser } = require('fast-xml-parser');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database/db');

/**
 * Service for Processing, Ingesting and Routing NF-e XML Files (Mod. 55)
 * For Streamlining and Automating CT-e (Conhecimento de Transporte Eletrônico) Issuance
 */

const xmlParserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseTagValue: false, // Keep CPFs, CNPJs and keys as strings without precision loss
  trimValues: true,
  removeNSPrefix: true,
  isArray: (name) => ['det', 'vol', 'dup', 'reboque'].includes(name)
};

const parser = new XMLParser(xmlParserOptions);

// Format CPF: 000.000.000-00
function formatCPF(raw) {
  if (!raw) return '-';
  const digits = String(raw).replace(/\D/g, '').padStart(11, '0').slice(-11);
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

// Format CNPJ: 00.000.000/0000-00
function formatCNPJ(raw) {
  if (!raw) return '-';
  const digits = String(raw).replace(/\D/g, '').padStart(14, '0').slice(-14);
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

// Normalize city strings for matching (removes accents, trim, uppercase)
function normalizeCity(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

/**
 * Seed Default Corporate Branches (CARAJAS Hubs in Northeast)
 */
function seedDefaultBranches() {
  try {
    const existing = queryOne('SELECT COUNT(*) AS total FROM filiais_empresa');
    if (existing && existing.total > 0) return;

    const defaultBranches = [
      {
        id: 'carajas-matriz-cd-al',
        empresa_grupo: 'CARAJAS',
        nome_filial: 'CARAJAS MATERIAL DE CONSTRUCAO LTDA - MATRIZ / CD RIO LARGO',
        cnpj: '03.656.804/0001-31',
        inscricao_estadual: '240.012.345',
        cidade: 'Rio Largo',
        uf: 'AL',
        logradouro: 'Rodovia BR-104, Km 90, s/n',
        bairro: 'Mata do Rolo',
        cep: '57100-000',
        telefone: '(82) 3215-9000'
      },
      {
        id: 'carajas-filial-maceio-mangabeiras',
        empresa_grupo: 'CARAJAS',
        nome_filial: 'CARAJAS MATERIAL DE CONSTRUCAO LTDA - MACEIO MANGABEIRAS',
        cnpj: '03.656.804/0002-12',
        inscricao_estadual: '240.098.765',
        cidade: 'Maceió',
        uf: 'AL',
        logradouro: 'Av. Comendador Gustavo Paiva, 2990',
        bairro: 'Mangabeiras',
        cep: '57038-000',
        telefone: '(82) 3215-9010'
      },
      {
        id: 'carajas-filial-arapiraca',
        empresa_grupo: 'CARAJAS',
        nome_filial: 'CARAJAS MATERIAL DE CONSTRUCAO LTDA - ARAPIRACA',
        cnpj: '03.656.804/0003-01',
        inscricao_estadual: '241.112.233',
        cidade: 'Arapiraca',
        uf: 'AL',
        logradouro: 'Rodovia AL-220, s/n',
        bairro: 'Planalto',
        cep: '57308-000',
        telefone: '(82) 3521-8800'
      },
      {
        id: 'carajas-filial-cabedelo',
        empresa_grupo: 'CARAJAS',
        nome_filial: 'CARAJAS MATERIAL DE CONSTRUCAO LTDA - JOAO PESSOA / CABEDELO',
        cnpj: '03.656.804/0004-84',
        inscricao_estadual: '161.456.789',
        cidade: 'Cabedelo',
        uf: 'PB',
        logradouro: 'Rodovia BR-230, Km 10',
        bairro: 'Intermares',
        cep: '58102-000',
        telefone: '(83) 3044-7700'
      },
      {
        id: 'carajas-filial-campina-grande',
        empresa_grupo: 'CARAJAS',
        nome_filial: 'CARAJAS MATERIAL DE CONSTRUCAO LTDA - CAMPINA GRANDE',
        cnpj: '03.656.804/0005-65',
        inscricao_estadual: '162.789.012',
        cidade: 'Campina Grande',
        uf: 'PB',
        logradouro: 'Av. Argemiro de Figueiredo, 1500',
        bairro: 'Itararé',
        cep: '58411-020',
        telefone: '(83) 3333-5500'
      },
      {
        id: 'carajas-filial-natal',
        empresa_grupo: 'CARAJAS',
        nome_filial: 'CARAJAS MATERIAL DE CONSTRUCAO LTDA - NATAL',
        cnpj: '03.656.804/0006-46',
        inscricao_estadual: '200.345.678',
        cidade: 'Natal',
        uf: 'RN',
        logradouro: 'Av. Engenheiro Roberto Freire, 3000',
        bairro: 'Capim Macio',
        cep: '59082-000',
        telefone: '(84) 3642-1200'
      },
      {
        id: 'carajas-filial-juazeiro',
        empresa_grupo: 'CARAJAS',
        nome_filial: 'CARAJAS MATERIAL DE CONSTRUCAO LTDA - JUAZEIRO DO NORTE',
        cnpj: '03.656.804/0007-27',
        inscricao_estadual: '06.876.543-1',
        cidade: 'Juazeiro do Norte',
        uf: 'CE',
        logradouro: 'Av. Padre Cícero, 2555',
        bairro: 'Triângulo',
        cep: '63041-140',
        telefone: '(88) 3571-3300'
      },
      {
        id: 'carajas-filial-fortaleza',
        empresa_grupo: 'CARAJAS',
        nome_filial: 'CARAJAS MATERIAL DE CONSTRUCAO LTDA - FORTALEZA',
        cnpj: '03.656.804/0008-08',
        inscricao_estadual: '06.998.877-2',
        cidade: 'Fortaleza',
        uf: 'CE',
        logradouro: 'Av. Washington Soares, 3000',
        bairro: 'Edson Queiroz',
        cep: '60811-341',
        telefone: '(85) 3241-9900'
      },
      {
        id: 'carajas-filial-teresina',
        empresa_grupo: 'CARAJAS',
        nome_filial: 'CARAJAS MATERIAL DE CONSTRUCAO LTDA - TERESINA',
        cnpj: '03.656.804/0009-99',
        inscricao_estadual: '19.456.123-4',
        cidade: 'Teresina',
        uf: 'PI',
        logradouro: 'Av. João XXIII, 1800',
        bairro: 'São Cristóvão',
        cep: '64051-000',
        telefone: '(86) 3216-4400'
      },
      {
        id: 'carajas-filial-mossoro',
        empresa_grupo: 'CARAJAS',
        nome_filial: 'CARAJAS MATERIAL DE CONSTRUCAO LTDA - MOSSORO',
        cnpj: '03.656.804/0010-22',
        inscricao_estadual: '201.234.567',
        cidade: 'Mossoró',
        uf: 'RN',
        logradouro: 'Av. Presidente Dutra, 800',
        bairro: 'Alto de São Manoel',
        cep: '59628-000',
        telefone: '(84) 3315-7000'
      }
    ];

    for (const b of defaultBranches) {
      execute(`
        INSERT INTO filiais_empresa (
          id, empresa_grupo, nome_filial, cnpj, inscricao_estadual,
          cidade, uf, logradouro, bairro, cep, telefone, ativo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        b.id, b.empresa_grupo, b.nome_filial, b.cnpj, b.inscricao_estadual,
        b.cidade, b.uf, b.logradouro, b.bairro, b.cep, b.telefone
      ]);
    }

    console.log(`[Branches] Seeded ${defaultBranches.length} default CARAJAS corporate branches.`);
  } catch (err) {
    console.warn('[Branches Seed Warning]', err.message);
  }
}

/**
 * List all registered company branches
 */
function getAllBranches() {
  seedDefaultBranches();
  return queryAll('SELECT * FROM filiais_empresa WHERE ativo = 1 ORDER BY uf ASC, cidade ASC');
}

/**
 * Add or update branch
 */
function saveBranch(data) {
  const id = data.id || `branch-${uuidv4().slice(0, 8)}`;
  const existing = queryOne('SELECT id FROM filiais_empresa WHERE id = ?', [id]);
  
  if (existing) {
    execute(`
      UPDATE filiais_empresa SET
        empresa_grupo = ?,
        nome_filial = ?,
        cnpj = ?,
        inscricao_estadual = ?,
        cidade = ?,
        uf = ?,
        logradouro = ?,
        bairro = ?,
        cep = ?,
        telefone = ?,
        ativo = ?
      WHERE id = ?
    `, [
      data.empresa_grupo || 'CARAJAS',
      data.nome_filial,
      data.cnpj,
      data.inscricao_estadual || '',
      data.cidade,
      data.uf.toUpperCase(),
      data.logradouro || '',
      data.bairro || '',
      data.cep || '',
      data.telefone || '',
      data.ativo !== undefined ? (data.ativo ? 1 : 0) : 1,
      id
    ]);
  } else {
    execute(`
      INSERT INTO filiais_empresa (
        id, empresa_grupo, nome_filial, cnpj, inscricao_estadual,
        cidade, uf, logradouro, bairro, cep, telefone, ativo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      data.empresa_grupo || 'CARAJAS',
      data.nome_filial,
      data.cnpj,
      data.inscricao_estadual || '',
      data.cidade,
      data.uf.toUpperCase(),
      data.logradouro || '',
      data.bairro || '',
      data.cep || '',
      data.telefone || '',
      data.ativo !== undefined ? (data.ativo ? 1 : 0) : 1
    ]);
  }

  return queryOne('SELECT * FROM filiais_empresa WHERE id = ?', [id]);
}

/**
 * Find matching branch for destination (City/UF)
 * Applied when recipient is Pessoa Física (PF) to route the fiscal CT-e to the nearest Branch
 */
function findBranchForDestination(cidade, uf, empresaGrupo = 'CARAJAS') {
  seedDefaultBranches();
  const all = queryAll('SELECT * FROM filiais_empresa WHERE ativo = 1');
  if (!all || all.length === 0) return null;

  const targetCityNorm = normalizeCity(cidade);
  const targetUfNorm = String(uf || '').trim().toUpperCase();

  // 1. Try exact City and UF match
  let matched = all.find(b => 
    String(b.uf).toUpperCase() === targetUfNorm &&
    normalizeCity(b.cidade) === targetCityNorm
  );

  // 2. Try nearby city / metropolitan hub within same UF
  if (!matched && targetUfNorm) {
    if (targetUfNorm === 'AL') {
      // If delivery is in Rio Largo, Maceió or Satuba, use Maceió or Matriz
      if (['RIO LARGO', 'SATUBA', 'MARECHAL DEODORO', 'SANTA LUZIA DO NORTE'].includes(targetCityNorm)) {
        matched = all.find(b => normalizeCity(b.cidade) === 'RIO LARGO') || all.find(b => normalizeCity(b.cidade) === 'MACEIO');
      } else if (['PALMEIRA DOS INDIOS', 'CRAIBAS', 'GIRAU DO PONCIANO', 'IGACI'].includes(targetCityNorm)) {
        matched = all.find(b => normalizeCity(b.cidade) === 'ARAPIRACA');
      }
    } else if (targetUfNorm === 'PB') {
      if (['JOAO PESSOA', 'SANTA RITA', 'BAYEUX'].includes(targetCityNorm)) {
        matched = all.find(b => normalizeCity(b.cidade) === 'CABEDELO');
      }
    }
  }

  // 3. Fallback: match any branch in that UF
  if (!matched && targetUfNorm) {
    matched = all.find(b => String(b.uf).toUpperCase() === targetUfNorm);
  }

  // 4. Ultimate Fallback: Matriz / CD
  if (!matched) {
    matched = all.find(b => b.id === 'carajas-matriz-cd-al') || all[0];
  }

  return matched;
}

/**
 * Parse an NF-e XML String (Modelo 55)
 */
function parseSingleNFeXML(xmlString, fileName = 'nfe.xml') {
  if (!xmlString || typeof xmlString !== 'string') {
    throw new Error('Conteúdo XML inválido ou vazio.');
  }

  let parsed;
  try {
    parsed = parser.parse(xmlString);
  } catch (err) {
    throw new Error(`Falha de parsing XML (${fileName}): ${err.message}`);
  }

  // Locate NFe or nfeProc
  let infNFe = null;
  if (parsed.nfeProc && parsed.nfeProc.NFe && parsed.nfeProc.NFe.infNFe) {
    infNFe = parsed.nfeProc.NFe.infNFe;
  } else if (parsed.NFe && parsed.NFe.infNFe) {
    infNFe = parsed.NFe.infNFe;
  } else if (parsed.infNFe) {
    infNFe = parsed.infNFe;
  } else {
    // Search recursively if nested differently
    const findInfNFe = (obj) => {
      if (!obj || typeof obj !== 'object') return null;
      if (obj.infNFe) return obj.infNFe;
      for (const k of Object.keys(obj)) {
        const found = findInfNFe(obj[k]);
        if (found) return found;
      }
      return null;
    };
    infNFe = findInfNFe(parsed);
  }

  if (Array.isArray(infNFe)) {
    infNFe = infNFe[0];
  }

  if (!infNFe) {
    throw new Error(`O arquivo '${fileName}' não é uma Nota Fiscal Eletrônica (NF-e mod. 55) válida com a tag <infNFe>.`);
  }

  // Extract Access Key
  let chaveAcesso = '';
  if (infNFe['@_Id']) {
    chaveAcesso = String(infNFe['@_Id']).replace(/\D/g, '').slice(-44);
  }
  if (!chaveAcesso && parsed.nfeProc && parsed.nfeProc.protNFe && parsed.nfeProc.protNFe.infProt && parsed.nfeProc.protNFe.infProt.chNFe) {
    chaveAcesso = String(parsed.nfeProc.protNFe.infProt.chNFe).replace(/\D/g, '').slice(-44);
  }

  const ide = infNFe.ide || {};
  const emit = infNFe.emit || {};
  const dest = infNFe.dest || {};
  const total = infNFe.total || {};
  const icmsTot = (total.ICMSTot || {});
  const transp = infNFe.transp || {};
  const volList = transp.vol ? (Array.isArray(transp.vol) ? transp.vol : [transp.vol]) : [];
  const detList = infNFe.det ? (Array.isArray(infNFe.det) ? infNFe.det : [infNFe.det]) : [];

  // Recipient analysis: PF vs PJ
  const destCnpj = dest.CNPJ ? String(dest.CNPJ).replace(/\D/g, '') : '';
  const destCpf = dest.CPF ? String(dest.CPF).replace(/\D/g, '') : '';
  const isPj = Boolean(destCnpj);
  const tipoPessoa = isPj ? 'PJ' : 'PF';
  const documentoFormatado = isPj ? formatCNPJ(destCnpj) : formatCPF(destCpf);

  const enderDest = dest.enderDest || {};
  const cidadeDestino = enderDest.xMun || 'Maceió';
  const ufDestino = String(enderDest.UF || 'AL').toUpperCase();

  const enderEmit = emit.enderEmit || {};
  const cidadeOrigem = enderEmit.xMun || 'Rio Largo';
  const ufOrigem = String(enderEmit.UF || 'AL').toUpperCase();

  // Aggregate weights and volumes from <transp><vol>
  let pesoBrutoTotal = 0;
  let pesoLiquidoTotal = 0;
  let quantidadeVolumes = 0;
  let especieVolume = 'VOLUMES';

  volList.forEach(v => {
    if (v.pesoB) pesoBrutoTotal += parseFloat(v.pesoB) || 0;
    if (v.pesoL) pesoLiquidoTotal += parseFloat(v.pesoL) || 0;
    if (v.qVol) quantidadeVolumes += parseInt(v.qVol, 10) || 0;
    if (v.esp) especieVolume = String(v.esp).trim().toUpperCase();
  });

  // Extract products
  const itens = [];
  let somaValorProdutos = 0;
  detList.forEach((d, idx) => {
    const p = d.prod || {};
    const vProd = parseFloat(p.vProd) || 0;
    somaValorProdutos += vProd;
    itens.push({
      item_num: idx + 1,
      codigo: p.cProd || String(idx + 1),
      descricao: p.xProd || 'MERCADORIA EM GERAL',
      ncm: p.NCM || '',
      cfop: p.CFOP || '',
      unidade: p.uCom || 'UN',
      quantidade: parseFloat(p.qCom) || 1,
      valor_unitario: parseFloat(p.vUnCom) || vProd,
      valor_total: vProd
    });
  });

  // Fallbacks if vol tag was empty
  if (quantidadeVolumes === 0) {
    quantidadeVolumes = itens.length > 0 ? itens.length : 1;
  }
  if (pesoBrutoTotal === 0) {
    // Estimativa por peso líquido ou proporção do valor
    pesoBrutoTotal = pesoLiquidoTotal > 0 ? pesoLiquidoTotal : (itens.length * 15.0);
  }

  const valorTotalNFe = parseFloat(icmsTot.vNF) || parseFloat(icmsTot.vProd) || somaValorProdutos || 0;
  const valorFreteNFe = parseFloat(icmsTot.vFrete) || 0;

  // Build structured NF-e object
  return {
    id: `nfe-${chaveAcesso || uuidv4().slice(0, 8)}`,
    arquivo_origem: fileName,
    chave_acesso: chaveAcesso,
    numero: parseInt(ide.nNF || 1, 10),
    serie: parseInt(ide.serie || 1, 10),
    data_emissao: ide.dhEmi || ide.dEmi || new Date().toISOString(),
    natureza_operacao: ide.natOp || 'VENDA DE MERCADORIA',
    
    // Remetente (Emitente da NF-e)
    emitente: {
      nome: emit.xNome || 'CARAJAS MATERIAL DE CONSTRUCAO LTDA',
      nome_fantasia: emit.xFant || 'CARAJAS',
      cnpj: emit.CNPJ ? formatCNPJ(emit.CNPJ) : '',
      inscricao_estadual: emit.IE || '',
      cidade: cidadeOrigem,
      uf: ufOrigem,
      logradouro: `${enderEmit.xLgr || ''}, ${enderEmit.nro || 's/n'}`.trim(),
      bairro: enderEmit.xBairro || '',
      cep: enderEmit.CEP || ''
    },

    // Destinatário da NF-e (Dados físicos e cadastrais)
    destinatario: {
      tipo_pessoa: tipoPessoa,
      is_pj: isPj,
      documento: documentoFormatado,
      documento_tipo: isPj ? 'CNPJ' : 'CPF',
      documento_bruto: isPj ? destCnpj : destCpf,
      nome: dest.xNome || (isPj ? 'EMPRESA CLIENTE PJ' : 'CLIENTE PESSOA FISICA'),
      inscricao_estadual: dest.IE || (isPj ? 'ISENTO' : ''),
      telefone: enderDest.fone || '',
      endereco: {
        logradouro: `${enderDest.xLgr || ''}, ${enderDest.nro || 's/n'}${enderDest.xCpl ? ' - ' + enderDest.xCpl : ''}`.trim(),
        bairro: enderDest.xBairro || '',
        cidade: cidadeDestino,
        uf: ufDestino,
        cep: enderDest.CEP || ''
      }
    },

    // Valores e Totais
    valores: {
      valor_produtos: somaValorProdutos,
      valor_frete_destacado: valorFreteNFe,
      valor_total_nfe: valorTotalNFe,
      icms_bc: parseFloat(icmsTot.vBC) || 0,
      icms_valor: parseFloat(icmsTot.vICMS) || 0
    },

    // Carga e Transporte
    carga: {
      peso_bruto: pesoBrutoTotal,
      peso_liquido: pesoLiquidoTotal,
      volumes: quantidadeVolumes,
      especie: especieVolume,
      qtd_itens: itens.length
    },

    itens
  };
}

/**
 * Process a batch of NF-e XML files and group them by Route/Destination
 * Applying the core business rule for PF vs PJ:
 * - PJ (CNPJ presente): Destino e tomador/destinatário do CT-e correspondem diretamente ao PJ da NF-e.
 * - PF (CPF presente): Endereço de entrega físico é do PF, mas destinatário fiscal do CT-e é roteado para a Filial da Empresa na cidade/praça.
 */
function processNFeBatch(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Nenhum arquivo XML de NF-e recebido para processamento.');
  }

  seedDefaultBranches();

  const parsedList = [];
  const errors = [];

  for (const f of files) {
    try {
      const xmlStr = f.buffer ? f.buffer.toString('utf-8') : (f.content || '');
      const parsed = parseSingleNFeXML(xmlStr, f.originalname || f.name || 'nfe.xml');
      parsedList.push(parsed);
    } catch (err) {
      errors.push({
        arquivo: f.originalname || f.name || 'arquivo_desconhecido.xml',
        erro: err.message
      });
    }
  }

  if (parsedList.length === 0 && errors.length > 0) {
    return {
      success: false,
      message: 'Nenhum arquivo XML pôde ser lido com sucesso.',
      errors,
      grupos_cte: [],
      kpis: { totalNfes: 0, totalGrupos: 0, totalPeso: 0, totalValor: 0 }
    };
  }

  // Group by Destination Route (cidade/uf)
  const groupMap = {};

  parsedList.forEach((nfe) => {
    const dest = nfe.destinatario;
    const cidade = dest.endereco.cidade || 'Maceió';
    const uf = dest.endereco.uf || 'AL';
    const routeKey = `${normalizeCity(cidade)}_${uf}`;

    if (!groupMap[routeKey]) {
      // Find Corporate Branch for this destination
      const branch = findBranchForDestination(cidade, uf, nfe.emitente.nome);

      groupMap[routeKey] = {
        grupo_id: `cte-group-${routeKey.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        destino_cidade: cidade,
        destino_uf: uf,
        rota_label: `${cidade} / ${uf}`,
        is_interestadual: uf !== 'AL',
        
        // Corporate Branch assigned for PF orders in this city
        filial_vinculada: branch ? {
          id: branch.id,
          nome_filial: branch.nome_filial,
          cnpj: branch.cnpj,
          inscricao_estadual: branch.inscricao_estadual,
          cidade: branch.cidade,
          uf: branch.uf,
          logradouro: branch.logradouro,
          bairro: branch.bairro,
          cep: branch.cep,
          telefone: branch.telefone
        } : null,

        // Fiscal summary
        remetente_principal: nfe.emitente,
        nfes: [],
        
        // Aggregates
        somatorio_peso_bruto: 0,
        somatorio_peso_liquido: 0,
        somatorio_valor_carga: 0,
        somatorio_volumes: 0,
        qtd_nfes_pf: 0,
        qtd_nfes_pj: 0,
        produtos_predominantes: new Set(),
        chaves_nfe: []
      };
    }

    const grp = groupMap[routeKey];
    grp.nfes.push(nfe);
    grp.somatorio_peso_bruto += nfe.carga.peso_bruto;
    grp.somatorio_peso_liquido += nfe.carga.peso_liquido;
    grp.somatorio_valor_carga += nfe.valores.valor_total_nfe;
    grp.somatorio_volumes += nfe.carga.volumes;
    if (nfe.chave_acesso) grp.chaves_nfe.push(nfe.chave_acesso);

    if (dest.is_pj) {
      grp.qtd_nfes_pj += 1;
      nfe.routing_info = {
        tipo_roteamento: 'PJ_DIRETO',
        badge_label: 'PJ Direto',
        destinatario_fiscal_nome: dest.nome,
        destinatario_fiscal_doc: dest.documento,
        destinatario_fiscal_ie: dest.inscricao_estadual,
        endereco_entrega: dest.endereco.logradouro,
        observacao: 'Faturamento e transporte emitidos diretamente em nome do destinatário PJ.'
      };
    } else {
      grp.qtd_nfes_pf += 1;
      const f = grp.filial_vinculada;
      nfe.routing_info = {
        tipo_roteamento: 'PF_ROTEADO_FILIAL',
        badge_label: 'PF ➔ Roteado Filial',
        destinatario_fiscal_nome: f ? f.nome_filial : 'CARAJAS MATERIAL DE CONSTRUCAO (FILIAL)',
        destinatario_fiscal_doc: f ? f.cnpj : '03.656.804/0001-31',
        destinatario_fiscal_ie: f ? f.inscricao_estadual : '',
        cliente_pf_nome: dest.nome,
        cliente_pf_cpf: dest.documento,
        endereco_entrega_cliente: `${dest.endereco.logradouro}, ${dest.endereco.bairro} - ${cidade}/${uf}`,
        observacao: `Entrega física no cliente PF (${dest.nome}), faturamento fiscal do CT-e roteado para a Filial local (${f ? f.cidade : cidade}).`
      };
    }

    // Collect product names for consolidated description
    nfe.itens.forEach(it => {
      const cleanDesc = String(it.descricao || '').split(' ')[0].toUpperCase();
      if (cleanDesc.length >= 3) grp.produtos_predominantes.add(cleanDesc);
    });
  });

  // Finalize each group's consolidated CT-e header
  const gruposCte = Object.values(groupMap).map(grp => {
    // Consolidated fiscal recipient for the CT-e:
    // If all are PJ and have the same CNPJ, use that PJ.
    // If there is any PF, use the Filial of the praça (as per business requirement).
    let destinatarioFiscalConsolidado = null;
    let regraAplicada = '';

    if (grp.qtd_nfes_pf > 0) {
      // Rule 2: PF Present -> Fiscal Recipient MUST be the Company Branch
      const f = grp.filial_vinculada;
      destinatarioFiscalConsolidado = {
        tipo: 'FILIAL_CORPORATIVA',
        razao_social: f ? f.nome_filial : 'CARAJAS MATERIAL DE CONSTRUCAO LTDA',
        cnpj: f ? f.cnpj : '03.656.804/0001-31',
        inscricao_estadual: f ? f.inscricao_estadual : '240.012.345',
        cidade: f ? f.cidade : grp.destino_cidade,
        uf: f ? f.uf : grp.destino_uf,
        endereco: f ? `${f.logradouro}, ${f.bairro} - CEP ${f.cep}` : `${grp.destino_cidade} / ${grp.destino_uf}`,
        descricao_regra: `Roteamento Fiscal Automático: ${grp.qtd_nfes_pf} entrega(s) de Pessoa Física (PF) direcionada(s) à Filial da praça.`
      };
      regraAplicada = 'PF_PARA_FILIAL';
    } else {
      // Only PJ recipients in this destination
      const firstPj = grp.nfes[0].destinatario;
      destinatarioFiscalConsolidado = {
        tipo: 'PJ_DIRETO',
        razao_social: firstPj.nome,
        cnpj: firstPj.documento,
        inscricao_estadual: firstPj.inscricao_estadual,
        cidade: grp.destino_cidade,
        uf: grp.destino_uf,
        endereco: `${firstPj.endereco.logradouro}, ${firstPj.endereco.bairro} - CEP ${firstPj.endereco.cep}`,
        descricao_regra: 'Destinatário Pessoa Jurídica (PJ) da NF-e assumido diretamente no CT-e.'
      };
      regraAplicada = 'PJ_DIRETO';
    }

    // Synthesize clean commodity description for CT-e field
    const topKeywords = Array.from(grp.produtos_predominantes).slice(0, 4).join(', ');
    const listaNumNfe = grp.nfes.map(n => n.numero).join(', ');
    const resumoMercadoria = `CARGA FRACIONADA CONTENDO ${topKeywords || 'MATERIAIS DIVERSOS'} (NF-es: ${listaNumNfe})`;

    return {
      grupo_id: grp.grupo_id,
      destino_cidade: grp.destino_cidade,
      destino_uf: grp.destino_uf,
      rota_label: grp.rota_label,
      is_interestadual: grp.is_interestadual,
      regra_aplicada: regraAplicada,
      destinatario_fiscal_consolidado: destinatarioFiscalConsolidado,
      remetente: grp.remetente_principal,
      
      // Totals
      total_nfes: grp.nfes.length,
      qtd_nfes_pf: grp.qtd_nfes_pf,
      qtd_nfes_pj: grp.qtd_nfes_pj,
      somatorio_peso_bruto: parseFloat(grp.somatorio_peso_bruto.toFixed(3)),
      somatorio_peso_liquido: parseFloat(grp.somatorio_peso_liquido.toFixed(3)),
      somatorio_valor_carga: parseFloat(grp.somatorio_valor_carga.toFixed(2)),
      somatorio_volumes: grp.somatorio_volumes,
      resumo_mercadoria: resumoMercadoria,
      chaves_nfe: grp.chaves_nfe,
      
      // Detailed triage list
      nfes: grp.nfes
    };
  });

  // Calculate Overall Batch KPIs
  const totalNfes = parsedList.length;
  const totalGrupos = gruposCte.length;
  const totalPeso = gruposCte.reduce((acc, g) => acc + g.somatorio_peso_bruto, 0);
  const totalValor = gruposCte.reduce((acc, g) => acc + g.somatorio_valor_carga, 0);
  const totalVolumes = gruposCte.reduce((acc, g) => acc + g.somatorio_volumes, 0);
  const totalPf = parsedList.filter(n => !n.destinatario.is_pj).length;
  const totalPj = parsedList.filter(n => n.destinatario.is_pj).length;

  return {
    success: true,
    message: `${totalNfes} NF-e(s) processada(s) e separada(s) em ${totalGrupos} grupo(s) de CT-e por destino.`,
    errors,
    kpis: {
      totalNfes,
      totalGrupos,
      totalPeso: parseFloat(totalPeso.toFixed(3)),
      totalValor: parseFloat(totalValor.toFixed(2)),
      totalVolumes,
      totalPf,
      totalPj
    },
    grupos_cte: gruposCte
  };
}

/**
 * Generate a realistic Sample Batch of NF-es (XML strings)
 * Mix of PF and PJ customers across 3 destination hubs (Maceió/AL, Arapiraca/AL, Juazeiro do Norte/CE)
 */
function generateSampleNFeBatch() {
  const sampleData = [
    // --- DESTINO 1: Maceió/AL (1 PJ e 1 PF) ---
    {
      numero: 5011,
      serie: 1,
      dhEmi: '2026-09-24T08:30:00-03:00',
      dest: {
        isPj: true,
        cnpj: '12345678000195',
        cpf: '',
        nome: 'CONSTRUTORA ALAGOAS MODERNA LTDA',
        ie: '240.555.888',
        xLgr: 'Rua do Sol, 450',
        xBairro: 'Centro',
        xMun: 'Maceió',
        UF: 'AL',
        CEP: '57020070'
      },
      itens: [
        { cProd: 'CIM-01', xProd: 'CIMENTO CP-II 50KG VOTORAN', qCom: 100, vUnCom: 35.00, vProd: 3500.00, NCM: '25232900' },
        { cProd: 'ARG-02', xProd: 'ARGAMASSA AC-III 20KG QUARTZOLIT', qCom: 50, vUnCom: 28.50, vProd: 1425.00, NCM: '38245000' }
      ],
      pesoB: 6000.0,
      vol: 150
    },
    {
      numero: 5012,
      serie: 1,
      dhEmi: '2026-09-24T09:15:00-03:00',
      dest: {
        isPj: false,
        cnpj: '',
        cpf: '12345678909',
        nome: 'JOSE CARLOS DOS SANTOS',
        ie: '',
        xLgr: 'Av. Menino Marcelo, 1820, Cond. Jardim Europa, Bloco B Apto 302',
        xBairro: 'Serraria',
        xMun: 'Maceió',
        UF: 'AL',
        CEP: '57046000'
      },
      itens: [
        { cProd: 'PIS-05', xProd: 'PORCELANATO POLIDO 84X84 DELTA CALACATA', qCom: 40, vUnCom: 68.90, vProd: 2756.00, NCM: '69072100' },
        { cProd: 'REJ-01', xProd: 'REJUNTE RESINADO BRANCO 1KG', qCom: 10, vUnCom: 18.00, vProd: 180.00, NCM: '32141020' }
      ],
      pesoB: 850.0,
      vol: 50
    },

    // --- DESTINO 2: Arapiraca/AL (2 PFs - Ambos roteados para Filial Arapiraca) ---
    {
      numero: 5021,
      serie: 1,
      dhEmi: '2026-09-24T10:00:00-03:00',
      dest: {
        isPj: false,
        cnpj: '',
        cpf: '98765432100',
        nome: 'MARIA APARECIDA DA SILVA',
        ie: '',
        xLgr: 'Rua Quinze de Novembro, 880',
        xBairro: 'Alto do Cruzeiro',
        xMun: 'Arapiraca',
        UF: 'AL',
        CEP: '57312010'
      },
      itens: [
        { cProd: 'TIN-10', xProd: 'TINTA ACRILICA FOSCA CORAL BRANCO NEVE 18L', qCom: 8, vUnCom: 380.00, vProd: 3040.00, NCM: '32091010' },
        { cProd: 'MAS-02', xProd: 'MASSA CORRIDA PVA 25KG SUVINIL', qCom: 6, vUnCom: 75.00, vProd: 450.00, NCM: '32141010' }
      ],
      pesoB: 350.0,
      vol: 14
    },
    {
      numero: 5022,
      serie: 1,
      dhEmi: '2026-09-24T10:45:00-03:00',
      dest: {
        isPj: false,
        cnpj: '',
        cpf: '45678912344',
        nome: 'ANTONIO MARCOS PEREIRA',
        ie: '',
        xLgr: 'Rua Maurício Pereira, 1205',
        xBairro: 'Eldorado',
        xMun: 'Arapiraca',
        UF: 'AL',
        CEP: '57306000'
      },
      itens: [
        { cProd: 'TUB-01', xProd: 'TUBO SOLDAVEL PVC 100MM 6M TIGRE', qCom: 20, vUnCom: 89.00, vProd: 1780.00, NCM: '39172300' },
        { cProd: 'CON-04', xProd: 'CURVA 90 SOLDAVEL PVC 100MM TIGRE', qCom: 10, vUnCom: 24.50, vProd: 245.00, NCM: '39174090' }
      ],
      pesoB: 280.0,
      vol: 30
    },

    // --- DESTINO 3: Juazeiro do Norte/CE (Interestadual - 1 PJ e 1 PF) ---
    {
      numero: 5031,
      serie: 1,
      dhEmi: '2026-09-24T11:00:00-03:00',
      dest: {
        isPj: true,
        cnpj: '07891234000178',
        nome: 'ENGENHARIA CARIRI CONSTRUCOES S/A',
        ie: '06.912.345-0',
        xLgr: 'Av. Leão Sampaio, 2040',
        xBairro: 'Lagoa Seca',
        xMun: 'Juazeiro do Norte',
        UF: 'CE',
        CEP: '63040000'
      },
      itens: [
        { cProd: 'FER-01', xProd: 'BARRA DE FERRO REBARRAS CA-50 10MM 12M GERDAU', qCom: 200, vUnCom: 48.00, vProd: 9600.00, NCM: '72142000' },
        { cProd: 'ARA-02', xProd: 'ARAME RECOZIDO TORCIDO BWG 18 1KG', qCom: 30, vUnCom: 16.50, vProd: 495.00, NCM: '72171090' }
      ],
      pesoB: 8500.0,
      vol: 230
    },
    {
      numero: 5032,
      serie: 1,
      dhEmi: '2026-09-24T11:30:00-03:00',
      dest: {
        isPj: false,
        cnpj: '',
        cpf: '74185296311',
        nome: 'FRANCISCO DE ASSIS LIMA',
        ie: '',
        xLgr: 'Rua São Pedro, 1450',
        xBairro: 'Salesianos',
        xMun: 'Juazeiro do Norte',
        UF: 'CE',
        CEP: '63050010'
      },
      itens: [
        { cProd: 'LUM-01', xProd: 'PAINEL LED EMBUTIR 24W 6500K QUADRADO AVANT', qCom: 15, vUnCom: 32.90, vProd: 493.50, NCM: '94051190' },
        { cProd: 'CAB-02', xProd: 'CABO FLEXIVEL 2.5MM AZUL ROLO 100M SIL', qCom: 4, vUnCom: 219.00, vProd: 876.00, NCM: '85444900' }
      ],
      pesoB: 65.0,
      vol: 19
    }
  ];

  const files = sampleData.map((d, idx) => {
    const totalProd = d.itens.reduce((acc, it) => acc + it.vProd, 0);
    const key = `2726090365680400013155001${String(d.numero).padStart(9, '0')}1${String(10000000 + idx)}5`;
    
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe${key}" versao="4.00">
      <ide>
        <cUF>27</cUF>
        <cNF>${10000000 + idx}</cNF>
        <natOp>VENDA DE MERCADORIAS</natOp>
        <mod>55</mod>
        <serie>${d.serie}</serie>
        <nNF>${d.numero}</nNF>
        <dhEmi>${d.dhEmi}</dhEmi>
        <tpNF>1</tpNF>
        <idDest>${d.dest.UF === 'AL' ? '1' : '2'}</idDest>
        <cMunFG>2707701</cMunFG>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>5</cDV>
        <tpAmb>1</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>1</indFinal>
        <indPres>1</indPres>
        <procEmi>0</procEmi>
        <verProc>CARGA_BALANCE_NFE_V2</verProc>
      </ide>
      <emit>
        <CNPJ>03656804000131</CNPJ>
        <xNome>CARAJAS MATERIAL DE CONSTRUCAO LTDA</xNome>
        <xFant>CARAJAS HOME CENTER</xFant>
        <enderEmit>
          <xLgr>Rodovia BR-104, Km 90</xLgr>
          <nro>s/n</nro>
          <xBairro>Mata do Rolo</xBairro>
          <cMun>2707701</cMun>
          <xMun>Rio Largo</xMun>
          <UF>AL</UF>
          <CEP>57100000</CEP>
          <cPais>1058</cPais>
          <xPais>BRASIL</xPais>
        </enderEmit>
        <IE>240012345</IE>
        <CRT>3</CRT>
      </emit>
      <dest>
        ${d.dest.isPj ? `<CNPJ>${d.dest.cnpj}</CNPJ>` : `<CPF>${d.dest.cpf}</CPF>`}
        <xNome>${d.dest.nome}</xNome>
        <enderDest>
          <xLgr>${d.dest.xLgr}</xLgr>
          <nro>S/N</nro>
          <xBairro>${d.dest.xBairro}</xBairro>
          <cMun>2704302</cMun>
          <xMun>${d.dest.xMun}</xMun>
          <UF>${d.dest.UF}</UF>
          <CEP>${d.dest.CEP}</CEP>
          <cPais>1058</cPais>
          <xPais>BRASIL</xPais>
        </enderDest>
        <indIEDest>${d.dest.isPj ? '1' : '9'}</indIEDest>
        ${d.dest.ie ? `<IE>${d.dest.ie.replace(/\D/g, '')}</IE>` : ''}
      </dest>
      ${d.itens.map((it, i) => `
      <det nItem="${i + 1}">
        <prod>
          <cProd>${it.cProd}</cProd>
          <cEAN>SEM GTIN</cEAN>
          <xProd>${it.xProd}</xProd>
          <NCM>${it.NCM}</NCM>
          <CFOP>${d.dest.UF === 'AL' ? '5102' : '6102'}</CFOP>
          <uCom>UN</uCom>
          <qCom>${it.qCom}.0000</qCom>
          <vUnCom>${it.vUnCom.toFixed(4)}</vUnCom>
          <vProd>${it.vProd.toFixed(2)}</vProd>
          <cEANTrib>SEM GTIN</cEANTrib>
          <uTrib>UN</uTrib>
          <qTrib>${it.qCom}.0000</qTrib>
          <vUnTrib>${it.vUnCom.toFixed(4)}</vUnTrib>
          <indTot>1</indTot>
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <orig>0</orig>
              <CST>00</CST>
              <modBC>3</modBC>
              <vBC>${it.vProd.toFixed(2)}</vBC>
              <pICMS>${d.dest.UF === 'AL' ? '21.50' : '12.00'}</pICMS>
              <vICMS>${(it.vProd * (d.dest.UF === 'AL' ? 0.215 : 0.12)).toFixed(2)}</vICMS>
            </ICMS00>
          </ICMS>
        </imposto>
      </det>`).join('')}
      <total>
        <ICMSTot>
          <vBC>${totalProd.toFixed(2)}</vBC>
          <vICMS>${(totalProd * (d.dest.UF === 'AL' ? 0.215 : 0.12)).toFixed(2)}</vICMS>
          <vICMSDeson>0.00</vICMSDeson>
          <vFCP>0.00</vFCP>
          <vBCST>0.00</vBCST>
          <vST>0.00</vST>
          <vFCPST>0.00</vFCPST>
          <vFCPSTRet>0.00</vFCPSTRet>
          <vProd>${totalProd.toFixed(2)}</vProd>
          <vFrete>0.00</vFrete>
          <vSeg>0.00</vSeg>
          <vDesc>0.00</vDesc>
          <vII>0.00</vII>
          <vIPI>0.00</vIPI>
          <vIPIDevol>0.00</vIPIDevol>
          <vPIS>0.00</vPIS>
          <vCOFINS>0.00</vCOFINS>
          <vOutro>0.00</vOutro>
          <vNF>${totalProd.toFixed(2)}</vNF>
        </ICMSTot>
      </total>
      <transp>
        <modFrete>0</modFrete>
        <vol>
          <qVol>${d.vol}</qVol>
          <esp>VOLUMES</esp>
          <pesoL>${(d.pesoB * 0.95).toFixed(3)}</pesoL>
          <pesoB>${d.pesoB.toFixed(3)}</pesoB>
        </vol>
      </transp>
      <infAdic>
        <infCpl>Carga expedida via CARGA BALANCE - Roteamento Inteligente NF-e para Emissao de CT-e. Destino: ${d.dest.xMun}/${d.dest.UF}</infCpl>
      </infAdic>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <tpAmb>1</tpAmb>
      <verAplic>SVRS_2026</verAplic>
      <chNFe>${key}</chNFe>
      <dhRecbto>${d.dhEmi}</dhRecbto>
      <nProt>12726000000${d.numero}</nProt>
      <digVal>x9zF8aQyLkm34Jk=</digVal>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso da NF-e</xMotivo>
    </infProt>
  </protNFe>
</nfeProc>`;

    return {
      originalname: `NFe_${d.numero}_${d.dest.xMun}_${d.dest.isPj ? 'PJ' : 'PF'}.xml`,
      buffer: Buffer.from(xmlContent, 'utf-8')
    };
  });

  return processNFeBatch(files);
}

module.exports = {
  seedDefaultBranches,
  getAllBranches,
  saveBranch,
  findBranchForDestination,
  parseSingleNFeXML,
  processNFeBatch,
  generateSampleNFeBatch
};
