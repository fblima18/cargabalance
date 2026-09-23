/**
 * Sample Data Service for CT-e and MDF-e.
 * Generates realistic SEFAZ XML fixtures for immediate testing, demo and auditing.
 */

const fs = require('node:fs');
const path = require('node:path');

const SAMPLE_DRIVERS = [
  { nome: 'Carlos Alberto Souza', cpf: '123.456.789-01', cnh: '98765432100' },
  { nome: 'Marcelo Ferreira Lima', cpf: '234.567.890-12', cnh: '87654321099' },
  { nome: 'Antonio Marcos da Silva', cpf: '345.678.901-23', cnh: '76543210988' },
  { nome: 'Rogério Pereira Santos', cpf: '456.789.012-34', cnh: '65432109877' },
  { nome: 'Eduardo Ribeiro Costa', cpf: '567.890.123-45', cnh: '54321098766' }
];

const SAMPLE_ROUTES = [
  { origMun: 'São Paulo', origUf: 'SP', destMun: 'Curitiba', destUf: 'PR' },
  { origMun: 'Santos', origUf: 'SP', destMun: 'Belo Horizonte', destUf: 'MG' },
  { origMun: 'Campinas', origUf: 'SP', destMun: 'Rio de Janeiro', destUf: 'RJ' },
  { origMun: 'Goiânia', origUf: 'GO', destMun: 'Cuiabá', destUf: 'MT' },
  { origMun: 'Porto Alegre', origUf: 'RS', destMun: 'Florianópolis', destUf: 'SC' },
  { origMun: 'Salvador', origUf: 'BA', destMun: 'Recife', destUf: 'PE' },
  { origMun: 'Ribeirão Preto', origUf: 'SP', destMun: 'Brasília', destUf: 'DF' },
  { origMun: 'Joinville', origUf: 'SC', destMun: 'São Paulo', destUf: 'SP' }
];

/**
 * Builds a realistic SEFAZ CT-e XML string
 */
function buildSampleCteXml({ chave, numero, serie, dhEmi, driver, route, valorFrete }) {
  const cleanCpf = driver.cpf.replace(/\D/g, '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<cteProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/cte">
  <CTe xmlns="http://www.portalfiscal.inf.br/cte">
    <infCte versao="4.00" Id="CTe${chave}">
      <ide>
        <cUF>35</cUF>
        <cCT>00123456</cCT>
        <CFOP>5353</CFOP>
        <natOp>PRESTACAO DE SERVICO DE TRANSPORTE</natOp>
        <mod>57</mod>
        <serie>${serie}</serie>
        <nCT>${numero}</nCT>
        <dhEmi>${dhEmi}</dhEmi>
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>${chave.slice(-1)}</cDV>
        <tpAmb>1</tpAmb>
        <tpCTe>0</tpCTe>
        <procEmi>0</procEmi>
        <verProc>1.0</verProc>
        <cMunIni>3550308</cMunIni>
        <xMunIni>${route.origMun}</xMunIni>
        <UFIni>${route.origUf}</UFIni>
        <cMunFim>4106902</cMunFim>
        <xMunFim>${route.destMun}</xMunFim>
        <UFFim>${route.destUf}</UFFim>
        <retira>1</retira>
      </ide>
      <emit>
        <CNPJ>12345678000195</CNPJ>
        <IE>112233445566</IE>
        <xNome>TRANSPORTADORA LOGÍSTICA EXPRESSA LTDA</xNome>
        <xFant>LOG EXPRESS</xFant>
        <enderEmit>
          <xLgr>AV DAS NACOES UNIDAS</xLgr>
          <nro>12901</nro>
          <xBairro>BROOKLIN</xBairro>
          <cMun>3550308</cMun>
          <xMun>${route.origMun}</xMun>
          <CEP>04578000</CEP>
          <UF>${route.origUf}</UF>
        </enderEmit>
      </emit>
      <rem>
        <CNPJ>98765432000188</CNPJ>
        <IE>998877665544</IE>
        <xNome>INDUSTRIA BRASIL MANUFATURADOS S/A</xNome>
        <enderReme>
          <xLgr>ROD ANHANGUERA KM 102</xLgr>
          <nro>S/N</nro>
          <xBairro>DISTRITO INDUSTRIAL</xBairro>
          <cMun>3550308</cMun>
          <xMun>${route.origMun}</xMun>
          <UF>${route.origUf}</UF>
        </enderReme>
      </rem>
      <dest>
        <CNPJ>55443322000177</CNPJ>
        <IE>556677889900</IE>
        <xNome>COMERCIO VAREJISTA CENTRAL LTDA</xNome>
        <enderDest>
          <xLgr>RUA MARECHAL DEODORO</xLgr>
          <nro>500</nro>
          <xBairro>CENTRO</xBairro>
          <cMun>4106902</cMun>
          <xMun>${route.destMun}</xMun>
          <CEP>80010000</CEP>
          <UF>${route.destUf}</UF>
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
          <xNome>PEDAGIO</xNome>
          <vComp>${(valorFrete * 0.15).toFixed(2)}</vComp>
        </Comp>
      </vPrest>
      <infCTeNorm>
        <infCarga>
          <vCarga>${(valorFrete * 18.5).toFixed(2)}</vCarga>
          <proPred>CARGA GERAL / PRODUTOS MANUFATURADOS</proPred>
          <infQ>
            <cUnid>01</cUnid>
            <tpMed>PESO BRUTO</tpMed>
            <qCarga>14500.0000</qCarga>
          </infQ>
        </infCarga>
        <infModal versaoModal="4.00">
          <rodo>
            <RNTRC>12345678</RNTRC>
            <moto>
              <xNome>${driver.nome}</xNome>
              <CPF>${cleanCpf}</CPF>
              <cnh>${driver.cnh}</cnh>
            </moto>
          </rodo>
        </infModal>
      </infCTeNorm>
    </infCte>
  </CTe>
  <protCTe versao="4.00">
    <infProt>
      <tpAmb>1</tpAmb>
      <verAplic>SP_PL_CTE_400</verAplic>
      <chCTe>${chave}</chCTe>
      <dhRecbto>${dhEmi}</dhRecbto>
      <nProt>135260000012345</nProt>
      <digVal>qWertyUiOpAsDfGhJkLzXcVbNm=</digVal>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso do CT-e</xMotivo>
    </infProt>
  </protCTe>
</cteProc>`;
}

/**
 * Builds a realistic SEFAZ MDF-e XML string
 */
function buildSampleMdfeXml({ chave, numero, serie, dhEmi, driver, route, valorCarga, relatedCteKey }) {
  const cleanCpf = driver.cpf.replace(/\D/g, '');
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
        <cMDF>00987654</cMDF>
        <cDV>${chave.slice(-1)}</cDV>
        <modal>1</modal>
        <dhEmi>${dhEmi}</dhEmi>
        <tpEmis>1</tpEmis>
        <procEmi>0</procEmi>
        <verProc>3.00</verProc>
        <UFIni>${route.origUf}</UFIni>
        <UFFim>${route.destUf}</UFFim>
        <infMunCarrega>
          <cMunCarrega>3550308</cMunCarrega>
          <xMunCarrega>${route.origMun}</xMunCarrega>
        </infMunCarrega>
      </ide>
      <emit>
        <CNPJ>12345678000195</CNPJ>
        <IE>112233445566</IE>
        <xNome>TRANSPORTADORA LOGÍSTICA EXPRESSA LTDA</xNome>
        <xFant>LOG EXPRESS</xFant>
        <enderEmit>
          <xLgr>AV DAS NACOES UNIDAS</xLgr>
          <nro>12901</nro>
          <xBairro>BROOKLIN</xBairro>
          <cMun>3550308</cMun>
          <xMun>${route.origMun}</xMun>
          <CEP>04578000</CEP>
          <UF>${route.origUf}</UF>
        </enderEmit>
      </emit>
      <infModal versaoModal="3.00">
        <rodo>
          <infANTT>
            <RNTRC>12345678</RNTRC>
          </infANTT>
          <veicTracao>
            <cInt>V001</cInt>
            <placa>ABC1D23</placa>
            <RENAVAM>12345678901</RENAVAM>
            <tara>8500</tara>
            <capKG>25000</capKG>
            <tpRod>02</tpRod>
            <tpCar>02</tpCar>
            <UF>${route.origUf}</UF>
          </veicTracao>
          <moto>
            <xNome>${driver.nome}</xNome>
            <CPF>${cleanCpf}</CPF>
          </moto>
        </rodo>
      </infModal>
      <infDoc>
        <infMunDescarga>
          <cMunDescarga>4106902</cMunDescarga>
          <xMunDescarga>${route.destMun}</xMunDescarga>
          <infCTe>
            <chCTe>${relatedCteKey || '35260912345678000195570010000010011000010010'}</chCTe>
          </infCTe>
        </infMunDescarga>
      </infDoc>
      <tot>
        <qCTe>1</qCTe>
        <vCarga>${valorCarga.toFixed(2)}</vCarga>
        <cUnid>01</cUnid>
        <qCarga>14500.0000</qCarga>
      </tot>
    </infMDFe>
  </MDFe>
  <protMDFe versao="3.00">
    <infProt>
      <tpAmb>1</tpAmb>
      <verAplic>SP_PL_MDFE_300</verAplic>
      <chMDFe>${chave}</chMDFe>
      <dhRecbto>${dhEmi}</dhRecbto>
      <nProt>135260000098765</nProt>
      <digVal>zXcvBnMasDfGhJkLqWertyUiOp=</digVal>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso do MDF-e</xMotivo>
    </infProt>
  </protMDFe>
</mdfeProc>`;
}

/**
 * Generates an assortment of realistic test documents
 */
function generateDemoDataset() {
  const items = [];
  const baseYear = 2026;
  const baseMonth = 9; // September 2026

  // 12 CT-e documents and 6 related MDF-e documents
  for (let i = 1; i <= 14; i++) {
    const day = Math.min(18, Math.max(1, i + 1));
    const dayStr = String(day).padStart(2, '0');
    const hour = String(8 + (i % 10)).padStart(2, '0');
    const minute = String((i * 13) % 60).padStart(2, '0');
    const dhEmi = `${baseYear}-09-${dayStr}T${hour}:${minute}:00-03:00`;

    const driver = SAMPLE_DRIVERS[i % SAMPLE_DRIVERS.length];
    const route = SAMPLE_ROUTES[i % SAMPLE_ROUTES.length];
    const nCte = 1000 + i;
    const nMdfe = 200 + Math.ceil(i / 2);

    // Format 44-digit keys (SEFAZ model 57 and 58)
    const cteChave = `352609123456780001955700100000${String(nCte).padStart(4, '0')}1${String(10000000 + i).padStart(8, '0')}0`;
    const valorFrete = 1850.00 + (i * 340.50);

    const cteXml = buildSampleCteXml({
      chave: cteChave,
      numero: nCte,
      serie: 1,
      dhEmi,
      driver,
      route,
      valorFrete
    });

    items.push({
      type: 'CTE',
      filename: `CTE_${nCte}_${cteChave}.xml`,
      xmlContent: cteXml,
      chave: cteChave
    });

    // Pair every two CT-es with an MDF-e
    if (i % 2 === 0) {
      // MDF-e model 58 (44 digits)
      const mdfeChave = `352609123456780001955800100000${String(nMdfe).padStart(4, '0')}1${String(20000000 + i).padStart(8, '0')}0`;
      const valorCarga = 48000.00 + (i * 7500.00);

      const mdfeXml = buildSampleMdfeXml({
        chave: mdfeChave,
        numero: nMdfe,
        serie: 1,
        dhEmi,
        driver,
        route,
        valorCarga,
        relatedCteKey: cteChave
      });

      items.push({
        type: 'MDFE',
        filename: `MDFE_${nMdfe}_${mdfeChave}.xml`,
        xmlContent: mdfeXml,
        chave: mdfeChave
      });
    }
  }

  return items;
}

module.exports = {
  SAMPLE_DRIVERS,
  SAMPLE_ROUTES,
  buildSampleCteXml,
  buildSampleMdfeXml,
  generateDemoDataset
};
