const { parseAndStoreXML } = require('./xmlParser');

// Helper to generate 44-digit random access key
function generateSEFAZAccessKey(ufCode, yearMonth, cnpj, mod, serie, nDoc) {
  const uf = String(ufCode).padStart(2, '0');
  const aamm = String(yearMonth);
  const cleanCnpj = String(cnpj).replace(/\D/g, '').padStart(14, '0');
  const modelo = String(mod).padStart(2, '0'); // 57 for CT-e, 58 for MDF-e
  const ser = String(serie).padStart(3, '0');
  const n = String(nDoc).padStart(9, '0');
  const tpEmis = '1'; // Normal
  const cCT = String(Math.floor(10000000 + Math.random() * 90000000));
  const baseKey = `${uf}${aamm}${cleanCnpj}${modelo}${ser}${n}${tpEmis}${cCT}`;

  // Calculate check digit (Módulo 11)
  let sum = 0;
  let weight = 2;
  for (let i = baseKey.length - 1; i >= 0; i--) {
    sum += parseInt(baseKey[i], 10) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const dv = (remainder === 0 || remainder === 1) ? 0 : (11 - remainder);

  return `${baseKey}${dv}`;
}

// Generate realistic CT-e XML
function generateCTeXML({
  numero = 1042,
  serie = 1,
  dhEmi = '2026-09-15T10:30:00-03:00',
  motorista = { nome: 'CARLOS EDUARDO SILVA', cpf: '12345678901' },
  origem = { cidade: 'São Paulo', uf: 'SP', ibge: '3550308' },
  destino = { cidade: 'Curitiba', uf: 'PR', ibge: '4106902' },
  valorFrete = 3850.50,
  valorCarga = 94200.00,
  peso = 14500.00,
  emitente = {
    nome: 'TRANSLOG EXPRESS TRANSPORTES LTDA',
    cnpj: '04.882.311/0001-45',
    ie: '112.456.789.110',
    logradouro: 'Av. das Nações Unidas',
    numero: '14261',
    bairro: 'Vila Gertrudes',
    cidade: 'São Paulo',
    uf: 'SP',
    cep: '04794000'
  },
  remetente = {
    nome: 'INDUSTRIA METALURGICA PAULISTA S/A',
    cnpj: '55.123.456/0001-89',
    ie: '109.876.543.210',
    cidade: 'São Paulo',
    uf: 'SP'
  },
  destinatario = {
    nome: 'DISTRIBUIDORA PARANAENSE DE AUTOPECAS LTDA',
    cnpj: '78.987.654/0001-32',
    ie: '901.234.567.890',
    logradouro: 'Rua Marechal Deodoro',
    numero: '850',
    bairro: 'Centro',
    cidade: 'Curitiba',
    uf: 'PR',
    cep: '80010010'
  }
}) {
  const chave = generateSEFAZAccessKey('35', '2609', emitente.cnpj, '57', serie, numero);

  return `<?xml version="1.0" encoding="UTF-8"?>
<cteProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/cte">
  <CTe xmlns="http://www.portalfiscal.inf.br/cte">
    <infCte versao="4.00" Id="CTe${chave}">
      <ide>
        <cUF>35</cUF>
        <cCT>${chave.slice(35, 43)}</cCT>
        <CFOP>6352</CFOP>
        <natOp>PRESTACAO DE SERVICO DE TRANSPORTE INTERESTADUAL</natOp>
        <mod>57</mod>
        <serie>${serie}</serie>
        <nCT>${numero}</nCT>
        <dhEmi>${dhEmi}</dhEmi>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>${chave.slice(43)}</cDV>
        <tpAmb>1</tpAmb>
        <tpCTe>0</tpCTe>
        <procEmi>0</procEmi>
        <verProc>4.00</verProc>
        <cMunIni>${origem.ibge}</cMunIni>
        <xMunIni>${origem.cidade}</xMunIni>
        <UFIni>${origem.uf}</UFIni>
        <cMunFim>${destino.ibge}</cMunFim>
        <xMunFim>${destino.cidade}</xMunFim>
        <UFFim>${destino.uf}</UFFim>
        <retira>1</retira>
        <indIEToma>1</indIEToma>
      </ide>
      <emit>
        <CNPJ>${emitente.cnpj.replace(/\D/g, '')}</CNPJ>
        <IE>${emitente.ie.replace(/\D/g, '')}</IE>
        <xNome>${emitente.nome}</xNome>
        <xFant>TRANSLOG EXPRESS</xFant>
        <enderEmit>
          <xLgr>${emitente.logradouro}</xLgr>
          <nro>${emitente.numero}</nro>
          <xBairro>${emitente.bairro}</xBairro>
          <cMun>${origem.ibge}</cMun>
          <xMun>${emitente.cidade}</xMun>
          <CEP>${emitente.cep}</CEP>
          <UF>${emitente.uf}</UF>
        </enderEmit>
      </emit>
      <rem>
        <CNPJ>${remetente.cnpj.replace(/\D/g, '')}</CNPJ>
        <IE>${remetente.ie.replace(/\D/g, '')}</IE>
        <xNome>${remetente.nome}</xNome>
        <enderReme>
          <xLgr>Av. Industrial</xLgr>
          <nro>1000</nro>
          <xBairro>Distrito Industrial</xBairro>
          <cMun>${origem.ibge}</cMun>
          <xMun>${remetente.cidade}</xMun>
          <UF>${remetente.uf}</UF>
        </enderReme>
      </rem>
      <dest>
        <CNPJ>${destinatario.cnpj.replace(/\D/g, '')}</CNPJ>
        <IE>${destinatario.ie.replace(/\D/g, '')}</IE>
        <xNome>${destinatario.nome}</xNome>
        <enderDest>
          <xLgr>${destinatario.logradouro}</xLgr>
          <nro>${destinatario.numero}</nro>
          <xBairro>${destinatario.bairro}</xBairro>
          <cMun>${destino.ibge}</cMun>
          <xMun>${destinatario.cidade}</xMun>
          <CEP>${destinatario.cep}</CEP>
          <UF>${destinatario.uf}</UF>
        </enderDest>
      </dest>
      <vPrest>
        <vTPrest>${valorFrete.toFixed(2)}</vTPrest>
        <vRec>${valorFrete.toFixed(2)}</vRec>
        <Comp>
          <xNome>FRETE PESO</xNome>
          <vComp>${(valorFrete * 0.85).toFixed(2)}</vComp>
        </Comp>
        <Comp>
          <xNome>GRIS / SEGURO</xNome>
          <vComp>${(valorFrete * 0.10).toFixed(2)}</vComp>
        </Comp>
        <Comp>
          <xNome>PEDAGIO</xNome>
          <vComp>${(valorFrete * 0.05).toFixed(2)}</vComp>
        </Comp>
      </vPrest>
      <infCTeNorm>
        <infCarga>
          <vCarga>${valorCarga.toFixed(2)}</vCarga>
          <proPred>AUTOPECAS E COMPONENTES MECANICOS</proPred>
          <infQ>
            <cUnid>01</cUnid>
            <tpMed>PESO BRUTO</tpMed>
            <qCarga>${peso.toFixed(2)}</qCarga>
          </infQ>
        </infCarga>
        <infModal versaoModal="4.00">
          <rodo>
            <RNTRC>12345678</RNTRC>
            <moto>
              <xNome>${motorista.nome}</xNome>
              <CPF>${motorista.cpf.replace(/\D/g, '')}</CPF>
            </moto>
          </rodo>
        </infModal>
      </infCTeNorm>
    </infCte>
  </CTe>
  <protCTe versao="4.00">
    <infProt>
      <tpAmb>1</tpAmb>
      <verAplic>SP_CTE_V400</verAplic>
      <chCTe>${chave}</chCTe>
      <dhRecbto>${dhEmi}</dhRecbto>
      <nProt>1352600${Math.floor(1000000 + Math.random() * 9000000)}</nProt>
      <digVal>K1L2M3N4O5P6Q7R8S9T0U1V2W3X=</digVal>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso do CT-e</xMotivo>
    </infProt>
  </protCTe>
</cteProc>`;
}

// Generate realistic MDF-e XML
function generateMDFeXML({
  numero = 581,
  serie = 1,
  dhEmi = '2026-09-15T11:00:00-03:00',
  motorista = { nome: 'CARLOS EDUARDO SILVA', cpf: '12345678901' },
  ufOrigem = 'SP',
  ufDestino = 'PR',
  valorCarga = 158400.00,
  pesoCarga = 24800.00,
  veiculo = { placa: 'ABC4D56', uf: 'SP', rntrc: '12345678' },
  ctesRelacionados = []
}) {
  const emitenteCnpj = '04.882.311/0001-45';
  const chave = generateSEFAZAccessKey('35', '2609', emitenteCnpj, '58', serie, numero);

  const ctesXml = ctesRelacionados.map(cKey => `
          <infCTe>
            <chCTe>${cKey}</chCTe>
          </infCTe>
  `).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<mdfeProc versao="3.00" xmlns="http://www.portalfiscal.inf.br/mdfe">
  <MDFe xmlns="http://www.portalfiscal.inf.br/mdfe">
    <infMDFe versao="3.00" Id="MDFe${chave}">
      <ide>
        <cUF>35</cUF>
        <tpAmb>1</tpAmb>
        <tpEmit>1</tpEmit>
        <tpTransp>1</tpTransp>
        <mod>58</mod>
        <serie>${serie}</serie>
        <nMDF>${numero}</nMDF>
        <cMDF>${chave.slice(35, 43)}</cMDF>
        <cDV>${chave.slice(43)}</cDV>
        <modal>1</modal>
        <dhEmi>${dhEmi}</dhEmi>
        <tpEmis>1</tpEmis>
        <procEmi>0</procEmi>
        <verProc>3.00</verProc>
        <UFIni>${ufOrigem}</UFIni>
        <UFFim>${ufDestino}</UFFim>
        <infMunCarrega>
          <cMunCarrega>3550308</cMunCarrega>
          <xMunCarrega>SAO PAULO</xMunCarrega>
        </infMunCarrega>
      </ide>
      <emit>
        <CNPJ>${emitenteCnpj.replace(/\D/g, '')}</CNPJ>
        <IE>112456789110</IE>
        <xNome>TRANSLOG EXPRESS TRANSPORTES LTDA</xNome>
        <xFant>TRANSLOG EXPRESS</xFant>
        <enderEmit>
          <xLgr>Av. das Nações Unidas</xLgr>
          <nro>14261</nro>
          <xBairro>Vila Gertrudes</xBairro>
          <cMun>3550308</cMun>
          <xMun>SAO PAULO</xMun>
          <CEP>04794000</CEP>
          <UF>${ufOrigem}</UF>
        </enderEmit>
      </emit>
      <infModal versaoModal="3.00">
        <rodo>
          <infANTT>
            <RNTRC>${veiculo.rntrc}</RNTRC>
          </infANTT>
          <veicTracao>
            <cInt>VEIC01</cInt>
            <placa>${veiculo.placa}</placa>
            <tara>8500</tara>
            <capKG>30000</capKG>
            <tpRod>02</tpRod>
            <tpCar>02</tpCar>
            <UF>${veiculo.uf}</UF>
          </veicTracao>
          <moto>
            <xNome>${motorista.nome}</xNome>
            <CPF>${motorista.cpf.replace(/\D/g, '')}</CPF>
          </moto>
        </rodo>
      </infModal>
      <infDoc>
        <infMunDescarga>
          <cMunDescarga>4106902</cMunDescarga>
          <xMunDescarga>CURITIBA</xMunDescarga>
          ${ctesXml || `
          <infCTe>
            <chCTe>35260904882311000145570010000010421876543210</chCTe>
          </infCTe>
          `}
        </infMunDescarga>
      </infDoc>
      <tot>
        <qCTe>${ctesRelacionados.length || 1}</qCTe>
        <vCarga>${valorCarga.toFixed(2)}</vCarga>
        <cUnid>01</cUnid>
        <qCarga>${pesoCarga.toFixed(2)}</qCarga>
      </tot>
    </infMDFe>
  </MDFe>
  <protMDFe versao="3.00">
    <infProt>
      <tpAmb>1</tpAmb>
      <verAplic>SP_MDFE_V300</verAplic>
      <chMDFe>${chave}</chMDFe>
      <dhRecbto>${dhEmi}</dhRecbto>
      <nProt>1352600${Math.floor(1000000 + Math.random() * 9000000)}</nProt>
      <digVal>A1B2C3D4E5F6G7H8I9J0K1L2M3N=</digVal>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso do MDF-e</xMotivo>
    </infProt>
  </protMDFe>
</mdfeProc>`;
}

/**
 * Seed sample data with realistic Brazilian routes and drivers
 */
function seedSampleData() {
  const drivers = [
    { nome: 'CARLOS EDUARDO SILVA', cpf: '12345678901' },
    { nome: 'MARCOS ANTONIO PEREIRA', cpf: '98765432100' },
    { nome: 'ROBERTO SANTOS OLIVEIRA', cpf: '45678912345' },
    { nome: 'FERNANDO ALMEIDA COSTA', cpf: '78912345678' },
    { nome: 'JULIANO BARBOSA LIMA', cpf: '32165498712' }
  ];

  const routes = [
    {
      origem: { cidade: 'São Paulo', uf: 'SP', ibge: '3550308' },
      destino: { cidade: 'Curitiba', uf: 'PR', ibge: '4106902' },
      frete: 4250.00,
      carga: 88500.00,
      peso: 15200.00,
      veiculo: { placa: 'RTA3B89', uf: 'SP', rntrc: '12889944' }
    },
    {
      origem: { cidade: 'Belo Horizonte', uf: 'MG', ibge: '3106200' },
      destino: { cidade: 'Rio de Janeiro', uf: 'RJ', ibge: '3304557' },
      frete: 3600.00,
      carga: 72000.00,
      peso: 12100.00,
      veiculo: { placa: 'MGX9F22', uf: 'MG', rntrc: '99223311' }
    },
    {
      origem: { cidade: 'Itajaí', uf: 'SC', ibge: '4208203' },
      destino: { cidade: 'Porto Alegre', uf: 'RS', ibge: '4314902' },
      frete: 5120.00,
      carga: 114000.00,
      peso: 19800.00,
      veiculo: { placa: 'SCK4H77', uf: 'SC', rntrc: '44556677' }
    },
    {
      origem: { cidade: 'Goiânia', uf: 'GO', ibge: '5208707' },
      destino: { cidade: 'São Paulo', uf: 'SP', ibge: '3550308' },
      frete: 6480.00,
      carga: 145000.00,
      peso: 22400.00,
      veiculo: { placa: 'GOZ7E11', uf: 'GO', rntrc: '88112233' }
    },
    {
      origem: { cidade: 'Campinas', uf: 'SP', ibge: '3509502' },
      destino: { cidade: 'Belo Horizonte', uf: 'MG', ibge: '3106200' },
      frete: 3950.00,
      carga: 81200.00,
      peso: 13900.00,
      veiculo: { placa: 'BRL8A55', uf: 'SP', rntrc: '33445566' }
    }
  ];

  const results = [];
  const now = new Date();

  routes.forEach((route, index) => {
    const driver = drivers[index % drivers.length];
    
    // Dates distributed across current month
    const docDate = new Date(now);
    docDate.setDate(now.getDate() - (index * 3 + 1));
    const dhEmi = docDate.toISOString();

    // 1. Generate CT-e
    const cteNumero = 2040 + index;
    const cteXml = generateCTeXML({
      numero: cteNumero,
      serie: 1,
      dhEmi,
      motorista: driver,
      origem: route.origem,
      destino: route.destino,
      valorFrete: route.frete,
      valorCarga: route.carga,
      peso: route.peso
    });

    const cteResult = parseAndStoreXML(cteXml, `CTE_${cteNumero}.xml`);
    results.push(cteResult);

    // 2. Generate MDF-e relating to this CT-e
    const mdfeNumero = 810 + index;
    const mdfeXml = generateMDFeXML({
      numero: mdfeNumero,
      serie: 1,
      dhEmi,
      motorista: driver,
      ufOrigem: route.origem.uf,
      ufDestino: route.destino.uf,
      valorCarga: route.carga,
      pesoCarga: route.peso,
      veiculo: route.veiculo,
      ctesRelacionados: [cteResult.chave_acesso]
    });

    const mdfeResult = parseAndStoreXML(mdfeXml, `MDFE_${mdfeNumero}.xml`);
    results.push(mdfeResult);
  });

  return results;
}

module.exports = {
  generateCTeXML,
  generateMDFeXML,
  seedSampleData
};
