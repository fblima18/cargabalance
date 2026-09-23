const assert = require('node:assert');
const { execute } = require('../src/database/db');
const { seedAttachedDacteAndDamdfe } = require('../src/services/seedAttachedDacte');
const { 
  getAllDriversWithBalance, 
  createDriver, 
  updateDriver, 
  getDriverById 
} = require('../src/services/driverService');
const { getFilteredDocuments, getInterstateManifestos } = require('../src/services/documentService');
const { generateExcelReport } = require('../src/services/excelExporter');
const { extractXMLPreview, parseAndStoreXML } = require('../src/services/xmlParser');

console.log('--- TESTE: COMISSÕES 75%, MEMÓRIA DE MOTORISTAS & DACTE/DAMDFE ANEXOS ---');

// Clean up any previous test driver with this CPF
execute('DELETE FROM motoristas WHERE cpf = ?', ['999.888.777-66']);

// 1. Driver Creation & Memory
console.log('1. Testando cadastro e edição de motorista com comissão de 75%...');
const testDriver = createDriver({
  nome: 'VALDIR RODRIGUES PEREIRA',
  cpf: '999.888.777-66',
  cnh: '98765432101',
  percentual_comissao: 75.0,
  telefone: '(82) 98888-7777',
  chave_pix: '99988877766'
});

assert.strictEqual(testDriver.nome, 'VALDIR RODRIGUES PEREIRA');
assert.strictEqual(testDriver.percentual_comissao, 75.0);
assert.strictEqual(testDriver.telefone, '(82) 98888-7777');
console.log('✓ Motorista criado com 75% de comissão.');

// Update driver
const updatedDriver = updateDriver(testDriver.id, {
  nome: 'VALDIR RODRIGUES PEREIRA JR',
  percentual_comissao: 75.0,
  telefone: '(82) 99999-0000'
});
assert.strictEqual(updatedDriver.nome, 'VALDIR RODRIGUES PEREIRA JR');
assert.strictEqual(updatedDriver.telefone, '(82) 99999-0000');
console.log('✓ Memória e edição de motorista persistida com sucesso.');

// 2. Ingest Attached DACTE & DAMDFE
console.log('2. Testando importação dos dados reais do DACTE 3199 e DAMDFE 1267...');
const seedResult = seedAttachedDacteAndDamdfe();
assert.strictEqual(seedResult.success, true);
assert.strictEqual(seedResult.driver.nome, 'JOSE ANTONIO LINS DE A');
assert.strictEqual(seedResult.driver.cpf, '045.070.404-18');
assert.strictEqual(seedResult.cte.numero, 3199);
assert.strictEqual(seedResult.cte.frete, 8925.00);
assert.strictEqual(seedResult.cte.icms, 1071.00);
assert.strictEqual(seedResult.cte.comissao, 6693.75); // Exactly 75% of R$ 8.925,00
assert.strictEqual(seedResult.cte.origem, 'RIO LARGO/AL');
assert.strictEqual(seedResult.cte.destino, 'JUAZEIRO DO NORTE/CE');
assert.strictEqual(seedResult.mdfe.numero, 1267);
assert.strictEqual(seedResult.mdfe.percurso, 'PE');
assert.strictEqual(seedResult.mdfe.carga, 91553.24);
assert.strictEqual(seedResult.mdfe.peso, 10384.0);
console.log('✓ DACTE 3199 e DAMDFE 1267 importados com todos os campos validados.');

// 3. Test Interstate Manifestos Query
console.log('3. Testando consulta da aba de Manifestos Interestaduais...');
const manifestos = getInterstateManifestos();
assert(manifestos.length >= 1, 'Deve conter pelo menos 1 manifesto interestadual.');
const mdfe1267 = manifestos.find(m => m.numero === 1267);
assert(mdfe1267, 'MDF-e 1267 deve estar na lista.');
assert.strictEqual(mdfe1267.uf_origem, 'AL');
assert.strictEqual(mdfe1267.uf_destino, 'CE');
assert.strictEqual(mdfe1267.ufs_percurso, 'PE');
console.log(`✓ Manifesto 1267 listado com sucesso na rota AL -> CE (Percurso: ${mdfe1267.ufs_percurso}).`);

// 4. Test Balance and KPI Calculations
console.log('4. Testando KPIs de frete, ICMS e comissão de 75%...');
const filtered = getFilteredDocuments({ docType: 'all' });
assert(filtered.kpis.totalComissao75 > 0, 'TotalComissao75 deve ser maior que zero.');
assert(filtered.kpis.totalICMS > 0, 'TotalICMS deve ser maior que zero.');
console.log(`✓ KPIs validados: Frete R$ ${filtered.kpis.totalFrete}, ICMS R$ ${filtered.kpis.totalICMS}, Comissão 75% R$ ${filtered.kpis.totalComissao75}`);

// 5. Test Excel Export with Commission & ICMS
console.log('5. Testando geração de planilha Excel com colunas de Frete, ICMS e Comissão 75%...');
generateExcelReport(filtered.items, filtered.kpis, {})
  .then((buffer) => {
    assert(Buffer.isBuffer(buffer));
    assert.strictEqual(buffer[0], 0x50);
    assert.strictEqual(buffer[1], 0x4B);
    console.log(`✓ Planilha Excel gerada com sucesso (${buffer.length} bytes).`);

    // 6. Test Complete Information via XML (Preview & Extraction)
    console.log('6. Testando opção de completar informações através do XML...');
    const fs = require('node:fs');
    const path = require('node:path');
    const cteXmlPath = path.resolve(__dirname, '../uploads/xml/27260920664328000110570010000031991000060010.xml');
    const cteXmlContent = fs.readFileSync(cteXmlPath, 'utf-8');
    
    const preview = extractXMLPreview(cteXmlContent);
    assert.strictEqual(preview.tipo, 'CT-e');
    assert.strictEqual(preview.numero, 3199);
    assert.strictEqual(preview.valor_frete, 8925.00);
    assert.strictEqual(preview.valor_icms, 1071.00);
    assert.strictEqual(preview.valor_comissao_75, 6693.75);
    assert.strictEqual(preview.origem.cidade, 'RIO LARGO');
    assert.strictEqual(preview.destino.cidade, 'JUAZEIRO DO NORTE');
    assert.strictEqual(preview.interestadual, true);
    assert.strictEqual(preview.motorista.nome, 'JOSE ANTONIO LINS DE A');
    assert.strictEqual(preview.motorista.cpf, '045.070.404-18');
    console.log('✓ Informações extraídas via XML com precisão (Motorista, Rota, Frete, ICMS, 75% Comissão, Manifesto).');

    console.log('\n🎉 TODOS OS TESTES DE COMISSÃO, DACTE ANEXO E COMPLETAR VIA XML PASSARAM COM SUCESSO!');
  })
  .catch((err) => {
    console.error('Erro:', err);
    process.exit(1);
  });
