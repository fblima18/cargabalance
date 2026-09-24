const { v4: uuidv4 } = require('uuid');
const path = require('node:path');
const fs = require('node:fs');
const { queryOne, execute } = require('../database/db');
const { getOrCreateDriver } = require('./xmlParser');

/**
 * Seed the exact attached DACTE (CT-e 3199) and DAMDFE (MDF-e 1267) from the user
 */
function seedAttachedDacteAndDamdfe() {
  // 1. Ensure driver 'JOSE ANTONIO LINS DE A' (CPF: 045.070.404-18) with 75% commission
  const driverCpf = '045.070.404-18';
  const driverNome = 'JOSE ANTONIO LINS DE A';
  
  let driver = queryOne('SELECT * FROM motoristas WHERE cpf = ?', [driverCpf]);
  if (!driver) {
    const driverId = uuidv4();
    execute(`
      INSERT INTO motoristas (
        id, nome, cpf, cnh, percentual_comissao, telefone, chave_pix, ativo
      ) VALUES (?, ?, ?, ?, 75.0, '(82) 99108-4205', '045.070.404-18', 1)
    `, [driverId, driverNome, driverCpf, '12345678900']);
    driver = queryOne('SELECT * FROM motoristas WHERE id = ?', [driverId]);
  } else {
    // Ensure 75% commission is set
    execute('UPDATE motoristas SET percentual_comissao = 75.0 WHERE id = ?', [driver.id]);
    driver = queryOne('SELECT * FROM motoristas WHERE id = ?', [driver.id]);
  }

  const uploadDir = path.resolve(__dirname, '../../uploads/xml');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // 2. Setup MDF-e 1267 (Série 3)
  const mdfeChave = '27260920664328000110580030000012671000482550';
  const mdfeNumero = 1267;
  const mdfeSerie = 3;
  const mdfeDataEmissao = '2026-09-19T08:46:00-03:00';
  const mdfeUfOrigem = 'AL';
  const mdfeUfDestino = 'CE';
  const mdfeUfsPercurso = 'PE';
  const mdfeValorCarga = 91553.24;
  const mdfePesoBruto = 10384.0;
  const mdfePlacaTracao = 'LQW0A19';
  const mdfePlacaReboque = 'MUV0J59';

  const mdfeExtras = {
    emitente: {
      nome: 'CENTRAL2023CENTRAL',
      cnpj: '20.664.328/0001-10',
      ie: '244101299',
      logradouro: 'AV AQUIDAUANA',
      numero: '145',
      bairro: 'SANTA LUCIA',
      municipio: 'MACEIO',
      uf: 'AL',
      cep: '57082-890',
      telefone: '(82) 9910-84205'
    },
    veiculo: {
      placa: mdfePlacaTracao,
      reboque: mdfePlacaReboque,
      uf: 'AL',
      rntrc: '052471433',
      proprietario: 'R K TRANSPORTES LTDA EPP - CNPJ 19.797.353/0001-92'
    },
    seguro: {
      apolice: '02798220210106540016',
      seguradora: 'ARGO SEGURO'
    },
    protocolo: '927260001478776',
    dhAutorizacao: mdfeDataEmissao,
    pesoBruto: mdfePesoBruto,
    qtdCTe: 1,
    valorFreteTotal: 8925.00,
    valorIcmsTotal: 1071.00,
    ctesRelacionados: ['27260920664328000110570010000031991000060010'],
    ufsPercurso: mdfeUfsPercurso,
    observacoes: 'Destino da prestação: JUAZEIRO DO NORTE/CE. UFs do percurso: PE. Transporte interestadual.'
  };

  const mdfeXmlPath = path.join(uploadDir, `${mdfeChave}.xml`);
  fs.writeFileSync(mdfeXmlPath, `<!-- MDF-e 1267 - CENTRAL2023CENTRAL -->
<mdfeProc versao="3.00" xmlns="http://www.portalfiscal.inf.br/mdfe">
  <MDFe>
    <infMDFe Id="MDFe${mdfeChave}">
      <ide>
        <nMDF>${mdfeNumero}</nMDF>
        <serie>${mdfeSerie}</serie>
        <dhEmi>${mdfeDataEmissao}</dhEmi>
        <UFIni>${mdfeUfOrigem}</UFIni>
        <UFFim>${mdfeUfDestino}</UFFim>
      </ide>
      <emit>
        <CNPJ>20664328000110</CNPJ>
        <xNome>CENTRAL2023CENTRAL</xNome>
      </emit>
      <tot>
        <vCarga>${mdfeValorCarga}</vCarga>
        <qCarga>${mdfePesoBruto}</qCarga>
      </tot>
      <infModal versaoModal="3.00">
        <rodo>
          <veicTracao>
            <placa>${mdfePlacaTracao}</placa>
          </veicTracao>
          <veicReboque>
            <placa>${mdfePlacaReboque}</placa>
          </veicReboque>
          <moto>
            <xNome>${driverNome}</xNome>
            <CPF>${driverCpf.replace(/\D/g, '')}</CPF>
          </moto>
        </rodo>
      </infModal>
    </infMDFe>
  </MDFe>
</mdfeProc>`, 'utf-8');

  const mdfeRemetenteNome = 'CENTRAL2023CENTRAL';
  const mdfeRemetenteCnpj = '20.664.328/0001-10';
  const mdfeDestinatarioNome = 'CARAJAS - FIL JUAZEIRO DO NORTE';
  const mdfeDestinatarioCnpj = '03.656.804/0016-18';
  const mdfeDataSaida = '2026-09-19T08:46:00-03:00';
  const mdfePrevisaoChegada = '2026-09-20T18:00:00-03:00';

  let mdfeId = uuidv4();
  const existingMdfe = queryOne('SELECT id FROM manifestos_mdfe WHERE chave_acesso = ?', [mdfeChave]);
  if (!existingMdfe) {
    execute(`
      INSERT INTO manifestos_mdfe (
        id, chave_acesso, numero, serie, data_emissao,
        uf_origem, uf_destino, ufs_percurso,
        remetente_nome, remetente_cnpj, destinatario_nome, destinatario_cnpj,
        data_saida, previsao_chegada,
        placa_tracao, placa_reboque,
        peso_bruto, motorista_id, valor_total_carga, caminho_xml, dados_extras
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      mdfeId, mdfeChave, mdfeNumero, mdfeSerie, mdfeDataEmissao,
      mdfeUfOrigem, mdfeUfDestino, mdfeUfsPercurso,
      mdfeRemetenteNome, mdfeRemetenteCnpj, mdfeDestinatarioNome, mdfeDestinatarioCnpj,
      mdfeDataSaida, mdfePrevisaoChegada,
      mdfePlacaTracao, mdfePlacaReboque,
      mdfePesoBruto, driver.id, mdfeValorCarga, mdfeXmlPath, JSON.stringify(mdfeExtras)
    ]);
  } else {
    mdfeId = existingMdfe.id;
    execute(`
      UPDATE manifestos_mdfe SET
        ufs_percurso = ?, remetente_nome = ?, remetente_cnpj = ?,
        destinatario_nome = ?, destinatario_cnpj = ?,
        data_saida = ?, previsao_chegada = ?
      WHERE id = ?
    `, [
      mdfeUfsPercurso, mdfeRemetenteNome, mdfeRemetenteCnpj,
      mdfeDestinatarioNome, mdfeDestinatarioCnpj,
      mdfeDataSaida, mdfePrevisaoChegada,
      mdfeId
    ]);
  }

  // 3. Setup CT-e 3199 (Série 1)
  const cteChave = '27260920664328000110570010000031991000060010';
  const cteNumero = 3199;
  const cteSerie = 1;
  const cteDataEmissao = '2026-09-19T08:43:00-03:00';
  const cteCidadeOrigem = 'RIO LARGO';
  const cteUfOrigem = 'AL';
  const cteCidadeDestino = 'JUAZEIRO DO NORTE';
  const cteUfDestino = 'CE';
  const cteValorFrete = 8925.00;
  const cteValorIcms = 1071.00; // 12%
  const cteValorImpostosTotal = 1357.67; // ICMS 1071 + PIS 51.05 + COFINS 235.62
  const cteComissao75 = Math.round(cteValorFrete * 0.75 * 100) / 100; // R$ 6.693,75
  const cteInterestadual = 1; // Outside AL!

  const cteExtras = {
    emitente: {
      nome: 'CENTRAL2023CENTRAL',
      cnpj: '20.664.328/0001-10',
      ie: '244101299',
      rntrc: '52471433',
      logradouro: 'AV AQUIDAUANA',
      numero: '145',
      bairro: 'SANTA LUCIA',
      municipio: 'MACEIO',
      uf: 'AL',
      cep: '57082-890',
      telefone: '(82) 9910-84205'
    },
    remetente: {
      nome: 'CARAJAS MATERIAL DE CONSTRUCAO LTDA',
      cnpj_cpf: '03.656.804/0007-27',
      ie: '242219004',
      logradouro: 'LOT SANTA MARIA 194 MATA DO ROLO',
      municipio: 'RIO LARGO',
      uf: 'AL',
      cep: '57100-000',
      telefone: '(82) 4009-2292'
    },
    destinatario: {
      nome: 'CARAJAS - FIL JUAZEIRO DO NORTE',
      cnpj_cpf: '03.656.804/0016-18',
      ie: '067354874',
      logradouro: 'R MOACIR GONDIN LOCIO 1140 SAO JOSE',
      municipio: 'JUAZEIRO DO NORTE',
      uf: 'CE',
      cep: '63024-515',
      telefone: '(82) 99606-3336'
    },
    tomador: {
      nome: 'CARAJAS MATERIAL DE CONSTRUCAO LTDA',
      cnpj_cpf: '03.656.804/0007-27',
      municipio: 'RIO LARGO',
      uf: 'AL'
    },
    valores: {
      valorTotalServico: cteValorFrete,
      valorReceber: cteValorFrete,
      freteValor: cteValorFrete,
      componentes: [
        { xNome: 'FRETE VALOR', vComp: cteValorFrete }
      ]
    },
    impostos: {
      situacaoTributaria: 'NORMAL',
      baseCalculo: 8925.00,
      aliquotaIcms: 12.0,
      valorIcms: cteValorIcms,
      ibsEstadual: 7.57,
      cbs: 68.11,
      pis: 51.05,
      cofins: 235.62,
      totalTributos: cteValorImpostosTotal
    },
    carga: {
      produtoPredominante: 'REFRIG 474L MUL',
      especie: 'DIVERSOS',
      valorMercadoria: 91553.24,
      quantidadeVolumes: 2921,
      pesoBruto: 10384.048,
      pesoCalculo: 10384.048
    },
    veiculo: {
      placaTracao: mdfePlacaTracao,
      placaReboque: mdfePlacaReboque,
      romaneio: '81573'
    },
    seguro: {
      apolice: '02798220210106540016',
      seguradora: 'ARGO SEGURO'
    },
    protocolo: '327260015901193',
    dhAutorizacao: cteDataEmissao,
    cfop: '6353 - Transp a est comercial',
    nomeArquivoOriginal: 'DACTE_3199_ANEXO.pdf'
  };

  const cteXmlPath = path.join(uploadDir, `${cteChave}.xml`);
  fs.writeFileSync(cteXmlPath, `<!-- CT-e 3199 - CENTRAL2023CENTRAL -->
<cteProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/cte">
  <CTe>
    <infCte Id="CTe${cteChave}">
      <ide>
        <nCT>${cteNumero}</nCT>
        <serie>${cteSerie}</serie>
        <dhEmi>${cteDataEmissao}</dhEmi>
        <xMunIni>${cteCidadeOrigem}</xMunIni>
        <UFIni>${cteUfOrigem}</UFIni>
        <xMunFim>${cteCidadeDestino}</xMunFim>
        <UFFim>${cteUfDestino}</UFFim>
        <CFOP>6353</CFOP>
      </ide>
      <emit>
        <CNPJ>20664328000110</CNPJ>
        <xNome>CENTRAL2023CENTRAL</xNome>
      </emit>
      <vPrest>
        <vTPrest>${cteValorFrete}</vTPrest>
        <vRec>${cteValorFrete}</vRec>
      </vPrest>
      <imp>
        <ICMS>
          <ICMS00>
            <vBC>${cteValorFrete}</vBC>
            <pICMS>12.00</pICMS>
            <vICMS>${cteValorIcms}</vICMS>
          </ICMS00>
        </ICMS>
      </imp>
      <infCTeNorm>
        <infCarga>
          <vCarga>91553.24</vCarga>
          <infQ>
            <qCarga>10384.048</qCarga>
          </infQ>
        </infCarga>
        <infModal versaoModal="4.00">
          <rodo>
            <veicTracao>
              <placa>${mdfePlacaTracao}</placa>
            </veicTracao>
            <moto>
              <xNome>${driverNome}</xNome>
              <CPF>${driverCpf.replace(/\D/g, '')}</CPF>
            </moto>
          </rodo>
        </infModal>
      </infCTeNorm>
    </infCte>
  </CTe>
</cteProc>`, 'utf-8');

  const cteRemetenteNome = 'CARAJAS MATERIAL DE CONSTRUCAO LTDA';
  const cteRemetenteCnpj = '03.656.804/0007-27';
  const cteDestinatarioNome = 'CARAJAS - FIL JUAZEIRO DO NORTE';
  const cteDestinatarioCnpj = '03.656.804/0016-18';
  const cteDataSaida = '2026-09-19T08:43:00-03:00';
  const ctePrevisaoChegada = '2026-09-20T18:00:00-03:00';
  const cteUfsPercurso = 'PE';

  let cteId = uuidv4();
  const existingCte = queryOne('SELECT id FROM conhecimentos_cte WHERE chave_acesso = ?', [cteChave]);
  if (!existingCte) {
    execute(`
      INSERT INTO conhecimentos_cte (
        id, manifesto_id, motorista_id, chave_acesso, numero, serie,
        data_emissao, cidade_origem, uf_origem, cidade_destino, uf_destino,
        ufs_percurso, remetente_nome, remetente_cnpj, destinatario_nome, destinatario_cnpj,
        data_saida, previsao_chegada,
        valor_frete, valor_icms, valor_impostos_total, valor_comissao_motorista,
        interestadual, caminho_xml, dados_extras
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      cteId, mdfeId, driver.id, cteChave, cteNumero, cteSerie,
      cteDataEmissao, cteCidadeOrigem, cteUfOrigem, cteCidadeDestino, cteUfDestino,
      cteUfsPercurso, cteRemetenteNome, cteRemetenteCnpj, cteDestinatarioNome, cteDestinatarioCnpj,
      cteDataSaida, ctePrevisaoChegada,
      cteValorFrete, cteValorIcms, cteValorImpostosTotal, cteComissao75,
      cteInterestadual, cteXmlPath, JSON.stringify(cteExtras)
    ]);
  } else {
    cteId = existingCte.id;
    // Update with full fields and linked MDF-e
    execute(`
      UPDATE conhecimentos_cte SET
        manifesto_id = ?,
        motorista_id = ?,
        ufs_percurso = ?,
        remetente_nome = ?,
        remetente_cnpj = ?,
        destinatario_nome = ?,
        destinatario_cnpj = ?,
        data_saida = ?,
        previsao_chegada = ?,
        valor_icms = ?,
        valor_impostos_total = ?,
        valor_comissao_motorista = ?,
        interestadual = ?,
        dados_extras = ?
      WHERE id = ?
    `, [
      mdfeId, driver.id,
      cteUfsPercurso, cteRemetenteNome, cteRemetenteCnpj,
      cteDestinatarioNome, cteDestinatarioCnpj,
      cteDataSaida, ctePrevisaoChegada,
      cteValorIcms, cteValorImpostosTotal, cteComissao75,
      cteInterestadual, JSON.stringify(cteExtras), cteId
    ]);
  }

  return {
    success: true,
    message: 'DACTE (CT-e 3199) e DAMDFE (MDF-e 1267) anexos importados com sucesso!',
    driver: {
      id: driver.id,
      nome: driver.nome,
      cpf: driver.cpf,
      comissao_75: cteComissao75
    },
    cte: {
      id: cteId,
      numero: cteNumero,
      chave: cteChave,
      origem: `${cteCidadeOrigem}/${cteUfOrigem}`,
      destino: `${cteCidadeDestino}/${cteUfDestino}`,
      frete: cteValorFrete,
      icms: cteValorIcms,
      comissao: cteComissao75
    },
    mdfe: {
      id: mdfeId,
      numero: mdfeNumero,
      chave: mdfeChave,
      origem: mdfeUfOrigem,
      destino: mdfeUfDestino,
      percurso: mdfeUfsPercurso,
      carga: mdfeValorCarga,
      peso: mdfePesoBruto
    }
  };
}

module.exports = {
  seedAttachedDacteAndDamdfe
};
