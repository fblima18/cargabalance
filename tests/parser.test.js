const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const { parseAndStoreXML, formatCPF } = require('../src/services/xmlParser');
const { generateCTeXML, generateMDFeXML } = require('../src/services/sampleGenerator');
const { getFilteredDocuments, getAllDrivers } = require('../src/services/documentService');
const { generateExcelReport } = require('../src/services/excelExporter');
const { db } = require('../src/database/db');

console.log('--- INICIANDO TESTES DO SISTEMA DE AUDITORIA CT-e / MDF-e ---');

// Test 1: CPF Formatting
console.log('1. Testando formatação de CPF...');
assert.strictEqual(formatCPF('12345678901'), '123.456.789-01');
assert.strictEqual(formatCPF('123.456.789-01'), '123.456.789-01');
assert.strictEqual(formatCPF(''), '000.000.000-00');
console.log('✓ Formatação de CPF validada.');

// Test 2: Parse and Ingest CT-e
console.log('2. Testando parsing e gravação de CT-e...');
const cteXml = generateCTeXML({
  numero: 9901,
  serie: 1,
  dhEmi: '2026-09-18T10:00:00-03:00',
  motorista: { nome: 'JOAO TESTER DA SILVA', cpf: '11122233344' },
  origem: { cidade: 'Campinas', uf: 'SP', ibge: '3509502' },
  destino: { cidade: 'Ribeirão Preto', uf: 'SP', ibge: '3543402' },
  valorFrete: 2500.00,
  valorCarga: 50000.00
});

const cteResult = parseAndStoreXML(cteXml, 'teste_cte_9901.xml');
assert.strictEqual(cteResult.status, 'success');
assert.strictEqual(cteResult.type, 'CT-e');
assert.strictEqual(cteResult.numero, 9901);
assert.strictEqual(cteResult.valor, 2500.00);
assert.strictEqual(cteResult.cpf_motorista, '111.222.333-44');
assert.strictEqual(cteResult.motorista, 'JOAO TESTER DA SILVA');
console.log('✓ CT-e parseado e armazenado com sucesso.');

// Test 3: Duplicate CT-e Prevention
console.log('3. Testando prevenção de duplicidade de CT-e...');
const cteDupResult = parseAndStoreXML(cteXml, 'teste_cte_9901_dup.xml');
assert.strictEqual(cteDupResult.status, 'duplicate');
console.log('✓ Duplicidade de CT-e bloqueada com sucesso.');

// Test 4: Parse and Ingest MDF-e
console.log('4. Testando parsing e gravação de MDF-e...');
const mdfeXml = generateMDFeXML({
  numero: 8801,
  serie: 1,
  dhEmi: '2026-09-18T11:00:00-03:00',
  motorista: { nome: 'MARIA CONDUTORA', cpf: '55566677788' },
  ufOrigem: 'SP',
  ufDestino: 'RJ',
  valorCarga: 120000.00,
  ctesRelacionados: [cteResult.chave_acesso]
});

const mdfeResult = parseAndStoreXML(mdfeXml, 'teste_mdfe_8801.xml');
assert.strictEqual(mdfeResult.status, 'success');
assert.strictEqual(mdfeResult.type, 'MDF-e');
assert.strictEqual(mdfeResult.numero, 8801);
assert.strictEqual(mdfeResult.valor, 120000.00);
assert.strictEqual(mdfeResult.cpf_motorista, '555.666.777-88');
console.log('✓ MDF-e parseado e vinculado com sucesso.');

// Test 5: Query Documents and KPIs
console.log('5. Testando consultas filtradas e KPIs...');
const filtered = getFilteredDocuments({ docType: 'all' });
assert(filtered.items.length >= 2, 'Deveria conter pelo menos 2 documentos.');
assert(filtered.kpis.totalAmount >= 122500.00, 'TotalAmount deve somar fretes e cargas.');
assert.strictEqual(typeof filtered.kpis.averageTicket, 'number');
console.log(`✓ KPIs calculados: Total R$ ${filtered.kpis.totalAmount}, Docs: ${filtered.kpis.documentCount}, Ticket Médio: R$ ${filtered.kpis.averageTicket.toFixed(2)}`);

// Test 6: Excel Generation
console.log('6. Testando geração de planilha Excel (.xlsx)...');
generateExcelReport(filtered.items, filtered.kpis, { docType: 'all' })
  .then((buffer) => {
    assert(Buffer.isBuffer(buffer), 'Retorno deve ser um Buffer.');
    // Check ZIP/XLSX magic bytes (PK\x03\x04)
    assert.strictEqual(buffer[0], 0x50);
    assert.strictEqual(buffer[1], 0x4B);
    console.log(`✓ Planilha Excel gerada com sucesso (${buffer.length} bytes).`);
    console.log('\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO!');
  })
  .catch((err) => {
    console.error('Erro na geração de Excel:', err);
    process.exit(1);
  });
