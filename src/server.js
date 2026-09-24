const express = require('express');
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');

const { parseAndStoreXML, extractXMLPreview } = require('./services/xmlParser');
const { 
  getFilteredDocuments, 
  getInterstateManifestos, 
  getDocumentByKey,
  createManualTrip,
  deleteDocument
} = require('./services/documentService');
const { 
  getAllDriversWithBalance, 
  getDriverById, 
  createDriver, 
  updateDriver, 
  deleteDriver,
  batchDeleteDrivers,
  getDriversAnalytics
} = require('./services/driverService');
const { generateExcelReport } = require('./services/excelExporter');
const { seedSampleData } = require('./services/sampleGenerator');
const { seedAttachedDacteAndDamdfe } = require('./services/seedAttachedDacte');
const { 
  getAllFreightRules, 
  getFreightRuleById, 
  createFreightRule, 
  updateFreightRule, 
  deleteFreightRule, 
  calculateFreightQuote,
  seedFreightRepositoryIfNeeded 
} = require('./services/freightRepositoryService');
const { 
  scanDriversExcel, 
  importScannedDrivers, 
  generateDriverTemplateExcel 
} = require('./services/driverExcelService');
const { queryOne } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Setup Multer memory storage for multi-file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 50
  },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// API Routes

/**
 * 1. Filtered Documents & Balance Summary (CT-e & MDF-e)
 */
app.get('/api/documents', (req, res) => {
  try {
    const filters = {
      startDate: req.query.startDate || '',
      endDate: req.query.endDate || '',
      driverId: req.query.driverId || 'all',
      docType: req.query.docType || 'all',
      destination: req.query.destination || '',
      search: req.query.search || '',
      searchType: req.query.searchType || 'all',
      interstateOnly: req.query.interstateOnly || false
    };

    const data = getFilteredDocuments(filters);
    res.json({
      success: true,
      kpis: data.kpis,
      items: data.items
    });
  } catch (err) {
    console.error('[API /documents error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 2. Dedicated Interstate Manifestos (MDF-e)
 */
app.get('/api/manifestos', (req, res) => {
  try {
    const filters = {
      startDate: req.query.startDate || '',
      endDate: req.query.endDate || '',
      driverId: req.query.driverId || 'all',
      search: req.query.search || '',
      searchType: req.query.searchType || 'all'
    };

    const manifestos = getInterstateManifestos(filters);
    res.json({
      success: true,
      count: manifestos.length,
      manifestos
    });
  } catch (err) {
    console.error('[API /manifestos error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3. Driver Management & Memory CRUD
 */
app.get('/api/drivers', (req, res) => {
  try {
    const drivers = getAllDriversWithBalance();
    res.json({ success: true, drivers });
  } catch (err) {
    console.error('[API GET /drivers error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 2.7 Driver & Fleet Excel Scanner & Batch Import (Must precede /api/drivers/:id)
 */
app.get('/api/drivers/excel-template', async (req, res) => {
  try {
    const buffer = await generateDriverTemplateExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Modelo_Cadastro_Condutores_Frotas.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error('[API GET /drivers/excel-template error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/drivers/scan-excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, error: 'Por favor, selecione uma planilha Excel (.xlsx, .xls) ou CSV.' });
    }
    const result = await scanDriversExcel(req.file.buffer);
    res.json(result);
  } catch (err) {
    console.error('[API POST /drivers/scan-excel error]', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/drivers/import-excel', (req, res) => {
  try {
    const { rows } = req.body;
    const result = importScannedDrivers(rows);
    res.json(result);
  } catch (err) {
    console.error('[API POST /drivers/import-excel error]', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/drivers/:id', (req, res) => {
  try {
    const driver = getDriverById(req.params.id);
    if (!driver) {
      return res.status(404).json({ success: false, error: 'Motorista não encontrado.' });
    }
    res.json({ success: true, driver });
  } catch (err) {
    console.error('[API GET /drivers/:id error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/drivers', (req, res) => {
  try {
    const newDriver = createDriver(req.body);
    res.status(201).json({
      success: true,
      message: 'Motorista cadastrado com sucesso!',
      driver: newDriver
    });
  } catch (err) {
    console.error('[API POST /drivers error]', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/drivers/:id', (req, res) => {
  try {
    const updated = updateDriver(req.params.id, req.body);
    res.json({
      success: true,
      message: 'Dados e comissão do motorista atualizados com sucesso!',
      driver: updated
    });
  } catch (err) {
    console.error('[API PUT /drivers/:id error]', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/drivers/:id', (req, res) => {
  try {
    const result = deleteDriver(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[API DELETE /drivers/:id error]', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/drivers/batch-delete', (req, res) => {
  try {
    const result = batchDeleteDrivers(req.body.ids);
    res.json(result);
  } catch (err) {
    console.error('[API POST /drivers/batch-delete error]', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/analytics/drivers', (req, res) => {
  try {
    const analytics = getDriversAnalytics();
    res.json({ success: true, ...analytics });
  } catch (err) {
    console.error('[API GET /analytics/drivers error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 3.1 Insert Manual Trip (CT-e or MDF-e)
 */
app.post('/api/documents/manual', (req, res) => {
  try {
    const result = createManualTrip(req.body);
    res.status(201).json(result);
  } catch (err) {
    console.error('[API POST /documents/manual error]', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * 3.2 Delete Trip / Fiscal Document
 */
app.delete('/api/documents/:type/:id', (req, res) => {
  try {
    const result = deleteDocument(req.params.type, req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[API DELETE /documents/:type/:id error]', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/documents/:id', (req, res) => {
  try {
    const result = deleteDocument('any', req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[API DELETE /documents/:id error]', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * 4. Document Details by Access Key (for DACTE/DAMDFE viewer)
 */
app.get('/api/documents/:key', (req, res) => {
  try {
    const doc = getDocumentByKey(req.params.key);
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Documento fiscal não encontrado.' });
    }
    res.json({ success: true, document: doc });
  } catch (err) {
    console.error('[API /documents/:key error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 5. Download Original XML file
 */
app.get('/api/documents/:key/xml', (req, res) => {
  try {
    const cleanKey = String(req.params.key).replace(/\D/g, '');
    const uploadDir = path.resolve(__dirname, '../uploads/xml');
    const xmlFilePath = path.join(uploadDir, `${cleanKey}.xml`);

    if (fs.existsSync(xmlFilePath)) {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${cleanKey}.xml"`);
      return res.sendFile(xmlFilePath);
    }

    const cte = queryOne('SELECT caminho_xml FROM conhecimentos_cte WHERE chave_acesso = ?', [cleanKey]);
    const mdfe = queryOne('SELECT caminho_xml FROM manifestos_mdfe WHERE chave_acesso = ?', [cleanKey]);
    const filePath = cte?.caminho_xml || mdfe?.caminho_xml;

    if (filePath && fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${cleanKey}.xml"`);
      return res.sendFile(filePath);
    }

    res.status(404).json({ success: false, error: 'Arquivo XML original não encontrado no servidor.' });
  } catch (err) {
    console.error('[API /documents/:key/xml error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 6. Preview and Complete Information via XML (Paste or File)
 */
app.post('/api/parse-xml-preview', upload.single('file'), (req, res) => {
  try {
    let xmlString = req.body?.xml;
    if (req.file) {
      xmlString = req.file.buffer.toString('utf-8');
    }
    if (!xmlString || typeof xmlString !== 'string') {
      return res.status(400).json({ success: false, error: 'Nenhum código ou arquivo XML foi fornecido.' });
    }

    const preview = extractXMLPreview(xmlString);
    res.json({ success: true, preview });
  } catch (err) {
    console.error('[API /parse-xml-preview error]', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/complete-from-xml', upload.single('file'), (req, res) => {
  try {
    let xmlString = req.body?.xml;
    let filename = req.body?.filename || 'manual_upload.xml';
    if (req.file) {
      xmlString = req.file.buffer.toString('utf-8');
      filename = req.file.originalname;
    }
    if (!xmlString || typeof xmlString !== 'string') {
      return res.status(400).json({ success: false, error: 'Nenhum código ou arquivo XML foi fornecido.' });
    }

    const result = parseAndStoreXML(xmlString, filename);
    res.json({
      success: true,
      message: 'Informações do documento e motorista completadas e gravadas com sucesso!',
      result
    });
  } catch (err) {
    console.error('[API /complete-from-xml error]', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * 6.1 Get Sample XML for instant completion demo
 */
app.get('/api/sample-xml/:type', (req, res) => {
  try {
    const type = req.params.type;
    const uploadDir = path.resolve(__dirname, '../uploads/xml');
    let filename = '';
    if (type === 'cte3199') {
      filename = '27260920664328000110570010000031991000060010.xml';
    } else if (type === 'mdfe1267') {
      filename = '27260920664328000110580030000012671000482550.xml';
    } else {
      return res.status(404).json({ success: false, error: 'Amostra de XML não encontrada.' });
    }

    const filePath = path.join(uploadDir, filename);
    if (!fs.existsSync(filePath)) {
      seedAttachedDacteAndDamdfe();
    }
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    res.json({ success: true, xml: xmlContent, filename });
  } catch (err) {
    console.error('[API /sample-xml error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 7. Batch Ingest XML Files (Multipart)
 */
app.post('/api/upload', upload.array('files'), (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum arquivo XML foi enviado.' });
    }

    const results = [];
    let successCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;
    const dates = [];

    for (const file of files) {
      const filename = file.originalname;
      const xmlString = file.buffer.toString('utf-8').replace(/^\uFEFF/, '').trim();

      try {
        const result = parseAndStoreXML(xmlString, filename);
        if (result.status === 'success') {
          successCount++;
          if (result.data_emissao) {
            dates.push(result.data_emissao);
          }
        } else if (result.status === 'duplicate') {
          duplicateCount++;
        }
        results.push({
          filename,
          ...result
        });
      } catch (err) {
        errorCount++;
        results.push({
          filename,
          status: 'error',
          message: err.message
        });
      }
    }

    res.json({
      success: true,
      summary: {
        totalReceived: files.length,
        successCount,
        duplicateCount,
        errorCount,
        dates
      },
      results
    });
  } catch (err) {
    console.error('[API /upload error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 7. Export Filtered Data to Excel (.xlsx) with 75% Commission
 */
app.get('/api/export/excel', async (req, res) => {
  try {
    const filters = {
      startDate: req.query.startDate || '',
      endDate: req.query.endDate || '',
      driverId: req.query.driverId || 'all',
      docType: req.query.docType || 'all',
      destination: req.query.destination || '',
      search: req.query.search || '',
      searchType: req.query.searchType || 'all',
      interstateOnly: req.query.interstateOnly || false
    };

    const data = getFilteredDocuments(filters);
    const excelBuffer = await generateExcelReport(data.items, data.kpis, filters);

    const filename = `Auditoria_Fretes_Comissoes75_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', excelBuffer.length);
    res.send(excelBuffer);
  } catch (err) {
    console.error('[API /export/excel error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 8. Seed Attached DACTE (CT-e 3199) and DAMDFE (MDF-e 1267)
 */
app.post('/api/seed-attached-dacte', (req, res) => {
  try {
    const result = seedAttachedDacteAndDamdfe();
    res.json(result);
  } catch (err) {
    console.error('[API /seed-attached-dacte error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 9. Seed General Sample SEFAZ XMLs
 */
app.post('/api/seed', (req, res) => {
  try {
    const results = seedSampleData();
    res.json({
      success: true,
      message: 'Amostras de CT-e e MDF-e geradas e auditadas com sucesso.',
      count: results.length,
      results
    });
  } catch (err) {
    console.error('[API /seed error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 10. Freight Rate & Destination Repository Engine (CARAJAS & Parâmetros Fiscais)
 */
app.get('/api/freight-repository', (req, res) => {
  try {
    const rules = getAllFreightRules(req.query.search || '');
    res.json({ success: true, count: rules.length, items: rules });
  } catch (err) {
    console.error('[API /freight-repository error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/freight-repository/:id', (req, res) => {
  try {
    const rule = getFreightRuleById(req.params.id);
    if (!rule) return res.status(404).json({ success: false, error: 'Tabela de frete não encontrada' });
    res.json({ success: true, item: rule });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/freight-repository', (req, res) => {
  try {
    const created = createFreightRule(req.body);
    res.json({ success: true, item: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/freight-repository/:id', (req, res) => {
  try {
    const updated = updateFreightRule(req.params.id, req.body);
    res.json({ success: true, item: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/freight-repository/:id', (req, res) => {
  try {
    const result = deleteFreightRule(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/freight-repository/calculate', (req, res) => {
  try {
    const calculation = calculateFreightQuote(req.body);
    res.json({ success: true, calculation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serve frontend for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  seedFreightRepositoryIfNeeded();
  console.log(`========================================================`);
  console.log(`🚀 CARGA BALANCE - Auditoria de frete`);
  console.log(`📍 Acesso Local:    http://localhost:${PORT}`);
  console.log(`📍 Acesso na Rede:  http://0.0.0.0:${PORT}`);
  console.log(`========================================================`);
});

