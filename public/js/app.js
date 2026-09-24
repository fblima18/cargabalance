/**
 * CARGA BALANCE - Auditoria de frete
 * Full Driver CRUD, 75% Commission Operations & Interstate Manifestos
 */

// State
let currentFilters = {
  startDate: '',
  endDate: '',
  driverId: 'all',
  docType: 'all',
  destination: '',
  search: '',
  searchType: 'all',
  interstateOnly: false
};

let allDriversCache = [];
let allDocumentsCache = [];
let selectedDriverIds = new Set();
let chartRevenueInstance = null;
let chartCategoryInstance = null;
let chartTripsInstance = null;
let overviewRevenueChartInstance = null;
let overviewCategoryChartInstance = null;
let activeKPIDetail = null;
let currentKPIsCache = null;
let kpiDetailChartA = null;
let kpiDetailChartB = null;

let freightRepoCache = [];

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

// Excel Scanner & Multi-Icon Query State
let currentScannedExcelRows = [];
let selectedScannedRowIds = new Set();
let selectedQueryIcons = new Set();
let selectedKPIIcons = new Set();

// NF-e XML Reader & CT-e Load Router State
let currentNFeBatchData = null;
let cachedCompanyBranches = [];

// Global helper to switch active tab
function switchTab(tabId) {
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (btn) btn.click();
}
window.switchTab = switchTab;

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initDateDefaults();
  initTabs();
  initSidebarToggle();
  loadDrivers();
  loadFreightRepositoryPresets();
  fetchAndRenderDocuments();
  setupEventListeners();
  setupDragAndDrop();
  setupExcelScannerDropzone();
  setupNFeDropzone();
});

/**
 * Initialize Sidebar Collapse / Expand Toggle
 */
function initSidebarToggle() {
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  const sidebar = document.querySelector('.app-sidebar');
  if (!toggleBtn || !sidebar) return;

  // Restore user preference
  const isCollapsed = localStorage.getItem('cargabalance_sidebar_collapsed') === 'true';
  if (isCollapsed) {
    sidebar.classList.add('collapsed');
    toggleBtn.setAttribute('title', 'Expandir barra lateral');
  }

  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    const nowCollapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem('cargabalance_sidebar_collapsed', nowCollapsed);
    toggleBtn.setAttribute('title', nowCollapsed ? 'Expandir barra lateral' : 'Minimizar barra lateral (Modo expandido)');

    // Trigger Chart resize if charts are rendered
    setTimeout(() => {
      if (chartRevenueInstance) chartRevenueInstance.resize();
      if (chartCategoryInstance) chartCategoryInstance.resize();
      if (chartTripsInstance) chartTripsInstance.resize();
      if (overviewRevenueChartInstance) overviewRevenueChartInstance.resize();
      if (overviewCategoryChartInstance) overviewCategoryChartInstance.resize();
    }, 250);
  });
}

/**
 * Initialize Tab Navigation
 */
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.add('active');
      }

      // Refresh specific tab data if needed
      if (targetId === 'tab-drivers') {
        loadDriversManagement();
      } else if (targetId === 'tab-analytics') {
        loadDriversAnalytics();
      } else if (targetId === 'tab-manifestos') {
        loadManifestos();
      } else if (targetId === 'tab-ctes') {
        loadCTEs();
      } else if (targetId === 'tab-overview') {
        fetchAndRenderDocuments();
      }
    });
  });
}

/**
 * Set default date range to current month
 */
function initDateDefaults() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const formatYMD = (d) => d.toISOString().slice(0, 10);

  const startInput = document.getElementById('filter-start-date');
  const endInput = document.getElementById('filter-end-date');

  startInput.value = formatYMD(firstDay);
  endInput.value = formatYMD(lastDay);

  currentFilters.startDate = startInput.value;
  currentFilters.endDate = endInput.value;
}

/**
 * Load drivers list for the filter combobox and cache
 */
async function loadDrivers() {
  try {
    const res = await fetch('/api/drivers');
    const data = await res.json();
    if (data.success) {
      allDriversCache = data.drivers || [];
      const select = document.getElementById('filter-driver');
      select.innerHTML = '<option value="all">Todos os Motoristas</option>';

      allDriversCache.forEach((drv) => {
        const option = document.createElement('option');
        option.value = drv.id;
        option.textContent = `${drv.nome} (${drv.cpf}) - Comis. ${drv.percentual_comissao || 75}%`;
        select.appendChild(option);
      });
    }
  } catch (err) {
    console.error('Error loading drivers:', err);
  }
}

/**
 * Fetch and render documents and KPI cards
 */
async function fetchAndRenderDocuments() {
  const tableBody = document.getElementById('documents-table-body');
  tableBody.innerHTML = `
    <tr>
      <td colspan="12" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
        Carregando documentos fiscais e saldos...
      </td>
    </tr>
  `;

  try {
    const query = new URLSearchParams(currentFilters).toString();
    const res = await fetch(`/api/documents?${query}`);
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Falha ao buscar documentos.');
    }

    allDocumentsCache = data.items || [];
    renderKPIs(data.kpis);
    renderTable(allDocumentsCache);
    updateMultiIconCounts(allDocumentsCache);
    if (selectedQueryIcons.size > 0) {
      applyMultiIconFilter();
    }
    renderOverviewChartsPreview();
  } catch (err) {
    console.error('Fetch error:', err);
    tableBody.innerHTML = `
      <tr>
        <td colspan="12" style="text-align: center; padding: 2rem; color: var(--accent-rose);">
          Erro ao carregar dados: ${err.message}
        </td>
      </tr>
    `;
    showToast(`Erro: ${err.message}`, 'error');
  }
}

function renderKPIs(kpis) {
  const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  document.getElementById('kpi-total-frete').textContent = formatBRL(kpis.totalFrete || kpis.totalAmount);
  document.getElementById('kpi-breakdown-cte').textContent = `CT-e: ${formatBRL(kpis.totalFrete)}`;
  document.getElementById('kpi-breakdown-mdfe').textContent = `Carga MDF-e: ${formatBRL(kpis.totalCarga)}`;

  // 75% Driver Commission Card
  document.getElementById('kpi-total-comissao').textContent = formatBRL(kpis.totalComissao75);

  // ICMS Total
  document.getElementById('kpi-total-icms').textContent = formatBRL(kpis.totalICMS);

  // Viagens & Documentos
  document.getElementById('kpi-doc-count').textContent = (kpis.documentCount || 0).toLocaleString('pt-BR');
  document.getElementById('kpi-count-interstate').textContent = `${kpis.interstateCount || 0} Interestaduais (Fora de AL)`;

  document.getElementById('results-count').textContent = `${kpis.documentCount || 0} registros encontrados`;

  currentKPIsCache = kpis;

  // Auto-refresh detail panel if open
  if (activeKPIDetail) {
    selectKPIDetail(activeKPIDetail, false);
  }
}

/**
 * Toggle KPI Detail Panel
 */
function toggleKPIDetail(type) {
  if (activeKPIDetail === type) {
    closeKPIDetailPanel();
  } else {
    selectKPIDetail(type, true);
  }
}
window.toggleKPIDetail = toggleKPIDetail;

/**
 * Close KPI Detail Panel
 */
function closeKPIDetailPanel() {
  const panel = document.getElementById('kpi-detail-panel');
  if (panel) panel.style.display = 'none';

  ['card-kpi-frete', 'card-kpi-comissao', 'card-kpi-icms', 'card-kpi-documentos'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('kpi-card-active');
  });

  activeKPIDetail = null;
}
window.closeKPIDetailPanel = closeKPIDetailPanel;

/**
 * Select and Render KPI Detail View (Numbers & Charts)
 */
function selectKPIDetail(type, shouldScroll = true) {
  activeKPIDetail = type;
  const panel = document.getElementById('kpi-detail-panel');
  if (!panel) return;
  panel.style.display = 'flex';

  // Highlight active KPI card
  const cardMap = {
    frete: 'card-kpi-frete',
    comissao: 'card-kpi-comissao',
    icms: 'card-kpi-icms',
    documentos: 'card-kpi-documentos'
  };

  Object.entries(cardMap).forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (el) {
      if (k === type) el.classList.add('kpi-card-active');
      else el.classList.remove('kpi-card-active');
    }
  });

  // Highlight active pill button inside panel
  const pillMap = {
    frete: 'pill-kpi-frete',
    comissao: 'pill-kpi-comissao',
    icms: 'pill-kpi-icms',
    documentos: 'pill-kpi-documentos'
  };

  Object.entries(pillMap).forEach(([k, id]) => {
    const pill = document.getElementById(id);
    if (pill) {
      if (k === type) pill.classList.add('active');
      else pill.classList.remove('active');
    }
  });

  // Configure header texts & icons
  const badgeIcon = document.getElementById('kpi-detail-badge-icon');
  const eyebrowEl = document.getElementById('kpi-detail-eyebrow');
  const titleEl = document.getElementById('kpi-detail-title');
  const descEl = document.getElementById('kpi-detail-desc');
  const filterTextEl = document.getElementById('btn-kpi-filter-text');

  if (type === 'frete') {
    if (badgeIcon) {
      badgeIcon.textContent = '💵';
      badgeIcon.style.background = 'rgba(37, 99, 235, 0.12)';
      badgeIcon.style.color = '#2563eb';
    }
    if (eyebrowEl) eyebrowEl.textContent = 'FATURAMENTO TOTAL & FRETE (CT-E / MDF-E)';
    if (titleEl) titleEl.textContent = 'Detalhamento de Faturamento & Fretes';
    if (descEl) descEl.textContent = 'Apontamento financeiro de fretes prestados (CT-e) e mercadorias averbadas (MDF-e).';
    if (filterTextEl) filterTextEl.textContent = 'Filtrar CT-e na Tabela';
  } else if (type === 'comissao') {
    if (badgeIcon) {
      badgeIcon.textContent = '🛡️';
      badgeIcon.style.background = 'rgba(16, 185, 129, 0.15)';
      badgeIcon.style.color = '#059669';
    }
    if (eyebrowEl) eyebrowEl.textContent = 'COMISSÕES DOS CONDUTORES (75%)';
    if (titleEl) titleEl.textContent = 'Detalhamento de Repasse aos Motoristas (75%)';
    if (descEl) descEl.textContent = 'Saldo acumulado destinado aos condutores conforme regra contratual de 75% sobre o frete bruto.';
    if (filterTextEl) filterTextEl.textContent = 'Ver Motoristas & Comissões';
  } else if (type === 'icms') {
    if (badgeIcon) {
      badgeIcon.textContent = '🧾';
      badgeIcon.style.background = 'rgba(245, 158, 11, 0.15)';
      badgeIcon.style.color = '#d97706';
    }
    if (eyebrowEl) eyebrowEl.textContent = 'TRIBUTAÇÃO SEFAZ & TRIBUTOS DESTACADOS';
    if (titleEl) titleEl.textContent = 'Detalhamento Tributário & ICMS Destacado';
    if (descEl) descEl.textContent = 'Recolhimento fiscal de ICMS nas operações de transporte rodoviário interestadual e interno.';
    if (filterTextEl) filterTextEl.textContent = 'Filtrar com ICMS Destacado';
  } else {
    // documentos
    if (badgeIcon) {
      badgeIcon.textContent = '📄';
      badgeIcon.style.background = 'rgba(139, 92, 246, 0.15)';
      badgeIcon.style.color = '#7c3aed';
    }
    if (eyebrowEl) eyebrowEl.textContent = 'OPERAÇÕES, VIAGENS & DOCUMENTOS FISCAIS';
    if (titleEl) titleEl.textContent = 'Detalhamento de Viagens & Documentos (CT-e e MDF-e)';
    if (descEl) descEl.textContent = 'Controle operacional de conhecimentos de carga, manifestos eletrônicos e percursos interestaduais.';
    if (filterTextEl) filterTextEl.textContent = 'Filtrar Interestaduais';
  }

  // Calculate detailed metrics
  const metrics = getKPIDetailMetrics();

  // 1. Render Sub-Stats Grid (Advanced Figures)
  renderKPIDetailStats(type, metrics);

  // 2. Render Charts
  renderKPIDetailCharts(type, metrics);

  // 3. Render Highlight Table
  renderKPIDetailTable(type, metrics);

  if (shouldScroll) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
window.selectKPIDetail = selectKPIDetail;

/**
 * Compute detailed analytical metrics across all loaded documents
 */
function getKPIDetailMetrics() {
  const docs = allDocumentsCache || [];
  const ctes = docs.filter((d) => d.tipo === 'CT-e');
  const mdfes = docs.filter((d) => d.tipo === 'MDF-e');

  const totalFrete = ctes.reduce((acc, c) => acc + (c.valor || 0), 0);
  const totalCarga = mdfes.reduce((acc, m) => acc + (m.valor || 0), 0);
  const totalComissao = ctes.reduce((acc, c) => acc + (c.valor_comissao || c.valor * 0.75 || 0), 0);
  const totalIcms = ctes.reduce((acc, c) => acc + (c.valor_icms || 0), 0);
  const totalImpostos = ctes.reduce((acc, c) => acc + (c.valor_impostos_total || c.valor_icms || 0), 0);

  // Interstate vs State
  const interstateCTes = ctes.filter((c) => c.interestadual === 1 || c.uf_origem !== c.uf_destino);
  const interstateFrete = interstateCTes.reduce((acc, c) => acc + (c.valor || 0), 0);
  const internalFrete = Math.max(0, totalFrete - interstateFrete);

  const interstateIcms = interstateCTes.reduce((acc, c) => acc + (c.valor_icms || 0), 0);
  const internalIcms = Math.max(0, totalIcms - interstateIcms);

  // Drivers
  const driverMap = {};
  ctes.forEach((c) => {
    const dId = c.motorista_id || 'unknown';
    const dNome = c.motorista_nome || 'Não Informado';
    if (!driverMap[dId]) {
      driverMap[dId] = { id: dId, nome: dNome, cpf: c.motorista_cpf || '-', frete: 0, comissao: 0, count: 0 };
    }
    driverMap[dId].frete += (c.valor || 0);
    driverMap[dId].comissao += (c.valor_comissao || c.valor * 0.75 || 0);
    driverMap[dId].count++;
  });
  const driverList = Object.values(driverMap).sort((a, b) => b.comissao - a.comissao);
  const topDriver = driverList[0] || null;

  // Max frete
  const sortedByFrete = [...ctes].sort((a, b) => (b.valor || 0) - (a.valor || 0));
  const maxFreteDoc = sortedByFrete[0] || null;

  // Routes
  const routeMap = {};
  docs.forEach((d) => {
    const orig = d.cidade_origem || d.uf_origem || 'AL';
    const dest = d.cidade_destino || d.uf_destino || 'DEST';
    const routeKey = `${orig} ➔ ${dest}`;
    if (!routeMap[routeKey]) routeMap[routeKey] = { key: routeKey, count: 0, frete: 0, carga: 0, icms: 0, comissao: 0 };
    routeMap[routeKey].count++;
    if (d.tipo === 'CT-e') {
      routeMap[routeKey].frete += (d.valor || 0);
      routeMap[routeKey].comissao += (d.valor_comissao || d.valor * 0.75 || 0);
      routeMap[routeKey].icms += (d.valor_icms || 0);
    } else {
      routeMap[routeKey].carga += (d.valor || 0);
    }
  });
  const routeList = Object.values(routeMap).sort((a, b) => b.count - a.count);

  return {
    totalFrete,
    totalCarga,
    totalComissao,
    totalIcms,
    totalImpostos,
    interstateFrete,
    internalFrete,
    interstateIcms,
    internalIcms,
    cteCount: ctes.length,
    mdfeCount: mdfes.length,
    totalDocs: docs.length,
    interstateCount: docs.filter((d) => d.interestadual === 1 || d.uf_origem !== d.uf_destino).length,
    driverList,
    topDriver,
    maxFreteDoc,
    routeList,
    ctes,
    mdfes,
    docs
  };
}

/**
 * Render KPI Detail Numeric Stats Cards
 */
function renderKPIDetailStats(type, m) {
  const container = document.getElementById('kpi-detail-stats-grid');
  if (!container) return;
  const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  let html = '';

  if (type === 'frete') {
    const avgTicket = m.cteCount > 0 ? m.totalFrete / m.cteCount : 0;
    const interstatePct = m.totalFrete > 0 ? ((m.interstateFrete / m.totalFrete) * 100).toFixed(1) : 0;
    const maxVal = m.maxFreteDoc ? m.maxFreteDoc.valor : 0;
    const maxDocNum = m.maxFreteDoc ? `CT-e nº ${m.maxFreteDoc.numero}` : '-';

    html = `
      <div class="kpi-sub-stat-card" style="border-left: 3px solid #2563eb;">
        <span class="kpi-sub-stat-label">💵 Total Frete Prestado</span>
        <span class="kpi-sub-stat-val" style="color: #2563eb;">${formatBRL(m.totalFrete)}</span>
        <span class="kpi-sub-stat-desc">${m.cteCount} Conhecimento(s) CT-e faturados</span>
      </div>
      <div class="kpi-sub-stat-card" style="border-left: 3px solid #8b5cf6;">
        <span class="kpi-sub-stat-label">📦 Valor Total da Carga</span>
        <span class="kpi-sub-stat-val" style="color: #7c3aed;">${formatBRL(m.totalCarga)}</span>
        <span class="kpi-sub-stat-desc">${m.mdfeCount} Manifesto(s) MDF-e averbados</span>
      </div>
      <div class="kpi-sub-stat-card">
        <span class="kpi-sub-stat-label">📈 Ticket Médio de Frete</span>
        <span class="kpi-sub-stat-val">${formatBRL(avgTicket)}</span>
        <span class="kpi-sub-stat-desc">Média ponderada por conhecimento</span>
      </div>
      <div class="kpi-sub-stat-card">
        <span class="kpi-sub-stat-label">🏆 Maior Frete Registrado</span>
        <span class="kpi-sub-stat-val" style="color: #059669;">${formatBRL(maxVal)}</span>
        <span class="kpi-sub-stat-desc">${maxDocNum} (${m.maxFreteDoc ? (m.maxFreteDoc.cidade_destino || m.maxFreteDoc.uf_destino) : '-'})</span>
      </div>
      <div class="kpi-sub-stat-card">
        <span class="kpi-sub-stat-label">🛣️ Faturamento Interestadual</span>
        <span class="kpi-sub-stat-val">${formatBRL(m.interstateFrete)}</span>
        <span class="kpi-sub-stat-desc">${interstatePct}% das operações fora de AL</span>
      </div>
      <div class="kpi-sub-stat-card">
        <span class="kpi-sub-stat-label">📊 Total Movimentado</span>
        <span class="kpi-sub-stat-val">${formatBRL(m.totalFrete + m.totalCarga)}</span>
        <span class="kpi-sub-stat-desc">Frete líquido + Carga em trânsito</span>
      </div>
    `;
  } else if (type === 'comissao') {
    const margemEmpresa = Math.max(0, m.totalFrete - m.totalComissao);
    const avgComissao = m.cteCount > 0 ? m.totalComissao / m.cteCount : 0;
    const topComissaoVal = m.topDriver ? m.topDriver.comissao : 0;
    const topNome = m.topDriver ? m.topDriver.nome : 'Nenhum';

    html = `
      <div class="kpi-sub-stat-card" style="border-left: 3px solid #10b981; background: #f0fdf4;">
        <span class="kpi-sub-stat-label" style="color: #059669;">🛡️ Repasse Motoristas (75%)</span>
        <span class="kpi-sub-stat-val" style="color: #059669;">${formatBRL(m.totalComissao)}</span>
        <span class="kpi-sub-stat-desc">Regra contratual 75% garantida</span>
      </div>
      <div class="kpi-sub-stat-card" style="border-left: 3px solid #6366f1;">
        <span class="kpi-sub-stat-label">🏢 Margem Transportadora (25%)</span>
        <span class="kpi-sub-stat-val" style="color: #4f46e5;">${formatBRL(margemEmpresa)}</span>
        <span class="kpi-sub-stat-desc">Retenção de custos operacionais</span>
      </div>
      <div class="kpi-sub-stat-card">
        <span class="kpi-sub-stat-label">📊 Média por Viagem</span>
        <span class="kpi-sub-stat-val">${formatBRL(avgComissao)}</span>
        <span class="kpi-sub-stat-desc">Comissão média repassada</span>
      </div>
      <div class="kpi-sub-stat-card">
        <span class="kpi-sub-stat-label">🥇 Maior Comissão Individual</span>
        <span class="kpi-sub-stat-val" style="color: #059669;">${formatBRL(topComissaoVal)}</span>
        <span class="kpi-sub-stat-desc">${topNome}</span>
      </div>
      <div class="kpi-sub-stat-card">
        <span class="kpi-sub-stat-label">👥 Motoristas Beneficiados</span>
        <span class="kpi-sub-stat-val">${m.driverList.length} condutores</span>
        <span class="kpi-sub-stat-desc">Com saldos apurados em fretes</span>
      </div>
      <div class="kpi-sub-stat-card">
        <span class="kpi-sub-stat-label">⚙️ Taxa Contratual</span>
        <span class="kpi-sub-stat-val" style="color: #047857;">75,0%</span>
        <span class="kpi-sub-stat-desc">Percentual de frota auditado</span>
      </div>
    `;
  } else if (type === 'icms') {
    const aliquotaMedia = m.totalFrete > 0 ? ((m.totalIcms / m.totalFrete) * 100).toFixed(2) : '0.00';
    const outrosTributos = Math.max(0, m.totalImpostos - m.totalIcms);

    html = `
      <div class="kpi-sub-stat-card" style="border-left: 3px solid #f59e0b; background: #fffbeb;">
        <span class="kpi-sub-stat-label" style="color: #b45309;">🧾 Total ICMS Destacado</span>
        <span class="kpi-sub-stat-val" style="color: #d97706;">${formatBRL(m.totalIcms)}</span>
        <span class="kpi-sub-stat-desc">Imposto destacado em DACTE</span>
      </div>
      <div class="kpi-sub-stat-card">
        <span class="kpi-sub-stat-label">📐 Base de Cálculo Total</span>
        <span class="kpi-sub-stat-val">${formatBRL(m.totalFrete)}</span>
        <span class="kpi-sub-stat-desc">Base tributável nos serviços</span>
      </div>
      <div class="kpi-sub-stat-card">
        <span class="kpi-sub-stat-label">⚡ Alíquota Média Efetiva</span>
        <span class="kpi-sub-stat-val" style="color: #d97706;">${aliquotaMedia}%</span>
        <span class="kpi-sub-stat-desc">Média ponderada das operações</span>
      </div>
      <div class="kpi-sub-stat-card">
        <span class="kpi-sub-stat-label">🛣️ ICMS Interestadual (12%)</span>
        <span class="kpi-sub-stat-val">${formatBRL(m.interstateIcms)}</span>
        <span class="kpi-sub-stat-desc">Prestações para fora de AL</span>
      </div>
      <div class="kpi-sub-stat-card">
        <span class="kpi-sub-stat-label">📍 ICMS Interno AL (19%)</span>
        <span class="kpi-sub-stat-val">${formatBRL(m.internalIcms)}</span>
        <span class="kpi-sub-stat-desc">Prestações estaduais em AL</span>
      </div>
      <div class="kpi-sub-stat-card">
        <span class="kpi-sub-stat-label">🏛️ Outros Tributos (PIS/COF/IBS)</span>
        <span class="kpi-sub-stat-val">${formatBRL(outrosTributos)}</span>
        <span class="kpi-sub-stat-desc">Tributos federais informados</span>
      </div>
    `;
  } else {
    // documentos
    const estaduais = Math.max(0, m.totalDocs - m.interstateCount);
    const estPct = m.totalDocs > 0 ? ((estaduais / m.totalDocs) * 100).toFixed(0) : 0;
    const interPct = m.totalDocs > 0 ? ((m.interstateCount / m.totalDocs) * 100).toFixed(0) : 0;

    html = `
      <div class="kpi-sub-stat-card" style="border-left: 3px solid #8b5cf6;">
        <span class="kpi-sub-stat-label">🚛 Total de Viagens / Operações</span>
        <span class="kpi-sub-stat-val" style="color: #7c3aed;">${m.totalDocs}</span>
        <span class="kpi-sub-stat-desc">Conhecimentos e manifestos</span>
      </div>
      <div class="kpi-sub-stat-card" style="border-left: 3px solid #2563eb;">
        <span class="kpi-sub-stat-label">📄 Conhecimentos CT-e</span>
        <span class="kpi-sub-stat-val" style="color: #2563eb;">${m.cteCount}</span>
        <span class="kpi-sub-stat-desc">Documentos modelo 57 emitidos</span>
      </div>
      <div class="kpi-sub-stat-card" style="border-left: 3px solid #06b6d4;">
        <span class="kpi-sub-stat-label">🚚 Manifestos MDF-e</span>
        <span class="kpi-sub-stat-val" style="color: #0891b2;">${m.mdfeCount}</span>
        <span class="kpi-sub-stat-desc">Documentos modelo 58 vinculados</span>
      </div>
      <div class="kpi-sub-stat-card" style="border-left: 3px solid #b45309;">
        <span class="kpi-sub-stat-label">🌐 Interestaduais (Fora de AL)</span>
        <span class="kpi-sub-stat-val" style="color: #b45309;">${m.interstateCount}</span>
        <span class="kpi-sub-stat-desc">${interPct}% do volume operacional</span>
      </div>
      <div class="kpi-sub-stat-card">
        <span class="kpi-sub-stat-label">📍 Operações Internas (AL)</span>
        <span class="kpi-sub-stat-val">${estaduais}</span>
        <span class="kpi-sub-stat-desc">${estPct}% do volume dentro de AL</span>
      </div>
      <div class="kpi-sub-stat-card">
        <span class="kpi-sub-stat-label">🛣️ Trajetos & Rotas Atendidas</span>
        <span class="kpi-sub-stat-val">${m.routeList.length}</span>
        <span class="kpi-sub-stat-desc">Origens e destinos cadastrados</span>
      </div>
    `;
  }

  container.innerHTML = html;
}

/**
 * Render KPI Detail Charts via Chart.js
 */
function renderKPIDetailCharts(type, m) {
  const canvasA = document.getElementById('kpi-detail-canvas-a');
  const canvasB = document.getElementById('kpi-detail-canvas-b');
  const titleA = document.getElementById('kpi-chart-title-a');
  const descA = document.getElementById('kpi-chart-desc-a');
  const titleB = document.getElementById('kpi-chart-title-b');
  const descB = document.getElementById('kpi-chart-desc-b');

  if (!canvasA || !canvasB || typeof Chart === 'undefined') return;

  if (kpiDetailChartA) kpiDetailChartA.destroy();
  if (kpiDetailChartB) kpiDetailChartB.destroy();

  const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  if (type === 'frete') {
    titleA.textContent = '📈 Faturamento por Documento (CT-e)';
    descA.textContent = 'Valores individuais de cada frete auditado';
    titleB.textContent = '🍩 Composição por Rota / Destino';
    descB.textContent = 'Distribuição do frete total por destino';

    // Chart A: CT-e values
    const ctesToShow = m.ctes.slice(0, 10);
    const labelsA = ctesToShow.map((c) => `CT-e ${c.numero}`);
    const dataA = ctesToShow.map((c) => c.valor || 0);

    kpiDetailChartA = new Chart(canvasA, {
      type: 'bar',
      data: {
        labels: labelsA.length > 0 ? labelsA : ['Sem dados'],
        datasets: [{
          label: 'Valor do Frete (R$)',
          data: dataA.length > 0 ? dataA : [0],
          backgroundColor: 'rgba(37, 99, 235, 0.85)',
          borderColor: '#2563eb',
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => `Frete: ${formatBRL(ctx.raw)}` }
          }
        },
        scales: {
          x: { ticks: { font: { size: 10, weight: '600' } } },
          y: { ticks: { callback: (val) => 'R$ ' + (val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val) } }
        }
      }
    });

    // Chart B: Frete by Route
    const routesToShow = m.routeList.slice(0, 5);
    const labelsB = routesToShow.map((r) => r.key);
    const dataB = routesToShow.map((r) => r.frete);

    kpiDetailChartB = new Chart(canvasB, {
      type: 'doughnut',
      data: {
        labels: labelsB.length > 0 ? labelsB : ['Sem rotas'],
        datasets: [{
          data: dataB.length > 0 ? dataB : [1],
          backgroundColor: ['#2563eb', '#38bdf8', '#8b5cf6', '#10b981', '#f59e0b']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10, weight: '600' }, padding: 8 } },
          tooltip: {
            callbacks: { label: (ctx) => `${ctx.label}: ${formatBRL(ctx.raw)}` }
          }
        }
      }
    });

  } else if (type === 'comissao') {
    titleA.textContent = '🏆 Ranking de Repasse de Comissão (75%)';
    descA.textContent = 'Valores a repassar por condutor sobre fretes realizados';
    titleB.textContent = '🍩 Divisão Contratual do Frete';
    descB.textContent = '75% Condutor vs 25% Margem Transportadora';

    // Chart A: Driver Commission Ranking
    const driversToShow = m.driverList.slice(0, 8);
    const labelsA = driversToShow.map((d) => d.nome.length > 15 ? d.nome.substring(0, 13) + '...' : d.nome);
    const dataA = driversToShow.map((d) => d.comissao);

    kpiDetailChartA = new Chart(canvasA, {
      type: 'bar',
      data: {
        labels: labelsA.length > 0 ? labelsA : ['Sem motoristas'],
        datasets: [{
          label: 'Comissão 75% (R$)',
          data: dataA.length > 0 ? dataA : [0],
          backgroundColor: 'rgba(16, 185, 129, 0.85)',
          borderColor: '#10b981',
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `Comissão: ${formatBRL(ctx.raw)}` } }
        },
        scales: {
          x: { ticks: { callback: (val) => 'R$ ' + (val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val) } },
          y: { ticks: { font: { size: 10, weight: '600' } } }
        }
      }
    });

    // Chart B: 75% vs 25% Split
    const margemEmpresa = Math.max(0, m.totalFrete - m.totalComissao);
    kpiDetailChartB = new Chart(canvasB, {
      type: 'doughnut',
      data: {
        labels: [
          `Motoristas (75%): ${formatBRL(m.totalComissao)}`,
          `Empresa (25%): ${formatBRL(margemEmpresa)}`
        ],
        datasets: [{
          data: [m.totalComissao, margemEmpresa],
          backgroundColor: ['#10b981', '#6366f1']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10, weight: '600' }, padding: 8 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}` } }
        }
      }
    });

  } else if (type === 'icms') {
    titleA.textContent = '🏛️ Arrecadação de ICMS por Destino';
    descA.textContent = 'Imposto destacado conforme estado / cidade de destino';
    titleB.textContent = '🍩 Tributação: Interestadual vs Interno';
    descB.textContent = 'Alíquota de 12% (fora de AL) vs 19% (interna AL)';

    // Chart A: ICMS by destination
    const destMap = {};
    m.ctes.forEach((c) => {
      const dest = c.uf_destino || 'AL';
      destMap[dest] = (destMap[dest] || 0) + (c.valor_icms || 0);
    });
    const labelsA = Object.keys(destMap);
    const dataA = Object.values(destMap);

    kpiDetailChartA = new Chart(canvasA, {
      type: 'bar',
      data: {
        labels: labelsA.length > 0 ? labelsA : ['Sem dados'],
        datasets: [{
          label: 'ICMS Destacado (R$)',
          data: dataA.length > 0 ? dataA : [0],
          backgroundColor: 'rgba(245, 158, 11, 0.85)',
          borderColor: '#f59e0b',
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `ICMS: ${formatBRL(ctx.raw)}` } }
        },
        scales: {
          y: { ticks: { callback: (val) => 'R$ ' + val } }
        }
      }
    });

    // Chart B: Interestadual vs Interno
    kpiDetailChartB = new Chart(canvasB, {
      type: 'doughnut',
      data: {
        labels: [
          `Interestadual 12% (${formatBRL(m.interstateIcms)})`,
          `Interno AL 19% (${formatBRL(m.internalIcms)})`
        ],
        datasets: [{
          data: [m.interstateIcms, m.internalIcms],
          backgroundColor: ['#f59e0b', '#ef4444']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10, weight: '600' }, padding: 8 } },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}` } }
        }
      }
    });

  } else {
    // documentos
    titleA.textContent = '🛣️ Volume de Viagens por Trajeto / Rota';
    descA.textContent = 'Rotas com maior frequência de viagens operadas';
    titleB.textContent = '🍩 Composição dos Documentos Emitidos';
    descB.textContent = 'Conhecimentos CT-e vs Manifestos MDF-e';

    // Chart A: Top Routes by Trips
    const routesToShow = m.routeList.slice(0, 6);
    const labelsA = routesToShow.map((r) => r.key);
    const dataA = routesToShow.map((r) => r.count);

    kpiDetailChartA = new Chart(canvasA, {
      type: 'bar',
      data: {
        labels: labelsA.length > 0 ? labelsA : ['Sem viagens'],
        datasets: [{
          label: 'Qtd de Viagens',
          data: dataA.length > 0 ? dataA : [0],
          backgroundColor: 'rgba(139, 92, 246, 0.85)',
          borderColor: '#8b5cf6',
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { ticks: { stepSize: 1 } }
        }
      }
    });

    // Chart B: CT-e vs MDF-e
    kpiDetailChartB = new Chart(canvasB, {
      type: 'doughnut',
      data: {
        labels: [
          `Conhecimentos CT-e (${m.cteCount})`,
          `Manifestos MDF-e (${m.mdfeCount})`
        ],
        datasets: [{
          data: [m.cteCount, m.mdfeCount],
          backgroundColor: ['#2563eb', '#8b5cf6']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10, weight: '600' }, padding: 8 } }
        }
      }
    });
  }
}

/**
 * Render KPI Detail Highlights Table
 */
function renderKPIDetailTable(type, m) {
  const headEl = document.getElementById('kpi-detail-table-head');
  const bodyEl = document.getElementById('kpi-detail-table-body');
  const titleEl = document.getElementById('kpi-table-title');
  const subtitleEl = document.getElementById('kpi-table-subtitle');

  if (!headEl || !bodyEl) return;
  const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  if (type === 'frete') {
    titleEl.textContent = 'Maiores Fretes Faturados (CT-e)';
    subtitleEl.textContent = 'Top documentos com maior valor de serviço prestado';
    headEl.innerHTML = `
      <th>Documento</th>
      <th>Emissão</th>
      <th>Motorista</th>
      <th>Rota & Percurso</th>
      <th style="text-align: right;">Valor Frete (R$)</th>
      <th style="text-align: right; color: #059669;">Comissão 75% (R$)</th>
      <th style="text-align: center;">Visualizar</th>
    `;
    const list = [...m.ctes].sort((a, b) => (b.valor || 0) - (a.valor || 0)).slice(0, 5);
    bodyEl.innerHTML = list.map((c) => {
      const cleanKey = String(c.chave_acesso).replace(/\D/g, '');
      return `
        <tr>
          <td><strong>CT-e nº ${c.numero}</strong></td>
          <td>${c.data_emissao ? new Date(c.data_emissao).toLocaleDateString('pt-BR') : '-'}</td>
          <td>${c.motorista_nome || '-'}</td>
          <td>${c.cidade_origem || c.uf_origem} ➔ ${c.cidade_destino || c.uf_destino}</td>
          <td style="text-align: right; font-weight: bold; color: #2563eb;">${formatBRL(c.valor)}</td>
          <td style="text-align: right; font-weight: bold; color: #059669;">${formatBRL(c.valor_comissao)}</td>
          <td style="text-align: center;">
            <button class="btn btn-secondary btn-sm" onclick="openDocPreview('${cleanKey}')" title="Ver DACTE">DACTE</button>
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="7" style="text-align:center;">Nenhum CT-e registrado.</td></tr>';

  } else if (type === 'comissao') {
    titleEl.textContent = 'Extrato de Comissões por Condutor (75%)';
    subtitleEl.textContent = 'Detalhamento de saldo a pagar acumulado';
    headEl.innerHTML = `
      <th>Condutor</th>
      <th>CPF</th>
      <th>Qtd Viagens</th>
      <th style="text-align: right;">Frete Total (R$)</th>
      <th style="text-align: right; color: #059669;">Comissão 75% a Pagar</th>
      <th style="text-align: center;">Ações</th>
    `;
    const list = m.driverList.slice(0, 5);
    bodyEl.innerHTML = list.map((d) => `
      <tr>
        <td><strong>${d.nome}</strong></td>
        <td>${d.cpf}</td>
        <td>${d.count} frete(s)</td>
        <td style="text-align: right;">${formatBRL(d.frete)}</td>
        <td style="text-align: right; font-weight: 800; color: #059669;">${formatBRL(d.comissao)}</td>
        <td style="text-align: center;">
          <button class="btn btn-secondary btn-sm" onclick="switchTab('tab-drivers')" title="Ver motorista">Gerenciar</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6" style="text-align:center;">Nenhum motorista registrado.</td></tr>';

  } else if (type === 'icms') {
    titleEl.textContent = 'Apuração Fiscal de ICMS por Conhecimento';
    subtitleEl.textContent = 'Detalhamento de alíquotas e valores destacados';
    headEl.innerHTML = `
      <th>CT-e</th>
      <th>Destino</th>
      <th>Tipo Operação</th>
      <th style="text-align: right;">Base de Cálculo</th>
      <th style="text-align: right; color: #d97706;">ICMS Destacado</th>
      <th style="text-align: center;">Visualizar</th>
    `;
    const list = [...m.ctes].sort((a, b) => (b.valor_icms || 0) - (a.valor_icms || 0)).slice(0, 5);
    bodyEl.innerHTML = list.map((c) => {
      const cleanKey = String(c.chave_acesso).replace(/\D/g, '');
      return `
        <tr>
          <td><strong>CT-e nº ${c.numero}</strong></td>
          <td>${c.cidade_destino || '-'}/${c.uf_destino || '-'}</td>
          <td>${c.interestadual === 1 ? '<span class="badge-interstate">Interestadual (12%)</span>' : '<span class="badge-trend">Interno (19%)</span>'}</td>
          <td style="text-align: right;">${formatBRL(c.valor)}</td>
          <td style="text-align: right; font-weight: bold; color: #d97706;">${formatBRL(c.valor_icms)}</td>
          <td style="text-align: center;">
            <button class="btn btn-secondary btn-sm" onclick="openDocPreview('${cleanKey}')" title="Ver DACTE">DACTE</button>
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="6" style="text-align:center;">Nenhum ICMS registrado.</td></tr>';

  } else {
    // documentos
    titleEl.textContent = 'Registro de Viagens e Documentos Fiscais';
    subtitleEl.textContent = 'Rastreabilidade de CT-e e MDF-e com percurso interestadual';
    headEl.innerHTML = `
      <th>Tipo</th>
      <th>Número</th>
      <th>Cronograma (Saída / Prev.)</th>
      <th>Condutor</th>
      <th>Rota & Percurso</th>
      <th style="text-align: center;">Interestadual?</th>
      <th style="text-align: center;">Ações</th>
    `;
    const list = m.docs.slice(0, 5);
    const formatDateTime = (str) => {
      if (!str) return '-';
      try {
        const d = new Date(str);
        return isNaN(d.getTime()) ? str : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      } catch { return str; }
    };
    bodyEl.innerHTML = list.map((d) => {
      const cleanKey = String(d.chave_acesso).replace(/\D/g, '');
      return `
        <tr>
          <td><span class="badge-doc ${d.tipo === 'CT-e' ? 'badge-cte' : 'badge-mdfe'}">${d.tipo}</span></td>
          <td><strong>nº ${d.numero}</strong></td>
          <td>${formatDateTime(d.data_saida || d.data_emissao)}</td>
          <td>${d.motorista_nome || '-'}</td>
          <td>${d.cidade_origem || d.uf_origem} ➔ ${d.cidade_destino || d.uf_destino} ${d.ufs_percurso ? `(${d.ufs_percurso})` : ''}</td>
          <td style="text-align: center;">${(d.interestadual === 1 || d.uf_origem !== d.uf_destino) ? '<span class="badge-interstate">Sim</span>' : '<span style="color: #64748b;">Não</span>'}</td>
          <td style="text-align: center;">
            <button class="btn btn-secondary btn-sm" onclick="openDocPreview('${cleanKey}')">Visualizar</button>
          </td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="7" style="text-align:center;">Nenhuma viagem registrada.</td></tr>';
  }
}

/**
 * Filter document table by current active KPI
 */
function filterTableByCurrentKPI() {
  if (!activeKPIDetail) return;
  const searchInput = document.getElementById('table-search');
  const searchCategory = document.getElementById('search-category');

  if (activeKPIDetail === 'frete') {
    if (searchCategory) searchCategory.value = 'cte';
    if (searchInput) searchInput.value = '';
    currentFilters.searchType = 'cte';
    currentFilters.search = '';
    fetchAndRenderDocuments();
    showToast('Tabela configurada para Conhecimentos (CT-e)!', 'info');
  } else if (activeKPIDetail === 'comissao') {
    if (searchCategory) searchCategory.value = 'driver';
    currentFilters.searchType = 'driver';
    fetchAndRenderDocuments();
    showToast('Tabela ordenada para Comissões de Motoristas (75%)!', 'info');
  } else if (activeKPIDetail === 'icms') {
    if (searchCategory) searchCategory.value = 'all';
    currentFilters.searchType = 'all';
    fetchAndRenderDocuments();
    showToast('Exibindo documentos com destaque de ICMS na tabela!', 'info');
  } else if (activeKPIDetail === 'documentos') {
    if (searchCategory) searchCategory.value = 'route';
    currentFilters.searchType = 'route';
    fetchAndRenderDocuments();
    showToast('Tabela configurada para análise de rotas e viagens!', 'info');
  }

  const tableSection = document.querySelector('.table-wrapper');
  if (tableSection) {
    tableSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
window.filterTableByCurrentKPI = filterTableByCurrentKPI;

/**
 * Render Overview Table
 */
function renderTable(items) {
  const tableBody = document.getElementById('documents-table-body');
  if (!items || items.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="13" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          Nenhum documento encontrado para os filtros selecionados.
        </td>
      </tr>
    `;
    return;
  }

  const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (str) => str ? new Date(str).toLocaleDateString('pt-BR') : '-';
  const formatDateTime = (str) => {
    if (!str) return '-';
    try {
      const d = new Date(str);
      if (isNaN(d.getTime())) return str;
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' +
        d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return str;
    }
  };

  tableBody.innerHTML = items.map((doc) => {
    const isCTe = doc.tipo === 'CT-e';
    const badgeClass = isCTe ? 'badge-cte' : 'badge-mdfe';
    const cleanKey = String(doc.chave_acesso).replace(/\D/g, '');
    const isInterstate = doc.interestadual === 1 || doc.uf_origem !== doc.uf_destino;

    return `
      <tr>
        <td>
          <span class="badge-doc ${badgeClass}">
            <span class="dot-indicator"></span>
            ${doc.tipo}
          </span>
        </td>
        <td style="text-align: center;">
          <div class="action-buttons" style="justify-content: center;">
            <button class="icon-btn" title="Visualizar DACTE / DAMDFE" onclick="openDocPreview('${cleanKey}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            <button class="icon-btn" title="Baixar XML Original" onclick="downloadOriginalXML('${cleanKey}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            <button class="icon-btn" title="Ver Metadados" onclick="openDocDetails('${cleanKey}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </button>
            <button class="icon-btn danger" title="Excluir Viagem" onclick="confirmDeleteTrip('${doc.tipo}', '${doc.id}', '${doc.numero}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </td>
        <td style="font-weight: 700; color: ${isCTe ? '#059669' : '#7c3aed'};">${doc.numero}</td>
        <td>${doc.serie}</td>
        <td>
          <div style="font-size: 0.775rem; line-height: 1.35; white-space: nowrap;">
            <div style="color: #38bdf8; font-weight: 600;" title="Data e Hora de Saída">
              🛫 ${formatDateTime(doc.data_saida || doc.data_emissao)}
            </div>
            <div style="color: #fbbf24; font-weight: 600; margin-top: 2px;" title="Previsão de Chegada no Destino Final">
              🛬 ${formatDateTime(doc.previsao_chegada)}
            </div>
          </div>
        </td>
        <td style="font-weight: 600;">${doc.motorista_nome}</td>
        <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.775rem;">${doc.motorista_cpf}</td>
        <td>
          <div style="font-size: 0.775rem; line-height: 1.35; max-width: 250px;">
            <div style="font-weight: 700; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Remetente: ${doc.remetente_nome || 'Remetente não informado'} (${doc.remetente_cnpj || ''})">
              📤 <span style="color: #94a3b8; font-weight: 500;">Rem:</span> ${doc.remetente_nome || 'Empresa Remetente'}
            </div>
            <div style="font-weight: 700; color: #38bdf8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;" title="Recebedora/Destinatária: ${doc.destinatario_nome || 'Destinatário não informado'} (${doc.destinatario_cnpj || ''})">
              📥 <span style="color: #94a3b8; font-weight: 500;">Rec:</span> ${doc.destinatario_nome || 'Empresa Recebedora'}
            </div>
            ${(doc.remetente_cnpj || doc.destinatario_cnpj) ? `<div style="font-size: 0.68rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; margin-top: 1px;">CNPJ: ${doc.remetente_cnpj || '-'} ➔ ${doc.destinatario_cnpj || '-'}</div>` : ''}
          </div>
        </td>
        <td>
          <span style="font-weight: 600;">${doc.destino}</span>
          ${doc.origem ? `<br><small style="color: var(--text-muted);">${doc.origem}</small>` : ''}
          ${(doc.ufs_percurso || (!isCTe && isInterstate))
            ? `<div style="margin-top: 4px;"><span class="badge-interstate" style="background: rgba(139, 92, 246, 0.18); border-color: rgba(139, 92, 246, 0.4); color: #c4b5fd; font-size: 0.68rem; font-weight: 700;" title="Estados que o veículo fará no trajeto">🛣️ Percurso: ${doc.ufs_percurso || 'PE'}</span></div>`
            : ''
          }
        </td>
        <td style="text-align: center;">
          ${isInterstate 
            ? `<span class="badge-interstate" title="Viagem fora de Alagoas">SIM (Interestadual)</span>` 
            : `<span style="color: var(--text-muted); font-size: 0.75rem;">NÃO (Interna)</span>`
          }
        </td>
        <td class="currency-cell">${formatBRL(doc.valor)}</td>
        <td style="text-align: right; color: #fbbf24; font-family: 'JetBrains Mono', monospace; font-weight: 600;">
          ${formatBRL(doc.valor_icms)}
        </td>
        <td style="text-align: right; color: #34d399; font-family: 'JetBrains Mono', monospace; font-weight: 700;">
          ${isCTe ? formatBRL(doc.valor_comissao) : '-'}
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * Load TAB 2: Conhecimentos (CT-e) & 75% Commission
 */
async function loadCTEs() {
  const tableBody = document.getElementById('ctes-table-body');
  tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 2rem;">Carregando CT-es...</td></tr>`;

  try {
    const res = await fetch('/api/documents?docType=cte');
    const data = await res.json();
    const ctes = data.items || [];

    document.getElementById('cte-results-count').textContent = `${ctes.length} CT-es encontrados`;

    if (ctes.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 3rem; color: var(--text-muted);">Nenhum CT-e registrado.</td></tr>`;
      return;
    }

    const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
    const formatDateTime = (str) => {
      if (!str) return '-';
      try {
        const d = new Date(str);
        if (isNaN(d.getTime())) return str;
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' +
          d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      } catch {
        return str;
      }
    };

    tableBody.innerHTML = ctes.map((c) => {
      const cleanKey = String(c.chave_acesso).replace(/\D/g, '');
      return `
        <tr>
          <td style="font-weight: 700; color: #38bdf8;">${c.numero}</td>
          <td>${c.serie}</td>
          <td>
            <div style="font-size: 0.775rem; line-height: 1.35; white-space: nowrap;">
              <div style="color: #38bdf8; font-weight: 600;">🛫 ${formatDateTime(c.data_saida || c.data_emissao)}</div>
              <div style="color: #fbbf24; font-weight: 600; margin-top: 2px;">🛬 ${formatDateTime(c.previsao_chegada)}</div>
            </div>
          </td>
          <td>
            <div style="font-weight: 600;">${c.motorista_nome}</div>
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.725rem; color: var(--text-muted);">${c.motorista_cpf}</div>
          </td>
          <td>
            <div style="font-size: 0.775rem; line-height: 1.35; max-width: 220px;">
              <div style="font-weight: 700; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Remetente: ${c.remetente_nome || ''}">
                📤 Rem: ${c.remetente_nome || 'Não informado'}
              </div>
              <div style="font-weight: 700; color: #38bdf8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;" title="Recebedora: ${c.destinatario_nome || ''}">
                📥 Rec: ${c.destinatario_nome || 'Não informado'}
              </div>
            </div>
          </td>
          <td>
            <span style="font-weight: 600;">${c.origem} ➔ ${c.destino}</span>
            ${c.ufs_percurso ? `<div style="margin-top: 3px;"><span class="badge-interstate" style="font-size: 0.68rem;">🛣️ Percurso: ${c.ufs_percurso}</span></div>` : ''}
          </td>
          <td class="currency-cell">${formatBRL(c.valor)}</td>
          <td style="text-align: right; color: #fbbf24; font-family: 'JetBrains Mono', monospace; font-weight: 600;">
            ${formatBRL(c.valor_icms)}
          </td>
          <td style="text-align: right; color: #34d399; font-family: 'JetBrains Mono', monospace; font-weight: 700;">
            ${formatBRL(c.valor_comissao)}
          </td>
          <td style="text-align: center;">
            <div class="action-buttons" style="justify-content: center;">
              <button class="icon-btn" title="Visualizar DACTE" onclick="openDocPreview('${cleanKey}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
              <button class="icon-btn" title="Baixar XML Original" onclick="downloadOriginalXML('${cleanKey}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
              <button class="icon-btn danger" title="Excluir CT-e" onclick="confirmDeleteTrip('CT-e', '${c.id}', '${c.numero}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--accent-rose); padding: 2rem;">Erro: ${err.message}</td></tr>`;
  }
}

/**
 * Load TAB 3: Interstate Manifestos (MDF-e)
 */
async function loadManifestos() {
  const tableBody = document.getElementById('manifestos-table-body');
  tableBody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 2rem;">Carregando manifestos interestaduais...</td></tr>`;

  try {
    const res = await fetch('/api/manifestos');
    const data = await res.json();
    const manifestos = data.manifestos || [];

    document.getElementById('manifestos-count').textContent = `${manifestos.length} manifestos cadastrados`;

    if (manifestos.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="12" style="text-align: center; padding: 3rem; color: var(--text-muted);">Nenhum manifesto interestadual encontrado.</td></tr>`;
      return;
    }

    const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
    const formatDateTime = (str) => {
      if (!str) return '-';
      try {
        const d = new Date(str);
        if (isNaN(d.getTime())) return str;
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' +
          d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      } catch {
        return str;
      }
    };

    tableBody.innerHTML = manifestos.map((m) => {
      const cleanKey = String(m.chave_acesso).replace(/\D/g, '');
      const placas = [m.placa_tracao, m.placa_reboque].filter(Boolean).join(' / ') || 'LQW0A19 / MUV0J59';

      return `
        <tr>
          <td style="font-weight: 700; color: #a78bfa;">${m.numero}</td>
          <td>${m.serie}</td>
          <td>
            <div style="font-size: 0.775rem; line-height: 1.35; white-space: nowrap;">
              <div style="color: #38bdf8; font-weight: 600;">🛫 ${formatDateTime(m.data_saida || m.data_emissao)}</div>
              <div style="color: #fbbf24; font-weight: 600; margin-top: 2px;">🛬 ${formatDateTime(m.previsao_chegada)}</div>
            </div>
          </td>
          <td style="font-weight: 600;">${m.motorista_nome}</td>
          <td>
            <div style="font-size: 0.775rem; line-height: 1.35; max-width: 200px;">
              <div style="font-weight: 700; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Remetente: ${m.remetente_nome || ''}">
                📤 Rem: ${m.remetente_nome || 'Não informado'}
              </div>
              <div style="font-weight: 700; color: #38bdf8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;" title="Recebedora: ${m.destinatario_nome || ''}">
                📥 Rec: ${m.destinatario_nome || 'Não informado'}
              </div>
            </div>
          </td>
          <td><span style="font-family: 'JetBrains Mono', monospace; font-size: 0.775rem; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">${placas}</span></td>
          <td style="font-weight: 600;">${m.uf_origem} -> ${m.uf_destino}</td>
          <td>
            <span class="badge-interstate" style="background: rgba(139, 92, 246, 0.2); border-color: rgba(139, 92, 246, 0.5); color: #c4b5fd; font-weight: 700; font-size: 0.75rem;">
              ${m.uf_origem} ➔ ${m.ufs_percurso || 'PE'} ➔ ${m.uf_destino}
            </span>
          </td>
          <td style="text-align: center; font-weight: 700;">${m.total_ctes_vinculados || 1}</td>
          <td style="text-align: right; font-family: 'JetBrains Mono', monospace;">${Number(m.peso_bruto || 10384).toLocaleString('pt-BR')} kg</td>
          <td class="currency-cell" style="color: #c4b5fd;">${formatBRL(m.valor_total_carga)}</td>
          <td style="text-align: center;">
            <div class="action-buttons" style="justify-content: center;">
              <button class="icon-btn" title="Visualizar DAMDFE" onclick="openDocPreview('${cleanKey}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
              <button class="icon-btn" title="Baixar XML Original" onclick="downloadOriginalXML('${cleanKey}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
              <button class="icon-btn danger" title="Excluir MDF-e" onclick="confirmDeleteTrip('MDF-e', '${m.id}', '${m.numero}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: var(--accent-rose); padding: 2rem;">Erro: ${err.message}</td></tr>`;
  }
}

/**
 * Load TAB: Driver Management (CRUD, Search & Batch Actions)
 */
async function loadDriversManagement() {
  const tableBody = document.getElementById('drivers-management-table-body');
  if (tableBody) {
    tableBody.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 2rem;">Carregando lista de condutores...</td></tr>`;
  }

  try {
    const res = await fetch('/api/drivers');
    const data = await res.json();
    const drivers = data.drivers || [];
    allDriversCache = drivers;

    renderDriversManagementTable();
  } catch (err) {
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="13" style="text-align: center; color: var(--accent-rose); padding: 2rem;">Erro ao carregar condutores: ${err.message}</td></tr>`;
    }
  }
}

/**
 * Render Drivers Management Table with multi-field search and filters
 */
function renderDriversManagementTable() {
  const tableBody = document.getElementById('drivers-management-table-body');
  if (!tableBody) return;

  const searchQuery = (document.getElementById('driver-search-input')?.value || '').trim().toLowerCase();
  const vinculoFilter = document.getElementById('driver-filter-vinculo')?.value || 'all';
  const statusFilter = document.getElementById('driver-filter-status')?.value || 'all';

  let filtered = allDriversCache || [];

  // Multi-field search (Nome, CPF, Placa Cavalo, Placa Carreta)
  if (searchQuery) {
    filtered = filtered.filter(drv => {
      const nome = (drv.nome || '').toLowerCase();
      const cpf = (drv.cpf || '').toLowerCase();
      const cavalo = (drv.placa_cavalo || '').toLowerCase();
      const carreta = (drv.placa_carreta || '').toLowerCase();
      return nome.includes(searchQuery) || 
             cpf.includes(searchQuery) || 
             cavalo.includes(searchQuery) || 
             carreta.includes(searchQuery);
    });
  }

  // Filter by Vínculo (Frota Própria, Agregado, Terceirizado)
  if (vinculoFilter !== 'all') {
    filtered = filtered.filter(drv => (drv.tipo_vinculo || 'frota_propria') === vinculoFilter);
  }

  // Filter by Status (Ativo / Inativo)
  if (statusFilter === 'active') {
    filtered = filtered.filter(drv => Boolean(drv.ativo));
  } else if (statusFilter === 'inactive') {
    filtered = filtered.filter(drv => !drv.ativo);
  }

  if (filtered.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="13" style="text-align: center; padding: 3rem; color: var(--text-muted);">Nenhum condutor encontrado com os filtros selecionados.</td></tr>`;
    updateDriversBatchBar();
    return;
  }

  const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  tableBody.innerHTML = filtered.map((drv) => {
    const isSelected = selectedDriverIds.has(drv.id);
    const statusBadge = drv.ativo 
      ? `<span class="badge-active">Ativo</span>` 
      : `<span class="badge-inactive">Inativo</span>`;

    const vinculoBadges = {
      'frota_propria': '<span class="badge-frota">Frota Própria</span>',
      'agregado': '<span class="badge-agregado">Agregado</span>',
      'terceirizado': '<span class="badge-terceirizado">Terceirizado</span>'
    };
    const badgeVinculo = vinculoBadges[drv.tipo_vinculo] || `<span class="badge-frota">${drv.tipo_vinculo || 'Frota Própria'}</span>`;

    const plates = [];
    if (drv.placa_cavalo) plates.push(`<span class="badge-plate">Cav: ${drv.placa_cavalo}</span>`);
    if (drv.placa_carreta) plates.push(`<span class="badge-plate">Car: ${drv.placa_carreta}</span>`);
    const platesHtml = plates.length > 0 ? plates.join(' ') : '<span style="color: var(--text-muted);">-</span>';

    return `
      <tr class="${isSelected ? 'selected-row' : ''}">
        <td style="text-align: center;">
          <input type="checkbox" class="driver-row-checkbox table-checkbox" data-id="${drv.id}" ${isSelected ? 'checked' : ''} onchange="toggleDriverSelection('${drv.id}', this.checked)">
        </td>
        <td style="font-weight: 700;">${drv.nome}</td>
        <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.775rem;">${drv.cpf}</td>
        <td>${badgeVinculo}</td>
        <td>${platesHtml}</td>
        <td>${drv.cnh || '<span style="color: var(--text-muted);">-</span>'}</td>
        <td style="text-align: center;">
          <div class="commission-badge-editable-wrapper" title="Clique ou altere o valor para editar a porcentagem de repasse deste condutor (Ex: 70%, 75%, 80%)">
            <input 
              type="number" 
              step="0.5" 
              min="0" 
              max="100" 
              value="${drv.percentual_comissao !== undefined ? drv.percentual_comissao : 75}"
              class="driver-commission-input"
              data-driver-id="${drv.id}"
              data-original-val="${drv.percentual_comissao !== undefined ? drv.percentual_comissao : 75}"
              onchange="quickUpdateDriverCommission('${drv.id}', this.value, '${escapeHtml(drv.nome)}')"
            />
            <span class="commission-unit">%</span>
            <button type="button" class="btn-quick-edit-commission" onclick="promptEditDriverCommission('${drv.id}', '${escapeHtml(drv.nome)}', ${drv.percentual_comissao !== undefined ? drv.percentual_comissao : 75})" title="Editar % de repasse deste condutor">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </div>
        </td>
        <td>${drv.telefone || '<span style="color: var(--text-muted);">-</span>'}</td>
        <td style="text-align: center; font-weight: 700;">${drv.total_ctes || 0}</td>
        <td style="text-align: right; font-family: 'JetBrains Mono', monospace;">${formatBRL(drv.total_frete)}</td>
        <td style="text-align: right; color: #34d399; font-family: 'JetBrains Mono', monospace; font-weight: 700;">
          ${formatBRL(drv.total_comissao)}
        </td>
        <td style="text-align: center;">${statusBadge}</td>
        <td style="text-align: center;">
          <div class="action-buttons" style="justify-content: center;">
            <button class="icon-btn" title="Editar Motorista" onclick="openDriverModal('${drv.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="icon-btn btn-outline-danger" title="Excluir Motorista" onclick="confirmDeleteDriver('${drv.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  updateDriversBatchBar();
}

/**
 * Fast Inline Commission Update for Driver
 */
async function quickUpdateDriverCommission(driverId, newPercent, driverName = '') {
  const pct = parseFloat(newPercent);
  if (isNaN(pct) || pct < 0 || pct > 100) {
    showToast('Por favor, informe uma porcentagem de repasse válida entre 0% e 100%.', 'warning');
    renderDriversManagementTable();
    return;
  }

  try {
    const res = await fetch(`/api/drivers/${driverId}/commission`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ percentual_comissao: pct })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast(data.message || `Comissão de ${driverName || 'Condutor'} atualizada para ${pct}%!`, 'success');

    // Atualiza cache local imediatamente
    if (Array.isArray(allDriversCache)) {
      const d = allDriversCache.find(x => x.id === driverId);
      if (d) d.percentual_comissao = pct;
    }

    await loadDrivers();
    await loadDriversManagement();
    await fetchAndRenderDocuments();
    if (typeof loadDriversAnalytics === 'function') loadDriversAnalytics();
  } catch (err) {
    console.error('Error updating driver commission:', err);
    showToast(`Erro ao atualizar comissão: ${err.message}`, 'error');
    renderDriversManagementTable();
  }
}
window.quickUpdateDriverCommission = quickUpdateDriverCommission;

/**
 * Prompt to edit commission percentage
 */
function promptEditDriverCommission(driverId, driverName, currentVal) {
  const input = prompt(`Alterar porcentagem de repasse para ${driverName}:\n(Exemplo: 70, 75, 80, 85, etc.)`, currentVal !== undefined ? currentVal : 75);
  if (input !== null && input.trim() !== '') {
    quickUpdateDriverCommission(driverId, input.trim(), driverName);
  }
}
window.promptEditDriverCommission = promptEditDriverCommission;

/**
 * Driver Checkbox Selection Logic
 */
function toggleDriverSelection(driverId, checked) {
  if (checked) {
    selectedDriverIds.add(driverId);
  } else {
    selectedDriverIds.delete(driverId);
  }
  updateDriversBatchBar();
}

function toggleSelectAllDrivers(checked) {
  const checkboxes = document.querySelectorAll('.driver-row-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = checked;
    const id = cb.getAttribute('data-id');
    if (id) {
      if (checked) selectedDriverIds.add(id);
      else selectedDriverIds.delete(id);
    }
  });
  updateDriversBatchBar();
}

function clearDriverSelections() {
  selectedDriverIds.clear();
  const selectAll = document.getElementById('drivers-select-all');
  if (selectAll) selectAll.checked = false;
  document.querySelectorAll('.driver-row-checkbox').forEach(cb => cb.checked = false);
  updateDriversBatchBar();
}

function updateDriversBatchBar() {
  const bar = document.getElementById('drivers-batch-bar');
  const countBadge = document.getElementById('drivers-selected-count');
  const count = selectedDriverIds.size;
  if (countBadge) countBadge.textContent = count;
  if (bar) {
    bar.style.display = count > 0 ? 'flex' : 'none';
  }

  // Update master select-all checkbox state
  const selectAll = document.getElementById('drivers-select-all');
  const visibleCheckboxes = document.querySelectorAll('.driver-row-checkbox');
  if (selectAll && visibleCheckboxes.length > 0) {
    const allChecked = Array.from(visibleCheckboxes).every(cb => cb.checked);
    selectAll.checked = allChecked;
  }
}

/**
 * Batch Delete / Deactivate Selected Drivers
 */
async function batchDeleteSelectedDrivers() {
  const ids = Array.from(selectedDriverIds);
  if (ids.length === 0) {
    showToast('Nenhum motorista selecionado para exclusão.', 'warning');
    return;
  }

  if (!confirm(`Confirma a exclusão de ${ids.length} motorista(s) selecionado(s)? Esta ação removerá os motoristas do sistema.`)) {
    return;
  }

  try {
    const res = await fetch('/api/drivers/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast(data.message || `${ids.length} motoristas excluídos com sucesso!`, 'success');
    clearDriverSelections();
    await loadDrivers();
    await loadDriversManagement();
    await fetchAndRenderDocuments();
    if (typeof loadDriversAnalytics === 'function') loadDriversAnalytics();
  } catch (err) {
    showToast(`Erro ao excluir motoristas em lote: ${err.message}`, 'error');
  }
}

/**
 * Driver Modal: Open for Create or Edit
 */
function openDriverModal(driverId = null) {
  const form = document.getElementById('form-driver');
  form.reset();

  if (driverId) {
    const drv = allDriversCache.find(d => d.id === driverId);
    if (drv) {
      document.getElementById('modal-driver-title').textContent = `Editar Motorista: ${drv.nome}`;
      document.getElementById('driver-edit-id').value = drv.id;
      document.getElementById('driver-nome').value = drv.nome;
      document.getElementById('driver-cpf').value = drv.cpf;
      document.getElementById('driver-cnh').value = drv.cnh || '';
      document.getElementById('driver-vinculo').value = drv.tipo_vinculo || 'frota_propria';
      document.getElementById('driver-placa-cavalo').value = drv.placa_cavalo || '';
      document.getElementById('driver-placa-carreta').value = drv.placa_carreta || '';
      document.getElementById('driver-comissao').value = drv.percentual_comissao || 75.0;
      document.getElementById('driver-telefone').value = drv.telefone || '';
      document.getElementById('driver-pix').value = drv.chave_pix || '';
      document.getElementById('driver-ativo').checked = Boolean(drv.ativo);
    }
  } else {
    document.getElementById('modal-driver-title').textContent = 'Cadastrar Novo Motorista';
    document.getElementById('driver-edit-id').value = '';
    document.getElementById('driver-vinculo').value = 'frota_propria';
    document.getElementById('driver-placa-cavalo').value = '';
    document.getElementById('driver-placa-carreta').value = '';
    document.getElementById('driver-comissao').value = '75.0';
    document.getElementById('driver-ativo').checked = true;
  }

  openModal('modal-driver');
}

/**
 * Setup Event Listeners
 */
function setupEventListeners() {
  // Filter form submit
  const filterForm = document.getElementById('filter-form');
  filterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    currentFilters.startDate = document.getElementById('filter-start-date').value;
    currentFilters.endDate = document.getElementById('filter-end-date').value;
    currentFilters.driverId = document.getElementById('filter-driver').value;
    currentFilters.docType = document.getElementById('filter-doc-type').value;
    currentFilters.destination = document.getElementById('filter-destination').value.trim();
    fetchAndRenderDocuments();
  });

  // Search category selector
  const searchCat = document.getElementById('search-category');
  if (searchCat) {
    searchCat.addEventListener('change', (e) => {
      currentFilters.searchType = e.target.value;
      fetchAndRenderDocuments();
    });
  }

  // Clear filters
  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    initDateDefaults();
    document.getElementById('filter-driver').value = 'all';
    document.getElementById('filter-doc-type').value = 'all';
    document.getElementById('filter-destination').value = '';
    document.getElementById('table-search').value = '';
    const catEl = document.getElementById('search-category');
    if (catEl) catEl.value = 'all';
    currentFilters.driverId = 'all';
    currentFilters.docType = 'all';
    currentFilters.destination = '';
    currentFilters.search = '';
    currentFilters.searchType = 'all';
    fetchAndRenderDocuments();
  });

  // Search input debouncing with multi-field searchType
  let searchTimer;
  document.getElementById('table-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentFilters.search = e.target.value.trim();
      const catEl = document.getElementById('search-category');
      if (catEl) currentFilters.searchType = catEl.value;
      fetchAndRenderDocuments();
    }, 300);
  });

  // Manual Trip Form Submit
  const manualForm = document.getElementById('form-manual-trip');
  if (manualForm) {
    manualForm.addEventListener('submit', saveManualTrip);
  }

  // Manual Trip Driver Select Change
  const manualDriverSelect = document.getElementById('manual-trip-driver');
  if (manualDriverSelect) {
    manualDriverSelect.addEventListener('change', updateManualCommissionPreview);
  }

  // =========================================================================
  // RELATÓRIOS DE PRESTAÇÃO DE CONTAS AO FINANCEIRO (PDF & EXCEL)
  // =========================================================================
  const handleExportExcel = () => {
    const query = new URLSearchParams(currentFilters).toString();
    showToast('Gerando relatório completo de prestação de contas (.xlsx) com múltiplas abas...', 'info');
    window.location.href = `/api/export/excel?${query}`;
  };
  window.handleExportExcel = handleExportExcel;

  const btnExportExcel = document.getElementById('btn-export-excel');
  if (btnExportExcel) btnExportExcel.addEventListener('click', handleExportExcel);

  const overviewExportExcel = document.getElementById('overview-btn-export-excel');
  if (overviewExportExcel) overviewExportExcel.addEventListener('click', handleExportExcel);

  const btnExportPdf = document.getElementById('btn-export-pdf');
  if (btnExportPdf) btnExportPdf.addEventListener('click', () => openFinancialReportModal());

  const overviewExportPdf = document.getElementById('overview-btn-export-pdf');
  if (overviewExportPdf) overviewExportPdf.addEventListener('click', () => openFinancialReportModal());

  window.printFinancialReport = function() {
    const reportSheet = document.getElementById('financial-report-print-area') || document.getElementById('financial-report-content');
    if (!reportSheet) {
      showToast('Conteúdo do relatório ainda não carregado.', 'warning');
      return;
    }

    // Cria ou reutiliza iframe oculto dedicado para impressão 100% isolada e compatível
    let printFrame = document.getElementById('print-report-iframe');
    if (!printFrame) {
      printFrame = document.createElement('iframe');
      printFrame.id = 'print-report-iframe';
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      printFrame.style.visibility = 'hidden';
      document.body.appendChild(printFrame);
    }

    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Prestação de Contas - Setor Financeiro | CARGA BALANCE</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 landscape;
      margin: 8mm 6mm 8mm 6mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff !important;
      color: #0f172a !important;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 10px;
      line-height: 1.35;
    }
    .fin-report-sheet {
      background: #ffffff !important;
      color: #0f172a !important;
      padding: 0 !important;
      width: 100% !important;
      box-shadow: none !important;
      border: none !important;
    }
    .fin-report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 8px;
      border-bottom: 2px solid #0f172a;
      margin-bottom: 10px;
    }
    .fin-brand-title {
      font-size: 14px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .fin-brand-subtitle {
      font-size: 11px;
      color: #1e293b;
      font-weight: 700;
      margin-top: 2px;
    }
    .fin-report-meta-box {
      text-align: right;
      font-size: 9.5px;
      color: #475569;
    }
    .fin-report-meta-box strong {
      color: #0f172a;
    }
    .fin-status-stamp {
      display: inline-block;
      padding: 2px 8px;
      background: #ecfdf5 !important;
      color: #047857 !important;
      border: 1px solid #a7f3d0;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 8.5px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .fin-kpi-summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .fin-kpi-card {
      padding: 8px 10px;
      border-radius: 4px;
      border: 1px solid #cbd5e1;
      background: #f8fafc !important;
    }
    .fin-kpi-card.blue { border-left: 4px solid #2563eb !important; }
    .fin-kpi-card.green { border-left: 4px solid #059669 !important; }
    .fin-kpi-card.amber { border-left: 4px solid #d97706 !important; }
    .fin-kpi-card.purple { border-left: 4px solid #7c3aed !important; }
    .fin-kpi-title {
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      color: #475569;
      margin-bottom: 2px;
    }
    .fin-kpi-val {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
    }
    .fin-kpi-card.blue .fin-kpi-val { color: #1d4ed8 !important; }
    .fin-kpi-card.green .fin-kpi-val { color: #047857 !important; }
    .fin-kpi-card.amber .fin-kpi-val { color: #b45309 !important; }
    .fin-kpi-desc {
      font-size: 8.5px;
      color: #64748b;
      margin-top: 2px;
    }
    .fin-sec-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #0f172a !important;
      color: #ffffff !important;
      padding: 5px 8px;
      border-radius: 3px;
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      margin: 10px 0 5px 0;
    }
    .fin-sec-header.green { background: #065f46 !important; }
    .fin-sec-header.blue { background: #1e3a8a !important; }
    table.fin-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
      margin-bottom: 8px;
    }
    table.fin-table th {
      background: #e2e8f0 !important;
      color: #0f172a !important;
      font-weight: 700;
      text-align: left;
      padding: 4px 6px;
      border: 1px solid #cbd5e1;
      font-size: 8.5px;
      text-transform: uppercase;
    }
    table.fin-table td {
      padding: 4px 6px;
      border: 1px solid #e2e8f0;
      color: #1e293b;
    }
    table.fin-table tr:nth-child(even) td {
      background: #f8fafc !important;
    }
    table.fin-table tr.total-row td {
      background: #e2e8f0 !important;
      font-weight: 800;
      color: #0f172a;
      border-top: 2px solid #0f172a;
      border-bottom: 2px solid #0f172a;
    }
    .text-right { text-align: right !important; }
    .text-center { text-align: center !important; }
    .fin-badge-cte { color: #0d9488 !important; font-weight: 700; }
    .fin-badge-mdfe { color: #6366f1 !important; font-weight: 700; }
    .fin-signatures-container {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px dashed #94a3b8;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .fin-sign-col { text-align: center; }
    .fin-sign-line {
      border-bottom: 1px solid #0f172a;
      margin-bottom: 4px;
      height: 22px;
    }
    .fin-sign-role {
      font-weight: 700;
      font-size: 9px;
      color: #0f172a;
    }
    .fin-sign-dept {
      font-size: 8px;
      color: #475569;
    }
    tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .no-print {
      display: none !important;
    }
  </style>
</head>
<body>
  ${reportSheet.outerHTML}
</body>
</html>`;

    const frameDoc = printFrame.contentWindow || printFrame.contentDocument;
    const doc = frameDoc.document || frameDoc;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
    }, 300);
  };

  window.printDacte = function() {
    const dacteSheet = document.getElementById('modal-dacte-content');
    if (!dacteSheet) {
      window.print();
      return;
    }
    let printFrame = document.getElementById('print-report-iframe');
    if (!printFrame) {
      printFrame = document.createElement('iframe');
      printFrame.id = 'print-report-iframe';
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      printFrame.style.border = '0';
      printFrame.style.visibility = 'hidden';
      document.body.appendChild(printFrame);
    }
    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Documento Fiscal Auxiliar | CARGA BALANCE</title>
  <style>
    @page { size: A4 portrait; margin: 6mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { margin: 0; padding: 0; background: #fff; font-family: monospace, sans-serif; font-size: 11px; }
    .dacte-sheet { width: 100%; border: 1px solid #000; padding: 4px; }
    .no-print { display: none !important; }
  </style>
</head>
<body>
  ${dacteSheet.innerHTML}
</body>
</html>`;
    const frameDoc = printFrame.contentWindow || printFrame.contentDocument;
    const doc = frameDoc.document || frameDoc;
    doc.open();
    doc.write(htmlContent);
    doc.close();
    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
    }, 300);
  };

  window.openFinancialReportModal = async function() {
    const container = document.getElementById('financial-report-content');
    if (!container) return;

    openModal('modal-financial-report');

    // 1. Renderização instantânea imediata a partir do cache para NUNCA travar a tela
    let docs = (Array.isArray(allDocumentsCache) && allDocumentsCache.length > 0) ? [...allDocumentsCache] : [];
    let kpis = currentKPIsCache || null;

    if (docs.length > 0) {
      renderFinancialReportContent(container, docs, kpis);
    } else {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
          <div class="loading-spinner" style="margin: 0 auto 1rem;"></div>
          <p style="font-weight: 600; font-size: 0.95rem; color: #1e293b;">Carregando informações financeiras e fiscais dos condutores e frotas...</p>
        </div>
      `;
    }

    // 2. Busca dados atualizados da API em segundo plano
    try {
      const query = new URLSearchParams(currentFilters || {}).toString();
      const res = await fetch(`/api/documents?${query}`);
      const data = await res.json();
      if (data && data.success && Array.isArray(data.items) && data.items.length > 0) {
        docs = data.items;
        kpis = data.kpis;
        renderFinancialReportContent(container, docs, kpis);
        return;
      }
    } catch (err) {
      console.warn('Consulta filtrada com aviso, utilizando dados consolidados:', err);
    }

    // 3. Fallback: se os filtros ativos não retornaram itens, busca todos os documentos sem restrição de data
    if (!docs || docs.length === 0) {
      try {
        const resAll = await fetch('/api/documents');
        const dataAll = await resAll.json();
        if (dataAll && dataAll.success && Array.isArray(dataAll.items) && dataAll.items.length > 0) {
          docs = dataAll.items;
          kpis = dataAll.kpis;
          renderFinancialReportContent(container, docs, kpis);
          return;
        }
      } catch (errAll) {
        console.error('Erro na consulta geral de fallback:', errAll);
      }
    }

    // Renderização final
    renderFinancialReportContent(container, docs, kpis);
  };

  /**
   * Renderiza o relatório completo de prestação de contas com cálculos individuais e gerais
   */
  function renderFinancialReportContent(container, docs = [], kpis = null) {
    if (!container) return;

    const formatMoney = (val) => Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Função de formatação detalhada de data e horário para leitura simples
    const formatDateTimeDetailed = (dtStr, fallbackStr = null) => {
      const target = dtStr || fallbackStr;
      if (!target) return '<span style="color: #94a3b8; font-size: 0.725rem;">Não informado</span>';
      try {
        const d = new Date(target);
        if (isNaN(d.getTime())) return `<span style="font-weight: 600; color: #1e293b;">${escapeHtml(target)}</span>`;
        const dia = String(d.getDate()).padStart(2, '0');
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const ano = d.getFullYear();
        const hora = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `
          <div style="font-weight: 600; color: #1e293b; font-size: 0.775rem;">${dia}/${mes}/${ano}</div>
          <div style="font-size: 0.7rem; color: #64748b;">às ${hora}:${min}h</div>
        `;
      } catch {
        return `<span style="font-weight: 600; color: #1e293b;">${escapeHtml(target)}</span>`;
      }
    };

    const ctes = docs.filter(d => (d.tipo || '').toUpperCase() === 'CT-E' || (d.tipo || '').toUpperCase() === 'CTE');
    const mdfes = docs.filter(d => (d.tipo || '').toUpperCase() === 'MDF-E' || (d.tipo || '').toUpperCase() === 'MDFE');

    // Cálculos Gerais Consolidados
    const totalFrete = ctes.reduce((acc, c) => acc + (parseFloat(c.valor) || 0), 0);
    const totalICMS = ctes.reduce((acc, c) => acc + (parseFloat(c.valor_icms) || 0), 0);
    const totalCarga = mdfes.reduce((acc, m) => acc + (parseFloat(m.valor) || 0), 0);
    const interstateCount = docs.filter(d => d.interestadual === 1 || (d.uf_origem && d.uf_destino && d.uf_origem !== d.uf_destino) || (d.uf_destino && d.uf_destino !== 'AL')).length;

    // Agrupamento Individual por Condutor e Frota com Percentuais Dinâmicos
    const driverMap = {};
    docs.forEach(d => {
      const cpf = (d.motorista_cpf || '').trim();
      const nome = (d.motorista_nome || 'Não Informado').trim();
      const key = cpf || nome || 'Outros';

      const matchedDriver = Array.isArray(allDriversCache) ? allDriversCache.find(drv => 
        (cpf && drv.cpf && drv.cpf === cpf) || 
        (nome && drv.nome && drv.nome.toUpperCase() === nome.toUpperCase())
      ) : null;
      const driverPercent = matchedDriver && matchedDriver.percentual_comissao !== undefined
        ? parseFloat(matchedDriver.percentual_comissao)
        : (parseFloat(d.percentual_comissao) || 75.0);

      if (!driverMap[key]) {
        // Placas
        const cavalo = (d.motorista_placa_cavalo || d.placa_tracao || '').trim().toUpperCase();
        const carreta = (d.motorista_placa_carreta || d.placa_reboque || '').trim().toUpperCase();
        const placasArr = [cavalo, carreta].filter(Boolean);
        const placasStr = placasArr.length > 0 ? placasArr.join(' / ') : '-';

        // Vínculo
        const vinculoRaw = (d.motorista_tipo_vinculo || d.vinculo || (matchedDriver ? matchedDriver.tipo_vinculo : 'frota_propria')).toLowerCase();
        let vinculoLabel = 'Frota Própria';
        let vinculoColor = '#2563eb';
        let vinculoBg = '#dbeafe';

        if (vinculoRaw.includes('agregado')) {
          vinculoLabel = 'Agregado';
          vinculoColor = '#059669';
          vinculoBg = '#d1fae5';
        } else if (vinculoRaw.includes('terceirizado')) {
          vinculoLabel = 'Terceirizado';
          vinculoColor = '#7c3aed';
          vinculoBg = '#ede9fe';
        }

        driverMap[key] = {
          key,
          id: matchedDriver ? matchedDriver.id : null,
          nome,
          cpf: cpf || (matchedDriver ? matchedDriver.cpf : '-'),
          cnh: (d.motorista_cnh || (matchedDriver ? matchedDriver.cnh : '') || '').trim() || '-',
          vinculoRaw,
          vinculoLabel,
          vinculoColor,
          vinculoBg,
          placas: placasStr !== '-' ? placasStr : ([matchedDriver?.placa_cavalo, matchedDriver?.placa_carreta].filter(Boolean).join(' / ') || '-'),
          pix: (d.motorista_chave_pix || (matchedDriver ? matchedDriver.chave_pix : '') || '').trim() || 'A Cadastrar',
          telefone: (d.motorista_telefone || (matchedDriver ? matchedDriver.telefone : '') || '').trim() || '-',
          percentualComissao: driverPercent,
          qtdViagens: 0,
          totalFrete: 0,
          totalComissao: 0,
          totalMargem: 0
        };
      }

      const val = parseFloat(d.valor || 0);
      const com = parseFloat(d.valor_comissao !== undefined && d.valor_comissao !== null 
        ? d.valor_comissao 
        : (d.tipo === 'CT-e' ? (val * (driverPercent / 100.0)) : 0));

      driverMap[key].qtdViagens += 1;
      if ((d.tipo || '').toUpperCase().includes('CT')) {
        driverMap[key].totalFrete += val;
        driverMap[key].totalComissao += com;
        driverMap[key].totalMargem += Math.max(0, val - com);
      }
    });

    const driverList = Object.values(driverMap).sort((a, b) => b.totalComissao - a.totalComissao);
    const totalComissaoGeral = driverList.reduce((acc, d) => acc + d.totalComissao, 0);
    const totalMargemGeral = Math.max(0, totalFrete - totalComissaoGeral);

    const nowStr = new Date().toLocaleString('pt-BR');
    const periodText = (currentFilters.startDate || currentFilters.endDate)
      ? `${currentFilters.startDate || 'Início'} até ${currentFilters.endDate || 'Atual'}`
      : 'Histórico Completo de Viagens';
    const auditCode = `AUD-FIN-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    container.innerHTML = `
      <div class="fin-report-sheet" id="financial-report-print-area">
        <!-- Header Oficial Executivo -->
        <div class="fin-report-header">
          <div>
            <div class="fin-brand-title">
              <span style="display: inline-block; width: 14px; height: 14px; background: #2563eb; border-radius: 3px;"></span>
              CARGA BALANCE &bull; AUDITORIA DE FRETE
            </div>
            <div class="fin-brand-subtitle" style="font-weight: 700; color: #1e293b;">
              DEMONSTRATIVO DE PRESTAÇÃO DE CONTAS FINANCEIRA E FISCAL &bull; SETOR FINANCEIRO & CONTÁBIL
            </div>
            <div style="font-size: 0.75rem; color: #475569; margin-top: 0.35rem;">
              Transportadora Central de Cargas &bull; CNPJ Emissor: <strong>20.664.328/0001-10</strong> &bull; Maceió / AL
            </div>
          </div>
          <div class="fin-report-meta-box">
            <span class="fin-status-stamp">✓ Auditado SEFAZ & Liberado</span>
            <div>Protocolo: <strong>${auditCode}</strong></div>
            <div>Período: <strong>${escapeHtml(periodText)}</strong></div>
            <div>Emissão: <strong>${nowStr}</strong></div>
          </div>
        </div>

        <!-- 1. RESUMO EXECUTIVO: CÁLCULOS GERAIS CONSOLIDADOS DA OPERAÇÃO -->
        <div style="margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
          <h4 style="margin: 0; font-size: 0.9rem; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.03em;">
            1. Totalizadores Gerais Consolidados da Operação
          </h4>
          <span style="font-size: 0.75rem; color: #64748b;">${docs.length} documentos fiscais auditados</span>
        </div>

        <div class="fin-kpi-summary-grid">
          <div class="fin-kpi-card blue">
            <div class="fin-kpi-title">Faturamento Total Fretes (CT-e)</div>
            <div class="fin-kpi-val">${formatMoney(totalFrete)}</div>
            <div class="fin-kpi-desc">${ctes.length} Conhecimentos CT-e faturados</div>
          </div>
          <div class="fin-kpi-card green">
            <div class="fin-kpi-title">Comissões dos Motoristas (Repasses)</div>
            <div class="fin-kpi-val" style="color: #047857;">${formatMoney(totalComissaoGeral)}</div>
            <div class="fin-kpi-desc">Repasse líquido individualizado aos condutores</div>
          </div>
          <div class="fin-kpi-card blue">
            <div class="fin-kpi-title">Margem Transportadora</div>
            <div class="fin-kpi-val" style="color: #1e40af;">${formatMoney(totalMargemGeral)}</div>
            <div class="fin-kpi-desc">Receita líquida retida pela empresa</div>
          </div>
          <div class="fin-kpi-card amber">
            <div class="fin-kpi-title">Total ICMS Destacado</div>
            <div class="fin-kpi-val" style="color: #b45309;">${formatMoney(totalICMS)}</div>
            <div class="fin-kpi-desc">Tributos recolhidos nas operações fiscais</div>
          </div>
        </div>

        <!-- 2. CÁLCULOS INDIVIDUAIS POR MOTORISTA E FROTA (REPASSE E COMISSÕES PERSONALIZADAS) -->
        <div class="fin-sec-header green" style="display: flex; justify-content: space-between; align-items: center;">
          <span>2. CÁLCULOS INDIVIDUAIS POR MOTORISTA & FROTA (REPASSE E COMISSÕES PERSONALIZADAS)</span>
          <span style="font-size: 0.725rem; font-weight: 500;">${driverList.length} Motorista(s) Auditado(s)</span>
        </div>

        <table class="fin-table">
          <thead>
            <tr>
              <th style="width: 20%;">Motorista / Condutor</th>
              <th class="text-center" style="width: 12%;">CPF</th>
              <th class="text-center" style="width: 10%;">Vínculo</th>
              <th class="text-center" style="width: 12%;">Placas (Cavalo / Carreta)</th>
              <th class="text-center" style="width: 13%;">Chave PIX / Contato</th>
              <th class="text-center" style="width: 6%;">Viagens</th>
              <th class="text-right" style="width: 9%;">Frete Bruto</th>
              <th class="text-center" style="width: 9%;">% Repasse</th>
              <th class="text-right" style="color: #047857; width: 11%;">Comissão Líquida</th>
              <th class="text-center" style="width: 8%;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${driverList.length === 0 ? `
              <tr>
                <td colspan="10" class="text-center" style="padding: 2rem; color: #64748b;">
                  Nenhum motorista com frete localizado no período selecionado.
                </td>
              </tr>
            ` : driverList.map(d => `
              <tr>
                <td>
                  <strong style="color: #0f172a; font-size: 0.825rem;">${escapeHtml(d.nome)}</strong>
                  ${d.cnh !== '-' ? `<div style="font-size: 0.7rem; color: #64748b;">CNH: ${escapeHtml(d.cnh)}</div>` : ''}
                </td>
                <td class="text-center" style="font-family: monospace; font-size: 0.75rem;">
                  ${escapeHtml(d.cpf)}
                </td>
                <td class="text-center">
                  <span style="display: inline-block; padding: 2px 7px; border-radius: 4px; font-weight: 700; font-size: 0.675rem; background: ${d.vinculoBg}; color: ${d.vinculoColor};">
                    ${escapeHtml(d.vinculoLabel)}
                  </span>
                </td>
                <td class="text-center" style="font-family: monospace; font-size: 0.75rem; font-weight: 600;">
                  ${escapeHtml(d.placas)}
                </td>
                <td class="text-center">
                  <code style="font-size: 0.725rem; font-weight: 700; color: #1e293b;">${escapeHtml(d.pix)}</code>
                  ${d.telefone !== '-' ? `<div style="font-size: 0.675rem; color: #64748b;">Tel: ${escapeHtml(d.telefone)}</div>` : ''}
                </td>
                <td class="text-center" style="font-weight: 700; font-size: 0.8rem;">
                  ${d.qtdViagens}
                </td>
                <td class="text-right" style="font-weight: 600;">
                  ${formatMoney(d.totalFrete)}
                </td>
                <td class="text-center">
                  ${d.id ? `
                    <div class="commission-badge-editable-wrapper" style="padding: 1px 4px;" title="Clique ou altere para editar % de repasse deste condutor">
                      <input 
                        type="number" 
                        step="0.5" 
                        min="0" 
                        max="100" 
                        value="${d.percentualComissao}"
                        class="driver-commission-input"
                        style="width: 44px; font-size: 0.775rem;"
                        onchange="quickUpdateDriverCommission('${d.id}', this.value, '${escapeHtml(d.nome)}').then(() => openFinancialReportModal())"
                      />
                      <span class="commission-unit" style="font-size: 0.725rem;">%</span>
                    </div>
                  ` : `
                    <span style="display: inline-block; padding: 2px 6px; background: rgba(16, 185, 129, 0.1); color: #047857; border-radius: 4px; font-weight: 700; font-size: 0.75rem;">
                      ${d.percentualComissao}%
                    </span>
                  `}
                </td>
                <td class="text-right" style="font-weight: 800; color: #047857; font-size: 0.85rem; background: rgba(16, 185, 129, 0.05);">
                  ${formatMoney(d.totalComissao)}
                </td>
                <td class="text-center">
                  <span style="display: inline-block; padding: 2px 6px; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; border-radius: 4px; font-weight: 700; font-size: 0.675rem;">
                    Liberado
                  </span>
                </td>
              </tr>
            `).join('')}
            <tr class="total-row" style="background: #f1f5f9; font-weight: 800;">
              <td colspan="5">
                <strong style="color: #0f172a; text-transform: uppercase;">Total Geral Consolidado dos Condutores</strong>
              </td>
              <td class="text-center" style="color: #0f172a;">
                <strong>${driverList.reduce((acc, d) => acc + d.qtdViagens, 0)}</strong>
              </td>
              <td class="text-right" style="color: #0f172a;">
                <strong>${formatMoney(driverList.reduce((acc, d) => acc + d.totalFrete, 0))}</strong>
              </td>
              <td class="text-center" style="color: #047857; font-size: 0.75rem;">
                <strong>PERSONALIZADO</strong>
              </td>
              <td class="text-right" style="color: #047857; font-size: 0.9rem;">
                <strong>${formatMoney(totalComissaoGeral)}</strong>
              </td>
              <td class="text-center" style="color: #047857;">
                <strong>APROVADO</strong>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 3. DEMONSTRATIVO ANALÍTICO DE VIAGENS: DESTINOS, DATAS, HORÁRIOS & VALORES -->
        <div class="fin-sec-header blue" style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem;">
          <span>3. DETALHAMENTO DAS VIAGENS: DESTINOS, ROTAS, CRONOGRAMA (DATAS E HORÁRIOS) & VALORES</span>
          <span style="font-size: 0.725rem; font-weight: 500;">${docs.length} Viagem(ns) Realizada(s)</span>
        </div>

        <div style="overflow-x: auto;">
          <table class="fin-table" style="font-size: 0.75rem;">
            <thead>
              <tr>
                <th class="text-center" style="width: 8%;">Doc Fiscal</th>
                <th style="width: 13%;">Condutor & Frota</th>
                <th class="text-center" style="width: 10%;">Placas</th>
                <th style="width: 18%;">Remetente ➔ Recebedor</th>
                <th style="width: 17%;">Origem ➔ Destino</th>
                <th style="width: 14%;">Cronograma (Datas & Horários)</th>
                <th class="text-right" style="width: 9%;">Frete (R$)</th>
                <th class="text-right" style="width: 8%;">ICMS (R$)</th>
                <th class="text-right" style="color: #047857; width: 9%;">Comissão Líquida</th>
              </tr>
            </thead>
            <tbody>
              ${docs.length === 0 ? `
                <tr>
                  <td colspan="9" class="text-center" style="padding: 2rem; color: #64748b;">
                    Nenhuma viagem auditada para os parâmetros selecionados.
                  </td>
                </tr>
              ` : docs.map(doc => {
                const isCte = (doc.tipo || '').toUpperCase().includes('CT');
                const val = parseFloat(doc.valor || 0);
                const icms = parseFloat(doc.valor_icms || 0);
                const com = parseFloat(doc.valor_comissao || (isCte ? (val * 0.75) : 0));
                const cavalo = (doc.motorista_placa_cavalo || doc.placa_tracao || '').trim().toUpperCase();
                const carreta = (doc.motorista_placa_carreta || doc.placa_reboque || '').trim().toUpperCase();
                const placasStr = [cavalo, carreta].filter(Boolean).join(' / ') || '-';
                const isInterstate = doc.interestadual === 1 || (doc.uf_origem && doc.uf_destino && doc.uf_origem !== doc.uf_destino);

                const vinculoRaw = (doc.motorista_tipo_vinculo || 'frota_propria').toLowerCase();
                let vinculoText = 'Frota Própria';
                if (vinculoRaw.includes('agregado')) vinculoText = 'Agregado';
                else if (vinculoRaw.includes('terceirizado')) vinculoText = 'Terceirizado';

                return `
                  <tr>
                    <td class="text-center">
                      <span class="${isCte ? 'fin-badge-cte' : 'fin-badge-mdfe'}" style="font-weight: 800; font-size: 0.75rem;">
                        ${escapeHtml(doc.tipo)}
                      </span>
                      <div style="font-size: 0.725rem; font-weight: 700; color: #0f172a;">
                        nº ${escapeHtml(String(doc.numero || ''))}
                      </div>
                      <span style="font-size: 0.65rem; color: #64748b;">Série ${escapeHtml(String(doc.serie || '1'))}</span>
                    </td>
                    <td>
                      <div style="font-weight: 700; color: #0f172a;">${escapeHtml(doc.motorista_nome || 'Não Informado')}</div>
                      <span style="font-size: 0.675rem; color: #475569; text-transform: uppercase;">
                        ${escapeHtml(vinculoText)}
                      </span>
                    </td>
                    <td class="text-center" style="font-family: monospace; font-size: 0.725rem; font-weight: 600;">
                      ${escapeHtml(placasStr)}
                    </td>
                    <td>
                      <div style="font-weight: 600; color: #1e293b; font-size: 0.725rem;">
                        <strong>Rem:</strong> ${escapeHtml(doc.remetente_nome || 'Não informado')}
                      </div>
                      <div style="color: #475569; font-size: 0.7rem;">
                        <strong>Dest:</strong> ${escapeHtml(doc.destinatario_nome || 'Não informado')}
                      </div>
                    </td>
                    <td>
                      <div style="font-weight: 700; color: #1e293b;">
                        ${escapeHtml(doc.origem || 'AL')} ➔ ${escapeHtml(doc.destino || 'DEST')}
                      </div>
                      ${isInterstate ? `
                        <span style="display: inline-block; padding: 1px 5px; background: #dbeafe; color: #1d4ed8; border-radius: 3px; font-weight: 700; font-size: 0.625rem; margin-top: 2px;">
                          Interestadual ${doc.ufs_percurso ? `(${escapeHtml(doc.ufs_percurso)})` : ''}
                        </span>
                      ` : `
                        <span style="display: inline-block; padding: 1px 5px; background: #f1f5f9; color: #475569; border-radius: 3px; font-size: 0.625rem; margin-top: 2px;">
                          Operação Interna
                        </span>
                      `}
                    </td>
                    <td>
                      <div><strong style="color: #64748b; font-size: 0.675rem;">Saída:</strong> ${formatDateTimeDetailed(doc.data_saida, doc.data_emissao)}</div>
                      <div style="margin-top: 3px;"><strong style="color: #64748b; font-size: 0.675rem;">Prev. Chegada:</strong> ${formatDateTimeDetailed(doc.previsao_chegada, null)}</div>
                    </td>
                    <td class="text-right" style="font-weight: 700; color: #0f172a;">
                      ${formatMoney(val)}
                    </td>
                    <td class="text-right" style="color: #64748b;">
                      ${formatMoney(icms)}
                    </td>
                    <td class="text-right" style="font-weight: 800; color: #047857; background: rgba(16, 185, 129, 0.05);">
                      ${formatMoney(com)}
                    </td>
                  </tr>
                `;
              }).join('')}
              <tr class="total-row" style="background: #f1f5f9; font-weight: 800;">
                <td colspan="6">
                  <strong style="color: #0f172a; text-transform: uppercase;">Total de Fretes, ICMS e Repasses das Viagens</strong>
                </td>
                <td class="text-right" style="color: #0f172a;">
                  <strong>${formatMoney(totalFrete)}</strong>
                </td>
                <td class="text-right" style="color: #0f172a;">
                  <strong>${formatMoney(totalICMS)}</strong>
                </td>
                <td class="text-right" style="color: #047857; font-size: 0.9rem;">
                  <strong>${formatMoney(totalComissao75)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 4. TERMO DE CONFORMIDADE FISCAL E PROTOCOLO DE ASSINATURAS -->
        <div style="margin-top: 1.5rem; padding: 0.85rem; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.75rem; color: #334155; line-height: 1.5;">
          <strong>Termo de Responsabilidade & Conformidade Contábil:</strong> Declaramos que os valores brutos de frete, os recolhimentos destacados de ICMS e os cálculos individuais e gerais de comissões destinados aos condutores (fixados na regra de 75,0% sobre o frete faturado) foram rigorosamente auditados e conferidos em conformidade com as autorizações fiscais da Secretaria da Fazenda (SEFAZ).
        </div>

        <div class="fin-signatures-container">
          <div class="fin-sign-col">
            <div class="fin-sign-line"></div>
            <div class="fin-sign-role">Auditoria de Fretes & Transporte</div>
            <div class="fin-sign-dept">Conferência Fiscal & SEFAZ</div>
          </div>
          <div class="fin-sign-col">
            <div class="fin-sign-line"></div>
            <div class="fin-sign-role">Gerência Financeira & Contábil</div>
            <div class="fin-sign-dept">Contas a Pagar / Liberação PIX</div>
          </div>
          <div class="fin-sign-col">
            <div class="fin-sign-line"></div>
            <div class="fin-sign-role">Diretoria Executiva / Operações</div>
            <div class="fin-sign-dept">Homologação da Prestação de Contas</div>
          </div>
        </div>
      </div>
    `;
  }
  window.renderFinancialReportContent = renderFinancialReportContent;

  // Driver Form Submit (Create / Edit)
  document.getElementById('form-driver').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('driver-edit-id').value;
    const body = {
      nome: document.getElementById('driver-nome').value.trim(),
      cpf: document.getElementById('driver-cpf').value.trim(),
      cnh: document.getElementById('driver-cnh').value.trim(),
      tipo_vinculo: document.getElementById('driver-vinculo').value || 'frota_propria',
      placa_cavalo: document.getElementById('driver-placa-cavalo').value.trim().toUpperCase(),
      placa_carreta: document.getElementById('driver-placa-carreta').value.trim().toUpperCase(),
      percentual_comissao: parseFloat(document.getElementById('driver-comissao').value) || 75.0,
      telefone: document.getElementById('driver-telefone').value.trim(),
      chave_pix: document.getElementById('driver-pix').value.trim(),
      ativo: document.getElementById('driver-ativo').checked ? 1 : 0
    };

    const url = id ? `/api/drivers/${id}` : '/api/drivers';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      showToast(data.message || 'Motorista salvo com sucesso!', 'success');
      closeModal('modal-driver');
      await loadDrivers();
      loadDriversManagement();
      fetchAndRenderDocuments();
      if (document.getElementById('tab-analytics')?.classList.contains('active')) {
        loadDriversAnalytics();
      }
    } catch (err) {
      showToast(`Erro ao salvar motorista: ${err.message}`, 'error');
    }
  });

  // Driver Search Input & Filters
  const driverSearchInput = document.getElementById('driver-search-input');
  if (driverSearchInput) {
    let driverSearchTimer;
    driverSearchInput.addEventListener('input', () => {
      clearTimeout(driverSearchTimer);
      driverSearchTimer = setTimeout(() => {
        renderDriversManagementTable();
      }, 250);
    });
  }

  const driverFilterVinculo = document.getElementById('driver-filter-vinculo');
  if (driverFilterVinculo) {
    driverFilterVinculo.addEventListener('change', () => {
      renderDriversManagementTable();
    });
  }

  const driverFilterStatus = document.getElementById('driver-filter-status');
  if (driverFilterStatus) {
    driverFilterStatus.addEventListener('change', () => {
      renderDriversManagementTable();
    });
  }

  const driverSelectAll = document.getElementById('drivers-select-all');
  if (driverSelectAll) {
    driverSelectAll.addEventListener('change', (e) => {
      toggleSelectAllDrivers(e.target.checked);
    });
  }

  // Complete via XML file input listener
  const completeFileInput = document.getElementById('complete-xml-file-input');
  if (completeFileInput) {
    completeFileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      const filenameEl = document.getElementById('complete-xml-filename');
      if (file && filenameEl) {
        filenameEl.textContent = `Arquivo selecionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      }
    });
  }
}

/**
 * Confirm Driver Deletion
 */
async function confirmDeleteDriver(id, customNome = null) {
  const drv = allDriversCache.find(d => d.id === id);
  const nome = customNome || (drv ? drv.nome : 'Motorista');

  if (!confirm(`Deseja realmente excluir o condutor "${nome}"? Esta ação removerá o motorista do sistema.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/drivers/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast(data.message || `Motorista "${nome}" excluído com sucesso!`, 'success');
    clearDriverSelections();
    await loadDrivers();
    await loadDriversManagement();
    await fetchAndRenderDocuments();
    if (typeof loadDriversAnalytics === 'function') loadDriversAnalytics();
  } catch (err) {
    showToast(`Erro ao excluir motorista: ${err.message}`, 'error');
  }
}

/**
 * Setup drag-and-drop batch upload
 */
function setupDragAndDrop() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');

  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');
    const dt = e.dataTransfer;
    const files = dt ? dt.files : null;
    if (files && files.length > 0) {
      handleBatchUpload(files);
    }
  });

  dropzone.addEventListener('click', (e) => {
    // If click is not directly on the input, trigger it
    if (e.target !== fileInput && !e.target.closest('button')) {
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleBatchUpload(e.target.files);
    }
    fileInput.value = ''; // Allow selecting the same file again
  });
}

/**
 * Upload multiple files to server
 */
async function handleBatchUpload(files) {
  if (!files || files.length === 0) return;

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }

  showToast(`Enviando ${files.length} arquivo(s) XML para auditoria...`, 'info');

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Erro no upload.');
    }

    // Auto-adjust date filter if uploaded documents have dates outside current range
    if (data.summary && Array.isArray(data.summary.dates) && data.summary.dates.length > 0) {
      const dates = data.summary.dates.map(d => String(d).slice(0, 10)).filter(Boolean).sort();
      if (dates.length > 0) {
        const minUploadedDate = dates[0];
        const maxUploadedDate = dates[dates.length - 1];

        let filterChanged = false;
        if (currentFilters.startDate && minUploadedDate < currentFilters.startDate) {
          currentFilters.startDate = minUploadedDate;
          const startInput = document.getElementById('filter-start-date');
          if (startInput) startInput.value = minUploadedDate;
          filterChanged = true;
        }
        if (currentFilters.endDate && maxUploadedDate > currentFilters.endDate) {
          currentFilters.endDate = maxUploadedDate;
          const endInput = document.getElementById('filter-end-date');
          if (endInput) endInput.value = maxUploadedDate;
          filterChanged = true;
        }

        if (filterChanged) {
          showToast('Filtro de data expandido automaticamente para exibir as novas viagens.', 'info');
        }
      }
    }

    displayUploadResults(data);
    await loadDrivers();
    await fetchAndRenderDocuments();
    if (typeof loadCTEs === 'function') await loadCTEs();
    if (typeof loadManifestos === 'function') await loadManifestos();
    if (typeof loadDriversManagement === 'function') await loadDriversManagement();

    const successCount = data.summary?.successCount || 0;
    if (successCount > 0) {
      showToast(`${successCount} arquivo(s) XML inserido(s)/atualizado(s) com sucesso!`, 'success');
    }
  } catch (err) {
    console.error('Upload error:', err);
    showToast(`Falha no upload: ${err.message}`, 'error');
  }
}

/**
 * Show batch upload results in modal
 */
function displayUploadResults(data) {
  const summary = data.summary || {};
  const badgesContainer = document.getElementById('upload-summary-badges');
  badgesContainer.innerHTML = `
    <span class="badge-doc badge-cte" style="font-size: 0.85rem;">
      <span class="dot-indicator"></span>
      ${summary.successCount || 0} Processados
    </span>
    <span class="badge-doc" style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; font-size: 0.85rem;">
      ${summary.duplicateCount || 0} Duplicados Ignorados
    </span>
    ${summary.errorCount > 0 ? `
      <span class="badge-doc" style="background: rgba(244, 63, 94, 0.15); color: #fb7185; font-size: 0.85rem;">
        ${summary.errorCount} Erros
      </span>
    ` : ''}
  `;

  const resultsList = document.getElementById('upload-results-list');
  resultsList.innerHTML = (data.results || []).map((r) => {
    let color = '#34d399';
    let icon = '✓';
    if (r.status === 'duplicate') {
      color = '#fbbf24';
      icon = '⚠';
    } else if (r.status === 'error') {
      color = '#f87171';
      icon = '✕';
    }

    return `
      <div style="background: rgba(0,0,0,0.25); padding: 0.75rem 1rem; border-radius: var(--radius-sm); border-left: 3px solid ${color}; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="color: #ffffff; font-size: 0.85rem;">${r.filename}</strong>
          <div style="font-size: 0.775rem; color: var(--text-secondary); margin-top: 2px;">
            ${r.message || ''}
          </div>
        </div>
        <span style="color: ${color}; font-weight: bold; font-size: 1.1rem;">${icon}</span>
      </div>
    `;
  }).join('');

  openModal('modal-upload-results');
}

/**
 * Open DACTE / DAMDFE Preview Modal
 */
async function openDocPreview(accessKey) {
  try {
    const res = await fetch(`/api/documents/${accessKey}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const doc = data.document;
    const title = doc.tipo === 'CT-e' 
      ? `DACTE - Conhecimento de Transporte nº ${doc.numero} (Comissão 75%: R$ ${(doc.valor_comissao_motorista || doc.valor * 0.75).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})` 
      : `DAMDFE - Manifesto de Carga nº ${doc.numero} (Interestadual: ${doc.uf_origem} -> ${doc.uf_destino})`;
    document.getElementById('modal-dacte-title').textContent = title;

    const content = doc.tipo === 'CT-e' ? renderDACTE(doc) : renderDAMDFE(doc);
    document.getElementById('modal-dacte-content').innerHTML = content;

    openModal('modal-dacte');
  } catch (err) {
    showToast(`Erro ao carregar visualização: ${err.message}`, 'error');
  }
}

/**
 * Open Document Metadata JSON modal
 */
async function openDocDetails(accessKey) {
  try {
    const res = await fetch(`/api/documents/${accessKey}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    document.getElementById('modal-doc-details-title').textContent = `Metadados: ${data.document.tipo} nº ${data.document.numero}`;
    document.getElementById('modal-doc-json').textContent = JSON.stringify(data.document, null, 2);

    openModal('modal-doc-details');
  } catch (err) {
    showToast(`Erro ao carregar detalhes: ${err.message}`, 'error');
  }
}

/**
 * Download original XML file
 */
function downloadOriginalXML(accessKey) {
  window.location.href = `/api/documents/${accessKey}/xml`;
}

/**
 * Modal helpers
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('open');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('open');
}

/**
 * Toast notifications
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ==========================================================================
// Complete Information via XML (SEFAZ CT-e / MDF-e)
// ==========================================================================

let xmlCompletionSource = 'general'; // 'general' or 'driver'
let lastParsedXmlPreview = null;
let lastXmlRawContent = '';

/**
 * Open Complete XML Modal
 */
function openCompleteXmlModal(source = 'general') {
  xmlCompletionSource = source;
  const useInDriverBtn = document.getElementById('btn-use-in-driver');
  if (useInDriverBtn) {
    useInDriverBtn.style.display = source === 'driver' && lastParsedXmlPreview?.motorista?.nome ? 'inline-flex' : 'none';
  }
  openModal('modal-complete-xml');
}

/**
 * Switch between paste mode and file upload mode
 */
function switchXmlInputMode(mode) {
  const pasteContainer = document.getElementById('xml-input-paste-container');
  const fileContainer = document.getElementById('xml-input-file-container');
  const pasteBtn = document.getElementById('tab-xml-paste');
  const fileBtn = document.getElementById('tab-xml-file');

  if (mode === 'paste') {
    pasteContainer.style.display = 'block';
    fileContainer.style.display = 'none';
    pasteBtn.className = 'btn btn-primary btn-sm';
    fileBtn.className = 'btn btn-secondary btn-sm';
  } else {
    pasteContainer.style.display = 'none';
    fileContainer.style.display = 'block';
    pasteBtn.className = 'btn btn-secondary btn-sm';
    fileBtn.className = 'btn btn-primary btn-sm';
  }
}

/**
 * Load sample XML into textarea and auto-analyze
 */
async function loadSampleXmlForCompletion(type) {
  try {
    const res = await fetch(`/api/sample-xml/${type}`);
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Erro ao carregar amostra de XML.');
    }

    switchXmlInputMode('paste');
    const textarea = document.getElementById('complete-xml-text');
    textarea.value = data.xml;
    showToast(`XML de exemplo (${type.toUpperCase()}) carregado. Analisando...`, 'info');
    await analyzeXmlContent();
  } catch (err) {
    console.error('Error loading sample XML:', err);
    showToast(`Erro ao carregar amostra: ${err.message}`, 'error');
  }
}

/**
 * Clear the XML completion form
 */
function clearXmlForm() {
  document.getElementById('complete-xml-text').value = '';
  const fileInput = document.getElementById('complete-xml-file-input');
  if (fileInput) fileInput.value = '';
  const filenameEl = document.getElementById('complete-xml-filename');
  if (filenameEl) filenameEl.textContent = '';
  const previewContainer = document.getElementById('complete-xml-preview-container');
  if (previewContainer) previewContainer.style.display = 'none';
  lastParsedXmlPreview = null;
  lastXmlRawContent = '';
}

/**
 * Analyze and extract preview metadata from XML (paste or file)
 */
async function analyzeXmlContent() {
  const pasteContainer = document.getElementById('xml-input-paste-container');
  const isPasteMode = pasteContainer.style.display !== 'none';
  let xmlString = '';

  const parseBtn = document.getElementById('btn-parse-xml');
  const originalText = parseBtn.innerHTML;
  parseBtn.innerHTML = 'Analisando XML...';
  parseBtn.disabled = true;

  try {
    if (isPasteMode) {
      xmlString = document.getElementById('complete-xml-text').value.trim();
      if (!xmlString) {
        throw new Error('Por favor, cole o conteúdo XML da SEFAZ no campo de texto.');
      }
    } else {
      const fileInput = document.getElementById('complete-xml-file-input');
      const file = fileInput.files?.[0];
      if (!file) {
        throw new Error('Por favor, selecione um arquivo XML.');
      }
      xmlString = await file.text();
    }

    lastXmlRawContent = xmlString;

    const res = await fetch('/api/parse-xml-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml: xmlString })
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Falha ao analisar XML.');
    }

    lastParsedXmlPreview = data.preview;
    renderXmlPreviewCard(data.preview);
    showToast('Informações extraídas do XML com sucesso!', 'success');
  } catch (err) {
    console.error('XML analyze error:', err);
    showToast(`Erro ao analisar XML: ${err.message}`, 'error');
  } finally {
    parseBtn.innerHTML = originalText;
    parseBtn.disabled = false;
  }
}

/**
 * Render the extracted XML preview card
 */
function renderXmlPreviewCard(preview) {
  const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const container = document.getElementById('complete-xml-preview-container');
  const docBadge = document.getElementById('preview-doc-badge');
  const docTitle = document.getElementById('preview-doc-title');
  const interstateBadge = document.getElementById('preview-interstate-badge');
  const motoNome = document.getElementById('preview-motorista-nome');
  const motoCpf = document.getElementById('preview-motorista-cpf');
  const rotaEl = document.getElementById('preview-origem-destino');
  const percursoEl = document.getElementById('preview-percurso');
  const freteEl = document.getElementById('preview-valor-frete');
  const icmsEl = document.getElementById('preview-valor-icms');
  const comissaoEl = document.getElementById('preview-valor-comissao');
  const chaveEl = document.getElementById('preview-chave-acesso');
  const manifestoBox = document.getElementById('preview-manifesto-box');
  const manifestoDetails = document.getElementById('preview-manifesto-details');
  const useInDriverBtn = document.getElementById('btn-use-in-driver');

  // Badge & Title
  docBadge.textContent = preview.tipo;
  docBadge.className = preview.tipo === 'CT-e' ? 'badge-doc badge-cte' : 'badge-doc badge-mdfe';
  docTitle.textContent = `${preview.tipo} nº ${preview.numero} - Série ${preview.serie}`;

  // Interstate
  if (preview.interestadual) {
    interstateBadge.style.display = 'inline-flex';
  } else {
    interstateBadge.style.display = 'none';
  }

  // Driver
  if (preview.motorista && preview.motorista.nome) {
    motoNome.textContent = preview.motorista.nome;
    motoCpf.textContent = `CPF: ${preview.motorista.cpf || 'Não informado'}`;
  } else {
    motoNome.textContent = 'Não identificado no XML';
    motoCpf.textContent = 'CPF: -';
  }

  // Route & Values
  if (preview.tipo === 'CT-e') {
    const orig = preview.origem ? `${preview.origem.cidade}/${preview.origem.uf}` : '-';
    const dest = preview.destino ? `${preview.destino.cidade}/${preview.destino.uf}` : '-';
    rotaEl.textContent = `${orig} ➔ ${dest}`;
    percursoEl.textContent = preview.interestadual ? 'Status: Viagem Fora de Alagoas' : 'Status: Viagem Estadual';

    freteEl.textContent = formatBRL(preview.valor_frete);
    icmsEl.textContent = `ICMS: ${formatBRL(preview.valor_icms)} (Total trib: ${formatBRL(preview.valor_impostos_total)})`;
    comissaoEl.textContent = formatBRL(preview.valor_comissao_75);

    if (preview.manifesto_sugerido) {
      manifestoBox.style.display = 'block';
      const m = preview.manifesto_sugerido;
      manifestoDetails.innerHTML = `
        Viagem interestadual detectada (${m.origem} -> ${m.destino}). Percurso previsto: <strong>${m.ufs_percurso || 'PE'}</strong>.
        Placas vinculadas: <strong>${m.placa_tracao || 'LQW0A19'}</strong> (Tração) / <strong>${m.placa_reboque || 'MUV0J59'}</strong> (Reboque).
        Carga: ${formatBRL(m.valor_carga || 91553.24)} | Peso: ${(m.peso_bruto || 10384).toLocaleString('pt-BR')} kg.
      `;
    } else {
      manifestoBox.style.display = 'none';
    }
  } else {
    // MDF-e
    rotaEl.textContent = `${preview.origem} ➔ ${preview.destino}`;
    percursoEl.textContent = `UFs Percurso: ${preview.ufs_percurso || 'PE'}`;

    freteEl.textContent = formatBRL(preview.valor_carga);
    icmsEl.textContent = `Peso: ${(preview.peso_bruto || 0).toLocaleString('pt-BR')} kg`;
    comissaoEl.textContent = 'MDF-e (Carga)';

    manifestoBox.style.display = 'block';
    const v = preview.veiculo || {};
    manifestoDetails.innerHTML = `
      Manifesto de Cargas Interestadual. Placa Tração: <strong>${v.placa_tracao || '-'}</strong> | Reboque: <strong>${v.placa_reboque || '-'}</strong>.
      RNTRC: <strong>${v.rntrc || '-'}</strong>. Destino: <strong>${preview.destino}</strong>.
    `;
  }

  chaveEl.textContent = preview.chave_acesso || '-';

  if (xmlCompletionSource === 'driver' && preview.motorista?.nome) {
    useInDriverBtn.style.display = 'inline-flex';
  } else {
    useInDriverBtn.style.display = 'none';
  }

  container.style.display = 'block';
}

/**
 * Save the completed XML into the platform database
 */
async function saveCompletedXml() {
  if (!lastXmlRawContent) {
    showToast('Nenhum XML pronto para gravação.', 'error');
    return;
  }

  const saveBtn = document.getElementById('btn-save-completed-xml');
  const originalText = saveBtn.innerHTML;
  saveBtn.innerHTML = 'Gravando...';
  saveBtn.disabled = true;

  try {
    const res = await fetch('/api/complete-from-xml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xml: lastXmlRawContent })
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Erro ao gravar informações.');
    }

    showToast('Documento, motorista e manifestos gravados com sucesso na plataforma!', 'success');
    closeModal('modal-complete-xml');

    // Refresh all caches and tables
    await loadDrivers();
    await fetchAndRenderDocuments();
    if (typeof loadCTEs === 'function') await loadCTEs();
    if (typeof loadManifestos === 'function') await loadManifestos();
    if (typeof loadDriversManagement === 'function') await loadDriversManagement();
  } catch (err) {
    console.error('Save completed XML error:', err);
    showToast(`Erro ao gravar: ${err.message}`, 'error');
  } finally {
    saveBtn.innerHTML = originalText;
    saveBtn.disabled = false;
  }
}

/**
 * Populate Driver Modal fields with the extracted driver information
 */
function populateDriverFromXmlPreview() {
  if (!lastParsedXmlPreview || !lastParsedXmlPreview.motorista) {
    showToast('Nenhum motorista extraído no XML.', 'error');
    return;
  }

  const moto = lastParsedXmlPreview.motorista;
  document.getElementById('driver-nome').value = moto.nome || '';
  document.getElementById('driver-cpf').value = moto.cpf || '';
  document.getElementById('driver-comissao').value = '75.0';

  closeModal('modal-complete-xml');
  openModal('modal-driver');
  showToast('Dados do motorista preenchidos a partir do XML!', 'success');
}

// ==========================================================================
// Manual Trip Operations (Insert & Delete) & 75% Commission Workflow
// ==========================================================================

/**
 * Open Modal to Insert Manual Trip
 */
function openManualTripModal() {
  const form = document.getElementById('form-manual-trip');
  form.reset();

  // Populate drivers combobox
  const driverSelect = document.getElementById('manual-trip-driver');
  driverSelect.innerHTML = '<option value="">Selecione um motorista cadastrado...</option>';
  allDriversCache.forEach((drv) => {
    const opt = document.createElement('option');
    opt.value = drv.id;
    opt.textContent = `${drv.nome} (${drv.cpf}) - Comis. ${drv.percentual_comissao || 75}%`;
    driverSelect.appendChild(opt);
  });

  // Suggest today's date
  document.getElementById('manual-trip-data').value = new Date().toISOString().slice(0, 10);

  // Suggest default trip timeline: departure now, arrival +36h
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const formatIsoForInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  
  const saidaInput = document.getElementById('manual-trip-data-saida');
  if (saidaInput && !saidaInput.value) saidaInput.value = formatIsoForInput(now);
  
  const chegadaInput = document.getElementById('manual-trip-previsao-chegada');
  if (chegadaInput && !chegadaInput.value) {
    const arrival = new Date(now.getTime() + 36 * 3600 * 1000);
    chegadaInput.value = formatIsoForInput(arrival);
  }

  // Suggest default document number
  const nextNum = Math.floor(3200 + Math.random() * 50);
  document.getElementById('manual-trip-numero').value = nextNum;

  setManualTripType('CT-e');
  updateManualCommissionPreview();
  openModal('modal-manual-trip');
}

/**
 * Switch manual trip type between CT-e and MDF-e
 */
function setManualTripType(tipo) {
  document.getElementById('manual-trip-tipo').value = tipo;
  const btnCte = document.getElementById('manual-type-cte');
  const btnMdfe = document.getElementById('manual-type-mdfe');
  const cteFields = document.getElementById('manual-cte-fields');
  const mdfeFields = document.getElementById('manual-mdfe-fields');
  const serieInput = document.getElementById('manual-trip-serie');
  const freteInput = document.getElementById('manual-trip-frete');

  if (tipo === 'CT-e') {
    btnCte.className = 'btn btn-primary btn-sm';
    btnMdfe.className = 'btn btn-secondary btn-sm';
    cteFields.style.display = 'flex';
    mdfeFields.style.display = 'none';
    serieInput.value = '1';
    freteInput.required = true;
  } else {
    btnCte.className = 'btn btn-secondary btn-sm';
    btnMdfe.className = 'btn btn-primary btn-sm';
    cteFields.style.display = 'none';
    mdfeFields.style.display = 'flex';
    serieInput.value = '3';
    freteInput.required = false;
  }
}

/**
 * Update real-time 75% commission preview in manual trip modal
 */
function updateManualCommissionPreview() {
  const frete = parseFloat(document.getElementById('manual-trip-frete').value) || 0;
  const driverId = document.getElementById('manual-trip-driver').value;
  let percent = 75.0;

  if (driverId) {
    const drv = allDriversCache.find(d => d.id === driverId);
    if (drv && drv.percentual_comissao) {
      percent = parseFloat(drv.percentual_comissao);
    }
  }

  const comissao = frete * (percent / 100);
  const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(comissao);
  document.getElementById('manual-comissao-preview').textContent = formatted;
}

/**
 * Save manual trip to platform backend
 */
async function saveManualTrip(e) {
  e.preventDefault();
  const saveBtn = document.getElementById('btn-save-manual-trip');
  const originalText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvando Viagem...';

  const tipo = document.getElementById('manual-trip-tipo').value;
  const body = {
    tipo,
    numero: document.getElementById('manual-trip-numero').value,
    serie: document.getElementById('manual-trip-serie').value,
    data_emissao: document.getElementById('manual-trip-data').value,
    motorista_id: document.getElementById('manual-trip-driver').value,
    cidade_origem: document.getElementById('manual-trip-cidade-origem').value,
    uf_origem: document.getElementById('manual-trip-uf-origem').value.toUpperCase(),
    cidade_destino: document.getElementById('manual-trip-cidade-destino').value,
    uf_destino: document.getElementById('manual-trip-uf-destino').value.toUpperCase(),
    valor_frete: document.getElementById('manual-trip-frete').value,
    aliquota_icms: document.getElementById('manual-trip-aliquota').value,
    valor_total_carga: tipo === 'CT-e' && document.getElementById('manual-trip-carga-cte')?.value
      ? document.getElementById('manual-trip-carga-cte').value
      : document.getElementById('manual-trip-carga').value,
    peso_bruto: tipo === 'CT-e' && document.getElementById('manual-trip-peso-cte')?.value
      ? document.getElementById('manual-trip-peso-cte').value
      : document.getElementById('manual-trip-peso').value,
    placa_tracao: document.getElementById('manual-trip-placa-tracao').value,
    placa_reboque: document.getElementById('manual-trip-placa-reboque').value,
    ufs_percurso: document.getElementById('manual-trip-percurso') ? document.getElementById('manual-trip-percurso').value : '',
    remetente_nome: document.getElementById('manual-trip-remetente-nome') ? document.getElementById('manual-trip-remetente-nome').value : '',
    remetente_cnpj: document.getElementById('manual-trip-remetente-cnpj') ? document.getElementById('manual-trip-remetente-cnpj').value : '',
    destinatario_nome: document.getElementById('manual-trip-destinatario-nome') ? document.getElementById('manual-trip-destinatario-nome').value : '',
    destinatario_cnpj: document.getElementById('manual-trip-destinatario-cnpj') ? document.getElementById('manual-trip-destinatario-cnpj').value : '',
    data_saida: document.getElementById('manual-trip-data-saida') ? document.getElementById('manual-trip-data-saida').value : '',
    previsao_chegada: document.getElementById('manual-trip-previsao-chegada') ? document.getElementById('manual-trip-previsao-chegada').value : ''
  };

  try {
    const res = await fetch('/api/documents/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Erro ao salvar viagem manual.');
    }

    closeModal('modal-manual-trip');
    await loadDrivers();
    await fetchAndRenderDocuments();
    if (typeof loadCTEs === 'function') await loadCTEs();
    if (typeof loadManifestos === 'function') await loadManifestos();
    if (typeof loadDriversManagement === 'function') await loadDriversManagement();

    if (tipo === 'CT-e' && data.valor_comissao) {
      // Trigger Official Financial Reminder Modal (Rule #4 & #5)
      const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
      document.getElementById('finance-reminder-value').textContent = formatBRL(data.valor_comissao);
      document.getElementById('finance-reminder-driver').textContent = `Motorista: ${data.motorista_nome} (${data.motorista_cpf})`;
      document.getElementById('finance-reminder-doc').textContent = `CT-e nº ${data.numero} - Frete: ${formatBRL(data.valor_frete)} (Comissão de 75%)`;
      openModal('modal-finance-reminder');
    } else {
      showToast(data.message || 'Viagem inserida com sucesso!', 'success');
    }
  } catch (err) {
    console.error('Error saving manual trip:', err);
    showToast(`Erro ao salvar viagem: ${err.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = originalText;
  }
}

/**
 * Confirm Send to Finance
 */
function confirmSendToFinance() {
  closeModal('modal-finance-reminder');
  showToast('Comissão de 75% encaminhada ao setor financeiro com sucesso!', 'success');
}

/**
 * Delete a Trip (CT-e or MDF-e)
 */
async function confirmDeleteTrip(type, id, numero) {
  if (!confirm(`Deseja realmente excluir esta viagem (${type} nº ${numero})? Esta ação não pode ser desfeita.`)) {
    return;
  }

  try {
    const encodedType = encodeURIComponent(type || 'any');
    const res = await fetch(`/api/documents/${encodedType}/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Erro ao excluir viagem.');
    }

    showToast(data.message || 'Viagem excluída com sucesso!', 'success');
    await loadDrivers();
    await fetchAndRenderDocuments();
    if (typeof loadCTEs === 'function') await loadCTEs();
    if (typeof loadManifestos === 'function') await loadManifestos();
    if (typeof loadDriversManagement === 'function') await loadDriversManagement();
    if (typeof loadDriversAnalytics === 'function') await loadDriversAnalytics();
  } catch (err) {
    console.error('Error deleting trip:', err);
    showToast(`Erro ao excluir: ${err.message}`, 'error');
  }
}

/**
 * Load TAB: Drivers Analytics & Charts
 */
async function loadDriversAnalytics() {
  const rankingTableBody = document.getElementById('analytics-ranking-table-body');
  if (rankingTableBody) {
    rankingTableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 2rem;">Carregando indicadores e gráficos...</td></tr>`;
  }

  try {
    const res = await fetch('/api/analytics/drivers');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const summary = data.summary || {};
    const drivers = data.drivers || [];
    const categoryStats = data.categoryStats || {};
    const topRevenue = data.topRevenue || [];
    const topTrips = data.topTrips || [];

    const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

    // 1. KPI: Campeão em Faturamento
    const topRevNameEl = document.getElementById('analytics-top-revenue-name');
    const topRevValEl = document.getElementById('analytics-top-revenue-val');
    if (topRevNameEl) {
      topRevNameEl.textContent = topRevenue.length > 0 ? topRevenue[0].nome : 'Nenhum frete';
    }
    if (topRevValEl) {
      topRevValEl.textContent = topRevenue.length > 0 ? formatBRL(topRevenue[0].total_frete) : 'R$ 0,00';
    }

    // 2. KPI: Maior Volume de Viagens
    const topTripsNameEl = document.getElementById('analytics-top-trips-name');
    const topTripsValEl = document.getElementById('analytics-top-trips-val');
    if (topTripsNameEl) {
      topTripsNameEl.textContent = topTrips.length > 0 ? topTrips[0].nome : 'Nenhuma viagem';
    }
    if (topTripsValEl) {
      topTripsValEl.textContent = topTrips.length > 0 ? `${topTrips[0].total_viagens} viagens` : '0 viagens';
    }

    // 3. KPI: Total Pago em Comissões (75%)
    const totalCommEl = document.getElementById('analytics-total-commission');
    const totalFreightEl = document.getElementById('analytics-total-freight');
    if (totalCommEl) {
      totalCommEl.textContent = formatBRL(summary.total_comissao);
    }
    if (totalFreightEl) {
      totalFreightEl.textContent = `Frete Total: ${formatBRL(summary.total_frete)}`;
    }

    // 4. KPI: Distribuição da Frota
    const totalDriversEl = document.getElementById('analytics-total-drivers');
    const breakdownVinculoEl = document.getElementById('analytics-breakdown-vinculo');
    if (totalDriversEl) {
      totalDriversEl.textContent = `${summary.total_drivers || 0} Condutores`;
    }
    if (breakdownVinculoEl) {
      const fpCount = categoryStats.frota_propria?.count || 0;
      const agCount = categoryStats.agregado?.count || 0;
      const tcCount = categoryStats.terceirizado?.count || 0;
      breakdownVinculoEl.textContent = `Próprios: ${fpCount} | Agregados: ${agCount} | Terc: ${tcCount}`;
    }

    // Ranking Table
    const countBadge = document.getElementById('analytics-ranking-count');
    if (countBadge) countBadge.textContent = `${drivers.length} Motoristas`;

    if (rankingTableBody) {
      if (drivers.length === 0) {
        rankingTableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhum dado de frete encontrado para análise.</td></tr>`;
      } else {
        rankingTableBody.innerHTML = drivers.map((drv, index) => {
          let posClass = 'ranking-pos-default';
          if (index === 0) posClass = 'ranking-pos-1';
          else if (index === 1) posClass = 'ranking-pos-2';
          else if (index === 2) posClass = 'ranking-pos-3';

          const vinculoBadges = {
            'frota_propria': '<span class="badge-frota">Frota Própria</span>',
            'agregado': '<span class="badge-agregado">Agregado</span>',
            'terceirizado': '<span class="badge-terceirizado">Terceirizado</span>'
          };
          const badgeVinculo = vinculoBadges[drv.tipo_vinculo] || `<span class="badge-frota">${drv.tipo_vinculo || 'Frota Própria'}</span>`;

          const plates = [];
          if (drv.placa_cavalo) plates.push(`<span class="badge-plate">Cav: ${drv.placa_cavalo}</span>`);
          if (drv.placa_carreta) plates.push(`<span class="badge-plate">Car: ${drv.placa_carreta}</span>`);
          const platesHtml = plates.length > 0 ? plates.join(' ') : '<span style="color: var(--text-muted);">-</span>';

          return `
            <tr>
              <td style="text-align: center;">
                <span class="ranking-position-badge ${posClass}">${index + 1}º</span>
              </td>
              <td style="font-weight: 700;">${drv.nome}</td>
              <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.775rem;">${drv.cpf}</td>
              <td>${badgeVinculo}</td>
              <td>${platesHtml}</td>
              <td style="text-align: center;">${drv.total_ctes || 0}</td>
              <td style="text-align: center;">${drv.total_mdfes || 0}</td>
              <td style="text-align: center; font-weight: 700;">${drv.total_viagens || 0}</td>
              <td style="text-align: right; font-family: 'JetBrains Mono', monospace; font-weight: 700;">${formatBRL(drv.total_frete)}</td>
              <td style="text-align: right; color: #34d399; font-family: 'JetBrains Mono', monospace; font-weight: 700;">${formatBRL(drv.total_comissao)}</td>
              <td style="text-align: right; font-family: 'JetBrains Mono', monospace; color: var(--text-secondary);">${formatBRL(drv.ticket_medio)}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // Render Charts
    renderAnalyticsCharts(topRevenue, categoryStats, topTrips);

  } catch (err) {
    console.error('Erro ao carregar análise de motoristas:', err);
    if (rankingTableBody) {
      rankingTableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--accent-rose); padding: 2rem;">Erro ao carregar análise: ${err.message}</td></tr>`;
    }
  }
}

/**
 * Render Interactive Charts using Chart.js
 */
function renderAnalyticsCharts(topRevenue, categoryStats, topTrips) {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js ainda não disponível na janela global.');
    return;
  }

  // 1. Chart Revenue & Commission
  const ctxRevenue = document.getElementById('chart-revenue-drivers');
  if (ctxRevenue) {
    if (chartRevenueInstance) {
      chartRevenueInstance.destroy();
    }

    const topList = topRevenue.length > 0 ? topRevenue.slice(0, 8) : [];
    const labels = topList.map(d => d.nome.length > 18 ? d.nome.substring(0, 16) + '...' : d.nome);
    const dataFrete = topList.map(d => d.total_frete);
    const dataComissao = topList.map(d => d.total_comissao);

    chartRevenueInstance = new Chart(ctxRevenue, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Faturamento Total (R$)',
            data: dataFrete,
            backgroundColor: 'rgba(99, 102, 241, 0.85)',
            borderColor: '#6366f1',
            borderWidth: 1,
            borderRadius: 6
          },
          {
            label: 'Comissão Motorista 75% (R$)',
            data: dataComissao,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#334155', font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' } }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#ffffff',
            bodyColor: '#e2e8f0',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ctx.raw || 0)}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#475569', font: { size: 11, weight: '500' } },
            grid: { color: '#f1f5f9' }
          },
          y: {
            ticks: {
              color: '#475569',
              font: { weight: '500' },
              callback: (val) => 'R$ ' + (val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val)
            },
            grid: { color: '#f1f5f9' }
          }
        }
      }
    });
  }

  // 2. Chart Category Breakdown
  const ctxCategory = document.getElementById('chart-category-drivers');
  if (ctxCategory) {
    if (chartCategoryInstance) {
      chartCategoryInstance.destroy();
    }

    const fp = categoryStats.frota_propria || { count: 0, frete: 0, comissao: 0 };
    const ag = categoryStats.agregado || { count: 0, frete: 0, comissao: 0 };
    const tc = categoryStats.terceirizado || { count: 0, frete: 0, comissao: 0 };

    chartCategoryInstance = new Chart(ctxCategory, {
      type: 'doughnut',
      data: {
        labels: [
          `Frota Própria (${fp.count})`,
          `Agregados (${ag.count})`,
          `Terceirizados (${tc.count})`
        ],
        datasets: [{
          data: [fp.frete, ag.frete, tc.frete],
          backgroundColor: [
            'rgba(59, 130, 246, 0.85)',
            'rgba(245, 158, 11, 0.85)',
            'rgba(236, 72, 153, 0.85)'
          ],
          borderColor: [
            '#ffffff',
            '#ffffff',
            '#ffffff'
          ],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#334155', font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' }, padding: 14 }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#ffffff',
            bodyColor: '#e2e8f0',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (ctx) => {
                const val = ctx.raw || 0;
                return ` Frete Gerado: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)}`;
              }
            }
          }
        },
        cutout: '65%'
      }
    });
  }

  // 3. Chart Trips Count
  const ctxTrips = document.getElementById('chart-trips-drivers');
  if (ctxTrips) {
    if (chartTripsInstance) {
      chartTripsInstance.destroy();
    }

    const topList = topTrips.length > 0 ? topTrips.slice(0, 8) : [];
    const labels = topList.map(d => d.nome.length > 18 ? d.nome.substring(0, 16) + '...' : d.nome);
    const dataCtes = topList.map(d => d.total_ctes || 0);
    const dataMdfes = topList.map(d => d.total_mdfes || 0);

    chartTripsInstance = new Chart(ctxTrips, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Viagens CT-e',
            data: dataCtes,
            backgroundColor: 'rgba(99, 102, 241, 0.85)',
            borderColor: '#6366f1',
            borderWidth: 1,
            borderRadius: 6
          },
          {
            label: 'Manifestos MDF-e',
            data: dataMdfes,
            backgroundColor: 'rgba(2, 132, 199, 0.85)',
            borderColor: '#0284c7',
            borderWidth: 1,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#334155', font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' } }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#ffffff',
            bodyColor: '#e2e8f0',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 10
          }
        },
        scales: {
          x: {
            stacked: true,
            ticks: { color: '#475569', font: { size: 11, weight: '500' } },
            grid: { color: '#f1f5f9' }
          },
          y: {
            stacked: true,
            ticks: { color: '#475569', stepSize: 1, font: { weight: '500' } },
            grid: { color: '#f1f5f9' }
          }
        }
      }
    });
  }
}

/**
 * Render Overview Tab Preview Charts (Chart.js)
 */
async function renderOverviewChartsPreview() {
  const ctxRevenue = document.getElementById('overview-chart-revenue');
  const ctxCategory = document.getElementById('overview-chart-category');
  if (!ctxRevenue || !ctxCategory) return;
  if (typeof Chart === 'undefined') return;

  try {
    const res = await fetch('/api/analytics/drivers');
    const data = await res.json();
    if (!data.success) return;

    const topRevenue = data.topRevenue || [];
    const categoryStats = data.categoryStats || {};

    // 1. Overview Revenue & Commission (Top 6 drivers)
    if (overviewRevenueChartInstance) {
      overviewRevenueChartInstance.destroy();
    }

    const topList = topRevenue.length > 0 ? topRevenue.slice(0, 6) : [];
    const labels = topList.map(d => d.nome.length > 15 ? d.nome.substring(0, 13) + '...' : d.nome);
    const dataFrete = topList.map(d => d.total_frete);
    const dataComissao = topList.map(d => d.total_comissao);

    overviewRevenueChartInstance = new Chart(ctxRevenue, {
      type: 'bar',
      data: {
        labels: labels.length > 0 ? labels : ['Sem dados'],
        datasets: [
          {
            label: 'Faturamento Total (R$)',
            data: dataFrete.length > 0 ? dataFrete : [0],
            backgroundColor: 'rgba(79, 70, 229, 0.85)',
            borderColor: '#4f46e5',
            borderWidth: 1,
            borderRadius: 6
          },
          {
            label: 'Comissão Motorista 75% (R$)',
            data: dataComissao.length > 0 ? dataComissao : [0],
            backgroundColor: 'rgba(5, 150, 105, 0.85)',
            borderColor: '#059669',
            borderWidth: 1,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#334155', font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' } }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#ffffff',
            bodyColor: '#e2e8f0',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ctx.raw || 0)}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: '#475569', font: { size: 11, weight: '500' } },
            grid: { color: '#f1f5f9' }
          },
          y: {
            ticks: {
              color: '#475569',
              font: { weight: '500' },
              callback: (val) => 'R$ ' + (val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val)
            },
            grid: { color: '#f1f5f9' }
          }
        }
      }
    });

    // 2. Overview Category Breakdown
    if (overviewCategoryChartInstance) {
      overviewCategoryChartInstance.destroy();
    }

    const fp = categoryStats.frota_propria || { count: 0, frete: 0, comissao: 0 };
    const ag = categoryStats.agregado || { count: 0, frete: 0, comissao: 0 };
    const tc = categoryStats.terceirizado || { count: 0, frete: 0, comissao: 0 };

    overviewCategoryChartInstance = new Chart(ctxCategory, {
      type: 'doughnut',
      data: {
        labels: [
          `Frota Própria (${fp.count})`,
          `Agregados (${ag.count})`,
          `Terceirizados (${tc.count})`
        ],
        datasets: [{
          data: [fp.frete, ag.frete, tc.frete],
          backgroundColor: [
            'rgba(37, 99, 235, 0.85)',
            'rgba(217, 119, 6, 0.85)',
            'rgba(192, 38, 211, 0.85)'
          ],
          borderColor: ['#ffffff', '#ffffff', '#ffffff'],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#334155', font: { family: 'Plus Jakarta Sans', size: 11, weight: '600' }, padding: 12 }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            titleColor: '#ffffff',
            bodyColor: '#e2e8f0',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (ctx) => ` Frete: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ctx.raw || 0)}`
            }
          }
        },
        cutout: '62%'
      }
    });
  } catch (err) {
    console.error('Erro ao renderizar gráficos na visão geral:', err);
  }
}

// =========================================================================
// REPOSITÓRIO DE PARÂMETROS DE FRETE, DESTINOS & TRIBUTAÇÃO (CARAJAS)
// =========================================================================

/**
 * Load freight repository presets into dropdown
 */
async function loadFreightRepositoryPresets() {
  try {
    const res = await fetch('/api/freight-repository');
    const data = await res.json();
    if (data.success && Array.isArray(data.items)) {
      freightRepoCache = data.items;
      const select = document.getElementById('manual-freight-preset');
      if (select && data.items.length > 0) {
        select.innerHTML = `
          <option value="">Selecione para preencher automaticamente...</option>
          ${data.items.map(item => `
            <option value="${escapeHtml(item.id)}">
              🏢 ${escapeHtml(item.pagador_nome || 'CARAJAS')} - ${escapeHtml(item.codigo_tabela || 'TABELA')} (${escapeHtml(item.tipo_pagamento || 'FOB')}) [Frete: R$ ${Number(item.frete_valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | ICMS: ${item.aliquota_icms}% | ${escapeHtml(item.uf_destino || 'AL')}]
            </option>
          `).join('')}
        `;
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar repositório de frete:', err);
  }
}

/**
 * Open Freight Repository Modal
 */
async function openFreightRepoModal() {
  await loadFreightRepositoryPresets();
  runFreightCalculation();
  openModal('modal-freight-repo');
}

/**
 * Run real-time calculation in Freight Simulator
 */
function runFreightCalculation() {
  const freteInput = document.getElementById('calc-frete-valor');
  const icmsInput = document.getElementById('calc-aliquota-icms');
  const cbsInput = document.getElementById('calc-aliquota-cbs');
  const ibsInput = document.getElementById('calc-aliquota-ibs');

  const frete = parseFloat(freteInput?.value) || 0;
  const aliqIcms = parseFloat(icmsInput?.value) || 0;
  const aliqCbs = parseFloat(cbsInput?.value) || 0;
  const aliqIbs = parseFloat(ibsInput?.value) || 0;

  const valIcms = frete * (aliqIcms / 100);
  const baseTributos = Math.max(0, frete - valIcms);
  const valCbs = baseTributos * (aliqCbs / 100);
  const valIbs = baseTributos * (aliqIbs / 100);
  const totalCbsIbs = valCbs + valIbs;

  const comissao75 = frete * 0.75;
  const margem25 = Math.max(0, frete - comissao75);

  const formatBRL = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const elIcms = document.getElementById('sim-res-icms');
  const elCbsIbs = document.getElementById('sim-res-cbs-ibs');
  const elCom75 = document.getElementById('sim-res-comissao75');
  const elMargem25 = document.getElementById('sim-res-margem25');

  if (elIcms) elIcms.textContent = formatBRL(valIcms);
  if (elCbsIbs) elCbsIbs.textContent = `${formatBRL(totalCbsIbs)} (${formatBRL(valCbs)} CBS + ${formatBRL(valIbs)} IBS)`;
  if (elCom75) elCom75.textContent = formatBRL(comissao75);
  if (elMargem25) elMargem25.textContent = formatBRL(margem25);
}

/**
 * Apply simulated freight parameters into Manual Trip form
 */
function applySimulatedFreightToTrip() {
  const frete = parseFloat(document.getElementById('calc-frete-valor')?.value) || 850.00;
  const aliqIcms = parseFloat(document.getElementById('calc-aliquota-icms')?.value) || 21.5;

  const tripFrete = document.getElementById('manual-trip-frete');
  const tripAliq = document.getElementById('manual-trip-aliquota');

  if (tripFrete) tripFrete.value = frete.toFixed(2);
  if (tripAliq) tripAliq.value = aliqIcms.toFixed(1);

  updateManualCommissionPreview();
  closeModal('modal-freight-repo');
  openManualTripModal();
  showToast(`Frete de R$ ${frete.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} e ICMS ${aliqIcms}% aplicados com sucesso!`, 'success');
}

/**
 * Direct shortcut: Use Carajas reference rate card in New Trip
 */
function useCurrentRepoInTrip() {
  applyFreightPresetToManualTrip('carajas-frete-infor-001');
  closeModal('modal-freight-repo');
  openManualTripModal();
  showToast('Parâmetros CARAJAS (Frete R$ 850, ICMS 21,5%, 30,6t) carregados na viagem!', 'success');
}

/**
 * Apply selected preset to Manual Trip modal fields
 */
function applyFreightPresetToManualTrip(presetId) {
  if (!presetId) return;

  const rule = freightRepoCache.find(r => r.id === presetId) || {
    pagador_nome: 'CARAJAS MATERIAL DE CONSTRUCAO',
    pagador_cnpj: '03.656.804/0001-31',
    cidade_origem: 'Maceió',
    uf_origem: 'AL',
    cidade_destino: 'Maceió',
    uf_destino: 'AL',
    frete_valor: 850.00,
    aliquota_icms: 21.50,
    peso_real_kg: 30604.92,
    valor_mercadoria: 20553.44,
    nfs_agrupadas: 20
  };

  // Populate remetente / pagador
  const remNome = document.getElementById('manual-trip-remetente-nome');
  const remCnpj = document.getElementById('manual-trip-remetente-cnpj');
  if (remNome) remNome.value = rule.pagador_nome || 'CARAJAS MATERIAL DE CONSTRUCAO LTDA';
  if (remCnpj) remCnpj.value = rule.pagador_cnpj || '03.656.804/0001-31';

  // Populate destinatario
  const destNome = document.getElementById('manual-trip-destinatario-nome');
  const destCnpj = document.getElementById('manual-trip-destinatario-cnpj');
  if (destNome) destNome.value = rule.pagador_nome || 'CARAJAS MATERIAL DE CONSTRUCAO LTDA';
  if (destCnpj) destCnpj.value = rule.pagador_cnpj || '03.656.804/0001-31';

  // Populate Origem e Destino
  const cidOrig = document.getElementById('manual-trip-cidade-origem');
  const ufOrig = document.getElementById('manual-trip-uf-origem');
  const cidDest = document.getElementById('manual-trip-cidade-destino');
  const ufDest = document.getElementById('manual-trip-uf-destino');

  if (cidOrig) cidOrig.value = rule.cidade_origem || 'Maceió';
  if (ufOrig) ufOrig.value = rule.uf_origem || 'AL';
  if (cidDest) cidDest.value = rule.cidade_destino || 'Maceió';
  if (ufDest) ufDest.value = rule.uf_destino || 'AL';

  // Populate Frete e Alíquota ICMS
  const tripFrete = document.getElementById('manual-trip-frete');
  const tripAliq = document.getElementById('manual-trip-aliquota');
  if (tripFrete) tripFrete.value = parseFloat(rule.frete_valor || 850.00).toFixed(2);
  if (tripAliq) tripAliq.value = parseFloat(rule.aliquota_icms || 21.50).toFixed(1);

  // Populate MDF-e fields
  const tripCarga = document.getElementById('manual-trip-carga');
  const tripPeso = document.getElementById('manual-trip-peso');
  if (tripCarga) tripCarga.value = parseFloat(rule.valor_mercadoria || 20553.44).toFixed(2);
  if (tripPeso) tripPeso.value = parseFloat(rule.peso_real_kg || 30604.92).toFixed(1);

  // Update commission preview (75% / 25%)
  updateManualCommissionPreview();

  const hint = document.getElementById('manual-freight-preset-hint');
  if (hint) {
    hint.innerHTML = `<span style="color: #34d399; font-weight: 600;">✓ Parâmetros Carajás Ativos:</span> Frete R$ 850,00 | ICMS 21,5% (R$ 182,75) | CBS/IBS R$ 6,42 | Condutor 75% (R$ 637,50) | Carga: 30,6t (20 NFs)`;
  }

  showToast(`Parâmetros de frete ${rule.pagador_nome || 'CARAJAS'} carregados para destino ${rule.cidade_destino || 'Maceió'}/${rule.uf_destino || 'AL'}!`, 'success');
}

// =========================================================================
// ESCANEAMENTO DE PLANILHAS EXCEL DE CONDUTORES E FROTAS
// =========================================================================

/**
 * Configura a dropzone do scanner de Excel
 */
function setupExcelScannerDropzone() {
  const dropzone = document.getElementById('excel-scanner-upload-area');
  const fileInput = document.getElementById('excel-file-scanner-input');
  if (!dropzone || !fileInput) return;

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt ? dt.files : null;
    if (files && files.length > 0) {
      uploadAndScanExcelFile(files[0]);
    }
  });
}

/**
 * Abre o modal de escaneamento de planilha de motoristas
 */
function openDriverExcelScannerModal() {
  openModal('modal-excel-scanner');
  if (currentScannedExcelRows.length === 0) {
    resetExcelScanner();
  }
}

/**
 * Reinicia o estado do scanner para permitir carregar nova planilha
 */
function resetExcelScanner() {
  currentScannedExcelRows = [];
  selectedScannedRowIds.clear();

  const fileInput = document.getElementById('excel-file-scanner-input');
  if (fileInput) fileInput.value = '';

  const dropzone = document.getElementById('excel-scanner-upload-area');
  const reviewContainer = document.getElementById('excel-scanner-review-container');
  const btnConfirm = document.getElementById('btn-confirm-excel-import');
  const fileStatus = document.getElementById('excel-scanner-file-status');

  if (dropzone) dropzone.style.display = 'block';
  if (reviewContainer) reviewContainer.style.display = 'none';
  if (btnConfirm) btnConfirm.style.display = 'none';
  if (fileStatus) fileStatus.textContent = 'Nenhum arquivo carregado.';
}

/**
 * Faz o download da planilha modelo oficial formatada
 */
function downloadDriverExcelTemplate() {
  showToast('Iniciando download do modelo oficial de planilha de frotas (.xlsx)...', 'info');
  window.location.href = '/api/drivers/excel-template';
}

/**
 * Manipula a seleção manual de arquivo pelo input file
 */
function handleExcelFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (file) {
    uploadAndScanExcelFile(file);
  }
}

/**
 * Envia o arquivo Excel ao backend para detecção de cabeçalhos e validação
 */
async function uploadAndScanExcelFile(file) {
  if (!file) return;

  const validExts = ['.xlsx', '.xls', '.csv'];
  const extMatch = validExts.some(ext => file.name.toLowerCase().endsWith(ext));
  if (!extMatch) {
    showToast('Formato inválido. Selecione um arquivo Excel (.xlsx, .xls) ou .csv.', 'error');
    return;
  }

  const dropzone = document.getElementById('excel-scanner-upload-area');
  const reviewContainer = document.getElementById('excel-scanner-review-container');
  const btnConfirm = document.getElementById('btn-confirm-excel-import');
  const fileStatus = document.getElementById('excel-scanner-file-status');

  const oldHtml = dropzone ? dropzone.innerHTML : '';
  if (dropzone) {
    dropzone.innerHTML = `
      <div style="padding: 2.5rem 1rem; text-align: center;">
        <div class="loading-spinner" style="margin: 0 auto 1.25rem;"></div>
        <h4 style="margin: 0 0 0.5rem 0; font-size: 1.15rem; color: #60a5fa;">Escaneando e analisando planilha...</h4>
        <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">
          Lendo linhas de <strong>${escapeHtml(file.name)}</strong>, detectando cabeçalhos e cruzando com o cadastro de frotas...
        </p>
      </div>
    `;
  }

  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/drivers/scan-excel', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Falha ao escanear planilha.');
    }

    if (!data.rows || data.rows.length === 0) {
      throw new Error('Nenhuma linha de motorista foi detectada na planilha. Verifique se o arquivo possui colunas com Nome e CPF.');
    }

    // Atribui IDs temporários locais para edição e exclusão
    currentScannedExcelRows = data.rows.map((r, i) => ({
      ...r,
      _tempId: r.tempId || `scan_row_${Date.now()}_${i}`,
      linha: r.rowNumber || r.linha || (i + 1),
      valido: r.isValid !== undefined ? r.isValid : (r.valido !== undefined ? r.valido : true),
      status_banco: r.existsInDb ? 'ATUALIZAR' : (r.status_banco || 'NOVO'),
      avisos: r.warnings || r.avisos || [],
      pix: r.chave_pix || r.pix || ''
    }));
    selectedScannedRowIds.clear();

    if (dropzone) {
      dropzone.innerHTML = oldHtml;
      dropzone.style.display = 'none';
    }
    if (reviewContainer) {
      reviewContainer.style.display = 'flex';
    }
    if (btnConfirm) {
      btnConfirm.style.display = 'inline-flex';
    }

    if (fileStatus) {
      fileStatus.innerHTML = `Arquivo: <strong>${escapeHtml(file.name)}</strong> (${(file.size / 1024).toFixed(1)} KB) &bull; ${currentScannedExcelRows.length} condutores escaneados`;
    }

    updateExcelScannerStats();
    renderScannedTable();

    showToast(`Planilha escaneada com sucesso! ${currentScannedExcelRows.length} condutores encontrados para conferência.`, 'success');
  } catch (err) {
    console.error('Scan Excel Error:', err);
    if (dropzone) {
      dropzone.innerHTML = oldHtml;
      dropzone.style.display = 'block';
    }
    showToast(`Erro ao escanear planilha: ${err.message}`, 'error');
  }
}

/**
 * Atualiza os contadores estatísticos do escaneamento
 */
function updateExcelScannerStats() {
  const total = currentScannedExcelRows.length;
  const valid = currentScannedExcelRows.filter(r => r.valido).length;
  const novos = currentScannedExcelRows.filter(r => r.status_banco === 'NOVO').length;
  const updates = currentScannedExcelRows.filter(r => r.status_banco === 'ATUALIZAR').length;
  const warnings = currentScannedExcelRows.filter(r => (r.avisos && r.avisos.length > 0) || !r.valido).length;

  const elTotal = document.getElementById('scan-stat-total');
  const elValid = document.getElementById('scan-stat-valid');
  const elNew = document.getElementById('scan-stat-new');
  const elUpdate = document.getElementById('scan-stat-update');
  const elWarning = document.getElementById('scan-stat-warning');
  const elBtnCount = document.getElementById('btn-import-count');

  if (elTotal) elTotal.textContent = total;
  if (elValid) elValid.textContent = valid;
  if (elNew) elNew.textContent = novos;
  if (elUpdate) elUpdate.textContent = updates;
  if (elWarning) elWarning.textContent = warnings;
  if (elBtnCount) elBtnCount.textContent = total;
}

/**
 * Filtra a tabela escaneada por texto e tipo
 */
function filterScannedTable() {
  renderScannedTable();
}

/**
 * Renderiza a tabela de linhas escaneadas com suporte a edição e exclusão
 */
function renderScannedTable() {
  const tableBody = document.getElementById('excel-scanned-table-body');
  if (!tableBody) return;

  const searchVal = (document.getElementById('scan-table-search')?.value || '').toLowerCase().trim();
  const filterType = document.getElementById('scan-table-filter-type')?.value || 'all';

  const filtered = currentScannedExcelRows.filter(r => {
    // Filtro por texto
    if (searchVal) {
      const matchName = (r.nome || '').toLowerCase().includes(searchVal);
      const matchCpf = (r.cpf || '').toLowerCase().includes(searchVal);
      const matchCavalo = (r.placa_cavalo || '').toLowerCase().includes(searchVal);
      const matchCarreta = (r.placa_carreta || '').toLowerCase().includes(searchVal);
      const matchTel = (r.telefone || '').toLowerCase().includes(searchVal);
      if (!matchName && !matchCpf && !matchCavalo && !matchCarreta && !matchTel) return false;
    }
    // Filtro por tipo de validação
    if (filterType === 'valid') return r.valido;
    if (filterType === 'new') return r.status_banco === 'NOVO';
    if (filterType === 'updates') return r.status_banco === 'ATUALIZAR';
    if (filterType === 'warnings') return !r.valido || (r.avisos && r.avisos.length > 0);
    return true;
  });

  if (filtered.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="11" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          Nenhum registro encontrado para o filtro aplicado.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = filtered.map(r => {
    const isSelected = selectedScannedRowIds.has(r._tempId);
    const hasWarnings = (r.avisos && r.avisos.length > 0) || !r.valido;
    const isUpdate = r.status_banco === 'ATUALIZAR';

    // Label do Vínculo
    let vinculoLabel = 'Frota Própria';
    let vinculoBadge = 'background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.35);';
    if (r.tipo_vinculo === 'agregado') {
      vinculoLabel = 'Agregado';
      vinculoBadge = 'background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35);';
    } else if (r.tipo_vinculo === 'terceirizado') {
      vinculoLabel = 'Terceirizado';
      vinculoBadge = 'background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.35);';
    }

    // Badge de Validação e Status
    let statusBadge = '';
    if (hasWarnings) {
      const tip = (r.avisos || []).join(' | ');
      statusBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4);" title="${escapeHtml(tip)}">⚠️ ${escapeHtml(r.avisos ? r.avisos[0] : 'Verificar')}</span>`;
    } else if (isUpdate) {
      statusBadge = `<span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4);" title="Motorista já cadastrado; seus dados e frota serão atualizados.">🔄 Atualização</span>`;
    } else {
      statusBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);">✓ Novo Válido</span>`;
    }

    const placasStr = [r.placa_cavalo, r.placa_carreta].filter(Boolean).join(' / ') || '<span style="color: var(--text-muted);">-</span>';
    const comissaoVal = parseFloat(r.percentual_comissao !== undefined ? r.percentual_comissao : 75.0).toFixed(1);

    return `
      <tr class="${hasWarnings ? 'scanned-row-warning' : ''}" style="${isSelected ? 'background: rgba(37, 99, 235, 0.1);' : ''}">
        <td style="text-align: center;">
          <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleScannedRowSelection('${r._tempId}', this.checked)">
        </td>
        <td style="text-align: center; color: var(--text-muted); font-size: 0.75rem;">
          #${r.linha || '-'}
        </td>
        <td>
          <div style="font-weight: 600; color: #ffffff;">${escapeHtml(r.nome)}</div>
          ${r.cnh ? `<div style="font-size: 0.7rem; color: var(--text-muted);">CNH: ${escapeHtml(r.cnh)}</div>` : ''}
        </td>
        <td style="font-family: monospace; font-size: 0.775rem;">
          ${escapeHtml(r.cpf)}
        </td>
        <td>
          <span class="badge" style="${vinculoBadge}; font-size: 0.7rem;">
            ${vinculoLabel}
          </span>
        </td>
        <td style="font-family: monospace; font-size: 0.775rem;">
          ${placasStr}
        </td>
        <td style="text-align: center; font-weight: 700; color: #34d399;">
          ${comissaoVal}%
        </td>
        <td style="font-size: 0.75rem;">
          ${escapeHtml(r.telefone || '-')}
        </td>
        <td style="font-size: 0.725rem; font-family: monospace; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${escapeHtml(r.pix || '-')}
        </td>
        <td>
          ${statusBadge}
        </td>
        <td style="text-align: center; white-space: nowrap;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="openEditScannedRow('${r._tempId}')" title="Editar dados desta linha antes de salvar" style="padding: 0.2rem 0.45rem; font-size: 0.75rem; margin-right: 0.25rem;">
            ✏️
          </button>
          <button type="button" class="btn btn-outline-danger btn-sm" onclick="deleteScannedRow('${r._tempId}')" title="Excluir da lista" style="padding: 0.2rem 0.45rem; font-size: 0.75rem;">
            🗑️
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Atualiza botão de exclusão em lote
  const btnBatchDelete = document.getElementById('btn-scan-batch-delete');
  const selectedCountEl = document.getElementById('scan-selected-count');
  if (btnBatchDelete) {
    btnBatchDelete.style.display = selectedScannedRowIds.size > 0 ? 'inline-flex' : 'none';
  }
  if (selectedCountEl) {
    selectedCountEl.textContent = selectedScannedRowIds.size;
  }

  const selectAllCb = document.getElementById('scan-select-all');
  if (selectAllCb) {
    selectAllCb.checked = filtered.length > 0 && filtered.every(r => selectedScannedRowIds.has(r._tempId));
  }
}

/**
 * Seleciona ou desmarca todas as linhas atualmente filtradas
 */
function toggleSelectAllScanned(checked) {
  const searchVal = (document.getElementById('scan-table-search')?.value || '').toLowerCase().trim();
  const filterType = document.getElementById('scan-table-filter-type')?.value || 'all';

  const filtered = currentScannedExcelRows.filter(r => {
    if (searchVal) {
      const matchName = (r.nome || '').toLowerCase().includes(searchVal);
      const matchCpf = (r.cpf || '').toLowerCase().includes(searchVal);
      const matchCavalo = (r.placa_cavalo || '').toLowerCase().includes(searchVal);
      const matchCarreta = (r.placa_carreta || '').toLowerCase().includes(searchVal);
      if (!matchName && !matchCpf && !matchCavalo && !matchCarreta) return false;
    }
    if (filterType === 'valid') return r.valido;
    if (filterType === 'new') return r.status_banco === 'NOVO';
    if (filterType === 'updates') return r.status_banco === 'ATUALIZAR';
    if (filterType === 'warnings') return !r.valido || (r.avisos && r.avisos.length > 0);
    return true;
  });

  filtered.forEach(r => {
    if (checked) selectedScannedRowIds.add(r._tempId);
    else selectedScannedRowIds.delete(r._tempId);
  });

  renderScannedTable();
}

/**
 * Alterna a seleção individual de uma linha escaneada
 */
function toggleScannedRowSelection(tempId, checked) {
  if (checked) selectedScannedRowIds.add(tempId);
  else selectedScannedRowIds.delete(tempId);

  const btnBatchDelete = document.getElementById('btn-scan-batch-delete');
  const selectedCountEl = document.getElementById('scan-selected-count');
  if (btnBatchDelete) {
    btnBatchDelete.style.display = selectedScannedRowIds.size > 0 ? 'inline-flex' : 'none';
  }
  if (selectedCountEl) {
    selectedCountEl.textContent = selectedScannedRowIds.size;
  }
}

/**
 * Exclui uma única linha escaneada
 */
function deleteScannedRow(tempId) {
  const target = currentScannedExcelRows.find(r => r._tempId === tempId);
  const name = target ? target.nome : 'Linha';

  currentScannedExcelRows = currentScannedExcelRows.filter(r => r._tempId !== tempId);
  selectedScannedRowIds.delete(tempId);

  updateExcelScannerStats();
  renderScannedTable();
  showToast(`Registro de "${name}" removido da importação.`, 'info');
}

/**
 * Exclui em lote todas as linhas selecionadas com checkbox
 */
function batchDeleteScannedRows() {
  if (selectedScannedRowIds.size === 0) return;

  const count = selectedScannedRowIds.size;
  if (!confirm(`Deseja realmente excluir as ${count} linha(s) selecionada(s) da planilha escaneada?`)) {
    return;
  }

  currentScannedExcelRows = currentScannedExcelRows.filter(r => !selectedScannedRowIds.has(r._tempId));
  selectedScannedRowIds.clear();

  updateExcelScannerStats();
  renderScannedTable();
  showToast(`${count} registro(s) excluído(s) da importação.`, 'info');
}

/**
 * Abre o sub-modal de edição para uma linha escaneada
 */
function openEditScannedRow(tempId) {
  const row = currentScannedExcelRows.find(r => r._tempId === tempId);
  if (!row) return;

  document.getElementById('edit-scanned-temp-id').value = row._tempId;
  document.getElementById('edit-scanned-nome').value = row.nome || '';
  document.getElementById('edit-scanned-cpf').value = row.cpf || '';
  document.getElementById('edit-scanned-cnh').value = row.cnh || '';
  document.getElementById('edit-scanned-vinculo').value = row.tipo_vinculo || 'frota_propria';
  document.getElementById('edit-scanned-cavalo').value = row.placa_cavalo || '';
  document.getElementById('edit-scanned-carreta').value = row.placa_carreta || '';
  document.getElementById('edit-scanned-comissao').value = row.percentual_comissao !== undefined ? row.percentual_comissao : 75.0;
  document.getElementById('edit-scanned-telefone').value = row.telefone || '';
  document.getElementById('edit-scanned-pix').value = row.pix || '';

  openModal('modal-edit-scanned-row');
}

/**
 * Salva as alterações feitas na linha escaneada
 */
function saveEditedScannedRow(event) {
  event.preventDefault();
  const tempId = document.getElementById('edit-scanned-temp-id').value;
  const row = currentScannedExcelRows.find(r => r._tempId === tempId);
  if (!row) return;

  const rawCpf = document.getElementById('edit-scanned-cpf').value.trim();
  const cleanCpf = rawCpf.replace(/\D/g, '');

  if (cleanCpf.length !== 11) {
    showToast('CPF inválido. O CPF deve conter exatamente 11 dígitos.', 'error');
    return;
  }

  // Formata CPF 000.000.000-00
  const formattedCpf = cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

  row.nome = document.getElementById('edit-scanned-nome').value.trim();
  row.cpf = formattedCpf;
  row.cnh = document.getElementById('edit-scanned-cnh').value.trim();
  row.tipo_vinculo = document.getElementById('edit-scanned-vinculo').value;
  row.placa_cavalo = document.getElementById('edit-scanned-cavalo').value.trim().toUpperCase();
  row.placa_carreta = document.getElementById('edit-scanned-carreta').value.trim().toUpperCase();
  row.percentual_comissao = parseFloat(document.getElementById('edit-scanned-comissao').value) || 75.0;
  row.telefone = document.getElementById('edit-scanned-telefone').value.trim();
  row.pix = document.getElementById('edit-scanned-pix').value.trim();
  row.valido = true;

  // Atualiza avisos
  row.avisos = [];
  if (!row.placa_cavalo) {
    row.avisos.push('Sem placa de cavalo informada');
  }

  closeModal('modal-edit-scanned-row');
  updateExcelScannerStats();
  renderScannedTable();
  showToast(`Dados de "${row.nome}" atualizados com sucesso!`, 'success');
}

/**
 * Confirma a importação de todas as linhas revisadas para o banco de dados SQLite
 */
async function confirmImportScannedDrivers() {
  if (currentScannedExcelRows.length === 0) {
    showToast('Não há condutores para importar.', 'warning');
    return;
  }

  const btnConfirm = document.getElementById('btn-confirm-excel-import');
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = `<span class="loading-spinner" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 5px;"></span> Gravando...`;
  }

  try {
    const res = await fetch('/api/drivers/import-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: currentScannedExcelRows })
    });
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Falha ao gravar condutores no banco.');
    }

    const importedCount = (data.createdCount !== undefined && data.updatedCount !== undefined)
      ? (data.createdCount + data.updatedCount)
      : (data.imported || data.totalProcessed || currentScannedExcelRows.length);
    showToast(data.message || `Sucesso! ${importedCount} condutores e frotas gravados/atualizados no cadastro.`, 'success');
    closeModal('modal-excel-scanner');
    resetExcelScanner();

    // Recarrega lista de motoristas na interface
    await loadDrivers();
    if (typeof loadDriversManagement === 'function') {
      loadDriversManagement();
    }
  } catch (err) {
    console.error('Import Scanned Drivers Error:', err);
    showToast(`Erro ao gravar condutores: ${err.message}`, 'error');
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = `💾 Gravar no Cadastro (<span id="btn-import-count">${currentScannedExcelRows.length}</span> Condutores & Frotas)`;
    }
  }
}

// =========================================================================
// CONSULTA MULTICRITÉRIO POR MÚLTIPLOS ÍCONES (2 OU MAIS SELECIONADOS)
// =========================================================================

/**
 * Alterna a seleção de um ícone de consulta multicritério
 */
function toggleQueryIcon(iconKey) {
  if (selectedQueryIcons.has(iconKey)) {
    selectedQueryIcons.delete(iconKey);
  } else {
    selectedQueryIcons.add(iconKey);
  }

  // Atualiza estado ativo do chip no DOM
  const chip = document.querySelector(`.multi-icon-chip[data-icon="${iconKey}"]`);
  if (chip) {
    if (selectedQueryIcons.has(iconKey)) chip.classList.add('active');
    else chip.classList.remove('active');
  }

  applyMultiIconFilter();
}

/**
 * Limpa todos os ícones de consulta selecionados
 */
function clearSelectedQueryIcons() {
  selectedQueryIcons.clear();
  document.querySelectorAll('.multi-icon-chip').forEach(c => c.classList.remove('active'));
  applyMultiIconFilter();
}

/**
 * Atualiza os contadores numéricos de cada chip de ícone
 */
function updateMultiIconCounts(docs) {
  if (!docs) return;

  const countCte = docs.filter(d => d.tipo === 'CT-e').length;
  const countMdfe = docs.filter(d => d.tipo === 'MDF-e').length;
  const countFrota = docs.filter(d => (d.motorista_tipo_vinculo || '').toLowerCase() === 'frota_propria').length;
  const countAgregado = docs.filter(d => (d.motorista_tipo_vinculo || '').toLowerCase() === 'agregado').length;
  const countTerc = docs.filter(d => (d.motorista_tipo_vinculo || '').toLowerCase() === 'terceirizado').length;
  const countInter = docs.filter(d => d.interestadual === 1 || (d.uf_origem && d.uf_destino && d.uf_origem !== d.uf_destino) || (d.uf_destino && d.uf_destino !== 'AL')).length;
  const countIcms = docs.filter(d => parseFloat(d.valor_icms || 0) > 0).length;
  const countCarajas = docs.filter(d => ((d.tomador_nome || '') + ' ' + (d.remetente_nome || '') + ' ' + (d.destinatario_nome || '')).toUpperCase().includes('CARAJAS')).length;

  const setEl = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setEl('chip-count-cte', countCte);
  setEl('chip-count-mdfe', countMdfe);
  setEl('chip-count-frota', countFrota);
  setEl('chip-count-agregado', countAgregado);
  setEl('chip-count-terceirizado', countTerc);
  setEl('chip-count-interestadual', countInter);
  setEl('chip-count-icms', countIcms);
  setEl('chip-count-carajas', countCarajas);
}

/**
 * Aplica o filtro de múltiplos ícones (interseção de todos os critérios selecionados)
 */
function applyMultiIconFilter() {
  const feedbackBar = document.getElementById('multi-icon-active-feedback');
  const feedbackText = document.getElementById('multi-icon-feedback-text');

  if (selectedQueryIcons.size === 0) {
    if (feedbackBar) feedbackBar.style.display = 'none';
    renderTable(allDocumentsCache);
    if (currentKPIsCache) renderKPIs(currentKPIsCache);
    return;
  }

  const iconLabels = {
    cte: 'CT-e (Fretes)',
    mdfe: 'MDF-e (Manifestos)',
    frota_propria: 'Frota Própria',
    agregado: 'Agregados',
    terceirizado: 'Terceirizados',
    interestadual: 'Interestaduais',
    com_icms: 'Com ICMS',
    carajas: 'Carajás'
  };

  const selectedList = Array.from(selectedQueryIcons);
  const labelsText = selectedList.map(k => iconLabels[k] || k).join(' + ');

  // Filtra registros combinando todos os critérios selecionados
  const filtered = allDocumentsCache.filter(doc => {
    for (const icon of selectedList) {
      if (icon === 'cte' && doc.tipo !== 'CT-e') return false;
      if (icon === 'mdfe' && doc.tipo !== 'MDF-e') return false;
      if (icon === 'frota_propria' && (doc.motorista_tipo_vinculo || '').toLowerCase() !== 'frota_propria') return false;
      if (icon === 'agregado' && (doc.motorista_tipo_vinculo || '').toLowerCase() !== 'agregado') return false;
      if (icon === 'terceirizado' && (doc.motorista_tipo_vinculo || '').toLowerCase() !== 'terceirizado') return false;
      if (icon === 'interestadual') {
        const isInter = doc.interestadual === 1 || (doc.uf_origem && doc.uf_destino && doc.uf_origem !== doc.uf_destino) || (doc.uf_destino && doc.uf_destino !== 'AL');
        if (!isInter) return false;
      }
      if (icon === 'com_icms') {
        if (parseFloat(doc.valor_icms || 0) <= 0) return false;
      }
      if (icon === 'carajas') {
        const fullStr = ((doc.tomador_nome || '') + ' ' + (doc.remetente_nome || '') + ' ' + (doc.destinatario_nome || '')).toUpperCase();
        if (!fullStr.includes('CARAJAS')) return false;
      }
    }
    return true;
  });

  if (feedbackBar) feedbackBar.style.display = 'flex';
  if (feedbackText) {
    feedbackText.innerHTML = `<strong>${selectedList.length} critério(s) selecionado(s):</strong> [${labelsText}] &bull; <span style="color: #60a5fa; font-weight: 700;">${filtered.length} registro(s) encontrado(s)</span>`;
  }

  renderTable(filtered);

  // Recalcula os KPIs para o conjunto filtrado
  const filteredCtes = filtered.filter(d => d.tipo === 'CT-e');
  const filteredMdfes = filtered.filter(d => d.tipo === 'MDF-e');
  const totalFrete = filteredCtes.reduce((acc, c) => acc + (c.valor || 0), 0);
  const totalCarga = filteredMdfes.reduce((acc, m) => acc + (m.valor || 0), 0);
  const totalComissao = filteredCtes.reduce((acc, c) => acc + (c.valor_comissao || c.valor * 0.75 || 0), 0);
  const totalICMS = filteredCtes.reduce((acc, c) => acc + (c.valor_icms || 0), 0);
  const countInter = filtered.filter(d => d.interestadual === 1 || (d.uf_origem && d.uf_destino && d.uf_origem !== d.uf_destino) || (d.uf_destino && d.uf_destino !== 'AL')).length;

  renderKPIs({
    totalFrete,
    totalAmount: totalFrete,
    totalCarga,
    totalComissao75: totalComissao,
    totalICMS,
    documentCount: filtered.length,
    interstateCount: countInter
  });
}

// =========================================================================
// CONSULTA COMBINADA POR MÚLTIPLOS CARDS DE KPI (2 OU MAIS CARDS)
// =========================================================================

/**
 * Alterna a seleção de um KPI card para consulta combinada
 */
function toggleMultiKPISelection(kpiName) {
  if (selectedKPIIcons.has(kpiName)) {
    selectedKPIIcons.delete(kpiName);
  } else {
    selectedKPIIcons.add(kpiName);
  }

  // Atualiza estados visuais dos botões e dos cards
  ['frete', 'comissao', 'icms', 'documentos'].forEach(k => {
    const card = document.getElementById(`card-kpi-${k}`);
    const toggleBtn = document.getElementById(`kpi-toggle-${k}`);
    const isSel = selectedKPIIcons.has(k);

    if (card) {
      if (isSel) card.classList.add('kpi-multi-selected');
      else card.classList.remove('kpi-multi-selected');
    }
    if (toggleBtn) {
      if (isSel) {
        toggleBtn.textContent = '✓ Ativo';
        toggleBtn.classList.add('active');
      } else {
        toggleBtn.textContent = '+ Consulta';
        toggleBtn.classList.remove('active');
      }
    }
  });

  if (selectedKPIIcons.size >= 2) {
    renderMultiKPIConsolidation();
  } else if (selectedKPIIcons.size === 1) {
    const single = Array.from(selectedKPIIcons)[0];
    selectKPIDetail(single, true);
  } else {
    closeKPIDetailPanel();
  }
}

/**
 * Renderiza o painel analítico consolidando os KPIs selecionados simultaneamente
 */
function renderMultiKPIConsolidation() {
  const panel = document.getElementById('kpi-detail-panel');
  if (!panel) return;
  panel.style.display = 'flex';

  activeKPIDetail = 'multi_consolidation';

  const eyebrowEl = document.getElementById('kpi-detail-eyebrow');
  const titleEl = document.getElementById('kpi-detail-title');
  const descEl = document.getElementById('kpi-detail-desc');
  const badgeIcon = document.getElementById('kpi-detail-badge-icon');

  if (badgeIcon) {
    badgeIcon.textContent = '⚡';
    badgeIcon.style.background = 'rgba(99, 102, 241, 0.2)';
    badgeIcon.style.color = '#818cf8';
  }

  const kpiNamesMap = {
    frete: 'Faturamento / Fretes',
    comissao: 'Comissões 75%',
    icms: 'ICMS Destacado',
    documentos: 'Viagens & Documentos'
  };

  const selectedArr = Array.from(selectedKPIIcons);
  const titlesList = selectedArr.map(k => kpiNamesMap[k] || k).join(' + ');

  if (eyebrowEl) eyebrowEl.textContent = `CONSULTA MULTI-CRITÉRIO CONSOLIDADA (${selectedArr.length} ÍCONES SELECIONADOS)`;
  if (titleEl) titleEl.textContent = `Análise Cruzada e Comparativa de Indicadores`;
  if (descEl) descEl.textContent = `Visualização simultânea consolidada entre: ${titlesList}.`;

  const m = getKPIDetailMetrics();
  const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  // Renderiza cartões comparativos
  const statsContainer = document.getElementById('kpi-detail-stats-grid');
  if (statsContainer) {
    let cardsHtml = '';

    if (selectedKPIIcons.has('frete')) {
      cardsHtml += `
        <div class="kpi-sub-stat-card" style="border-left: 3px solid #2563eb;">
          <span class="kpi-sub-stat-label">💵 Faturamento Total Frete</span>
          <span class="kpi-sub-stat-val" style="color: #60a5fa;">${formatBRL(m.totalFrete)}</span>
          <span class="kpi-sub-stat-desc">${m.cteCount} CT-e(s) emitidos</span>
        </div>
      `;
    }
    if (selectedKPIIcons.has('comissao')) {
      const margemEmpresa = Math.max(0, m.totalFrete - m.totalComissao);
      cardsHtml += `
        <div class="kpi-sub-stat-card" style="border-left: 3px solid #10b981;">
          <span class="kpi-sub-stat-label">🛡️ Comissão Motoristas (75%)</span>
          <span class="kpi-sub-stat-val" style="color: #34d399;">${formatBRL(m.totalComissao)}</span>
          <span class="kpi-sub-stat-desc">Margem Empresa (25%): ${formatBRL(margemEmpresa)}</span>
        </div>
      `;
    }
    if (selectedKPIIcons.has('icms')) {
      const cargaTrib = m.totalFrete > 0 ? ((m.totalIcms / m.totalFrete) * 100).toFixed(1) : '0.0';
      cardsHtml += `
        <div class="kpi-sub-stat-card" style="border-left: 3px solid #f59e0b;">
          <span class="kpi-sub-stat-label">🧾 Total ICMS Destacado</span>
          <span class="kpi-sub-stat-val" style="color: #fbbf24;">${formatBRL(m.totalIcms)}</span>
          <span class="kpi-sub-stat-desc">Carga Efetiva: ${cargaTrib}% s/ Frete</span>
        </div>
      `;
    }
    if (selectedKPIIcons.has('documentos')) {
      const avgFrete = m.cteCount > 0 ? m.totalFrete / m.cteCount : 0;
      cardsHtml += `
        <div class="kpi-sub-stat-card" style="border-left: 3px solid #8b5cf6;">
          <span class="kpi-sub-stat-label">📄 Viagens & Operações</span>
          <span class="kpi-sub-stat-val" style="color: #c084fc;">${m.totalDocs} docs</span>
          <span class="kpi-sub-stat-desc">Ticket Médio: ${formatBRL(avgFrete)}</span>
        </div>
      `;
    }

    statsContainer.innerHTML = cardsHtml;
  }

  // Renderiza gráficos e tabela analítica
  renderKPIDetailCharts('frete', m);
  renderKPIDetailTable('frete', m);

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  showToast(`Consulta combinada ativa para: ${titlesList}`, 'info');
}

// Global functions for inline HTML event handlers
window.openDocPreview = openDocPreview;
window.openDocDetails = openDocDetails;
window.downloadOriginalXML = downloadOriginalXML;
window.openDriverModal = openDriverModal;
window.confirmDeleteDriver = confirmDeleteDriver;
window.closeModal = closeModal;
window.openCompleteXmlModal = openCompleteXmlModal;
window.switchXmlInputMode = switchXmlInputMode;
window.loadSampleXmlForCompletion = loadSampleXmlForCompletion;
window.clearXmlForm = clearXmlForm;
window.analyzeXmlContent = analyzeXmlContent;
window.saveCompletedXml = saveCompletedXml;
window.populateDriverFromXmlPreview = populateDriverFromXmlPreview;
window.openManualTripModal = openManualTripModal;
window.setManualTripType = setManualTripType;
window.updateManualCommissionPreview = updateManualCommissionPreview;
window.saveManualTrip = saveManualTrip;
window.confirmSendToFinance = confirmSendToFinance;
window.confirmDeleteTrip = confirmDeleteTrip;
window.toggleDriverSelection = toggleDriverSelection;
window.toggleSelectAllDrivers = toggleSelectAllDrivers;
window.clearDriverSelections = clearDriverSelections;
window.batchDeleteSelectedDrivers = batchDeleteSelectedDrivers;
window.loadDriversAnalytics = loadDriversAnalytics;
window.renderDriversManagementTable = renderDriversManagementTable;
window.renderOverviewChartsPreview = renderOverviewChartsPreview;
window.loadFreightRepositoryPresets = loadFreightRepositoryPresets;
window.openFreightRepoModal = openFreightRepoModal;
window.runFreightCalculation = runFreightCalculation;
window.applySimulatedFreightToTrip = applySimulatedFreightToTrip;
window.useCurrentRepoInTrip = useCurrentRepoInTrip;
window.applyFreightPresetToManualTrip = applyFreightPresetToManualTrip;

// Funções do Scanner de Excel e Consulta por Múltiplos Ícones
window.openDriverExcelScannerModal = openDriverExcelScannerModal;
window.downloadDriverExcelTemplate = downloadDriverExcelTemplate;
window.handleExcelFileSelected = handleExcelFileSelected;
window.filterScannedTable = filterScannedTable;
window.toggleSelectAllScanned = toggleSelectAllScanned;
window.toggleScannedRowSelection = toggleScannedRowSelection;
window.batchDeleteScannedRows = batchDeleteScannedRows;
window.deleteScannedRow = deleteScannedRow;
window.openEditScannedRow = openEditScannedRow;
window.saveEditedScannedRow = saveEditedScannedRow;
window.confirmImportScannedDrivers = confirmImportScannedDrivers;
window.resetExcelScanner = resetExcelScanner;
window.toggleQueryIcon = toggleQueryIcon;
window.clearSelectedQueryIcons = clearSelectedQueryIcons;
window.applyMultiIconFilter = applyMultiIconFilter;
window.toggleMultiKPISelection = toggleMultiKPISelection;
window.renderMultiKPIConsolidation = renderMultiKPIConsolidation;

/* ==========================================================================
   LEITOR DE NF-E (XML) & ROTEADOR AUTOMÁTICO DE CARGAS PARA CT-E
   ========================================================================== */

/**
 * Configurar Área de Dropzone e Input de Arquivos XML de NF-e
 */
function setupNFeDropzone() {
  const dropzone = document.getElementById('nfe-dropzone');
  const fileInput = document.getElementById('nfe-file-input');
  if (!dropzone || !fileInput) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.style.borderColor = '#1d4ed8';
      dropzone.style.backgroundColor = '#dbeafe';
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.style.borderColor = '#3b82f6';
      dropzone.style.backgroundColor = '#eff6ff';
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      uploadNFeBatch(dt.files);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      uploadNFeBatch(fileInput.files);
      fileInput.value = ''; // Reset to allow re-upload
    }
  });
}

/**
 * Enviar Lote de Arquivos XML de NF-e para a API de Processamento
 */
async function uploadNFeBatch(fileList) {
  const files = Array.from(fileList);
  const xmlFiles = files.filter(f => f.name.toLowerCase().endsWith('.xml'));

  if (xmlFiles.length === 0) {
    showToast('Nenhum arquivo .xml selecionado.', 'warning');
    return;
  }

  const container = document.getElementById('nfe-groups-container');
  if (container) {
    container.innerHTML = `
      <div style="background: #ffffff; border-radius: var(--radius-lg); padding: 3rem; text-align: center; border: 1px solid var(--border-glass);">
        <div class="loading-spinner" style="width: 44px; height: 44px; border: 3px solid #e2e8f0; border-top-color: #2563eb; border-radius: 50%; margin: 0 auto 1.25rem auto; animation: spin 1s linear infinite;"></div>
        <h4 style="font-size: 1.1rem; font-weight: 700; color: #1e293b; margin-bottom: 0.5rem;">Processando Lote de ${xmlFiles.length} Arquivo(s) XML de NF-e...</h4>
        <p style="font-size: 0.85rem; color: #64748b; margin: 0;">Fazendo leitura das tags fiscais, agrupamento por destino e roteamento de tomador (PF vs PJ)...</p>
      </div>
    `;
  }

  const formData = new FormData();
  xmlFiles.forEach(file => {
    formData.append('nfe_files', file);
  });

  try {
    const res = await fetch('/api/nfe/upload', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Falha ao processar arquivos XML de NF-e.');
    }

    renderNFeBatchView(data.data);
    showToast(`Lote processado com sucesso! ${data.data.total_nfe_lidas} NF-es agrupadas em ${data.data.total_grupos_cte} lote(s) de CT-e.`, 'success');
  } catch (err) {
    console.error('Erro no upload de NF-es:', err);
    showToast('Erro ao processar lote de NF-e: ' + err.message, 'error');
    clearNFeProcessor();
  }
}

/**
 * Carregar Lote de Demonstração (Maceió, Arapiraca e Juazeiro do Norte)
 */
async function loadNFeSampleBatch() {
  const container = document.getElementById('nfe-groups-container');
  if (container) {
    container.innerHTML = `
      <div style="background: #ffffff; border-radius: var(--radius-lg); padding: 3rem; text-align: center; border: 1px solid var(--border-glass);">
        <div class="loading-spinner" style="width: 44px; height: 44px; border: 3px solid #e2e8f0; border-top-color: #2563eb; border-radius: 50%; margin: 0 auto 1.25rem auto; animation: spin 1s linear infinite;"></div>
        <h4 style="font-size: 1.1rem; font-weight: 700; color: #1e293b; margin-bottom: 0.5rem;">Carregando Lote de Demonstração de NF-es...</h4>
        <p style="font-size: 0.85rem; color: #64748b; margin: 0;">Gerando 6 XMLs de NF-e com destinos múltiplos e destinatários PF / PJ...</p>
      </div>
    `;
  }

  try {
    const res = await fetch('/api/nfe/sample-batch');
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Erro ao carregar lote de demonstração.');
    }

    renderNFeBatchView(data.data);
    showToast('Lote de demonstração carregado com 6 NF-es separadas por 3 destinos!', 'success');
  } catch (err) {
    console.error('Erro ao carregar lote de demonstração:', err);
    showToast('Erro: ' + err.message, 'error');
    clearNFeProcessor();
  }
}

/**
 * Limpar Triagem e Resetar Tela
 */
function clearNFeProcessor() {
  currentNFeBatchData = null;

  // Reset KPI cards
  const elDocs = document.getElementById('nfe-kpi-total-docs');
  if (elDocs) elDocs.textContent = '0';
  const elBreakdown = document.getElementById('nfe-kpi-breakdown-clients');
  if (elBreakdown) elBreakdown.textContent = '0 PF | 0 PJ';
  const elGroups = document.getElementById('nfe-kpi-total-groups');
  if (elGroups) elGroups.textContent = '0';
  const elRoutes = document.getElementById('nfe-kpi-breakdown-routes');
  if (elRoutes) elRoutes.textContent = 'Destinos separados';
  const elValor = document.getElementById('nfe-kpi-total-valor');
  if (elValor) elValor.textContent = 'R$ 0,00';
  const elPeso = document.getElementById('nfe-kpi-total-peso');
  if (elPeso) elPeso.textContent = '0,000 kg';
  const elVolumes = document.getElementById('nfe-kpi-total-volumes');
  if (elVolumes) elVolumes.textContent = '0 volumes';

  // Disable export button
  const btnExport = document.getElementById('btn-nfe-export-excel');
  if (btnExport) btnExport.disabled = true;

  // Empty state container
  const container = document.getElementById('nfe-groups-container');
  if (container) {
    container.innerHTML = `
      <div class="nfe-empty-state" style="background: #ffffff; border: 1px solid var(--border-glass); border-radius: var(--radius-lg); padding: 3.5rem 2rem; text-align: center; box-shadow: var(--shadow-sm);">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: #e0f2fe; color: #0284c7; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 1rem;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
        </div>
        <h3 style="font-size: 1.15rem; font-weight: 700; color: #0f172a; margin-bottom: 0.5rem;">Nenhum lote de NF-e processado no momento</h3>
        <p style="font-size: 0.85rem; color: #64748b; max-width: 580px; margin: 0 auto 1.5rem auto;">
          Arraste arquivos XML de NF-e para a área acima ou clique no botão de demonstração para carregar um lote completo com clientes Pessoa Física (PF) e Pessoa Jurídica (PJ) separados por destino.
        </p>
        <button type="button" class="btn btn-primary" onclick="loadNFeSampleBatch()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          <span>Carregar Lote Demonstração (Misto PF/PJ)</span>
        </button>
      </div>
    `;
  }
}

/**
 * Renderizar Visão Completa de Lotes e Grupos de CT-e
 */
function renderNFeBatchView(rawBatchData) {
  const batchData = (rawBatchData && rawBatchData.data) ? rawBatchData.data : rawBatchData;
  currentNFeBatchData = batchData;

  const grupos = batchData.grupos_cte || batchData.grupos || [];
  const kpis = batchData.kpis || {};

  const totalNfes = kpis.totalNfes !== undefined ? kpis.totalNfes : (batchData.total_nfe_lidas || 0);
  const totalGrupos = kpis.totalGrupos !== undefined ? kpis.totalGrupos : grupos.length;
  const totalValor = kpis.totalValor !== undefined ? kpis.totalValor : (batchData.valor_total_todas_cargas || 0);
  const totalPeso = kpis.totalPeso !== undefined ? kpis.totalPeso : (batchData.peso_bruto_total_todas_cargas || 0);
  const totalVolumes = kpis.totalVolumes !== undefined ? kpis.totalVolumes : (batchData.volumes_totais_todas_cargas || 0);
  const totalPf = kpis.totalPf !== undefined ? kpis.totalPf : (batchData.total_pf || 0);
  const totalPj = kpis.totalPj !== undefined ? kpis.totalPj : (batchData.total_pj || 0);

  // 1. Atualizar Painel de KPIs
  const fmtMoney = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const fmtNumber = (v, dec = 0) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  const elDocs = document.getElementById('nfe-kpi-total-docs');
  if (elDocs) elDocs.textContent = totalNfes;
  const elBreakdown = document.getElementById('nfe-kpi-breakdown-clients');
  if (elBreakdown) elBreakdown.textContent = `${totalPf} PF | ${totalPj} PJ`;
  const elGroups = document.getElementById('nfe-kpi-total-groups');
  if (elGroups) elGroups.textContent = totalGrupos;
  const elRoutes = document.getElementById('nfe-kpi-breakdown-routes');
  if (elRoutes) elRoutes.textContent = `${totalGrupos} destinos separados`;
  const elValor = document.getElementById('nfe-kpi-total-valor');
  if (elValor) elValor.textContent = fmtMoney(totalValor);
  const elPeso = document.getElementById('nfe-kpi-total-peso');
  if (elPeso) elPeso.textContent = `${fmtNumber(totalPeso, 3)} kg`;
  const elVolumes = document.getElementById('nfe-kpi-total-volumes');
  if (elVolumes) elVolumes.textContent = `${totalVolumes} volumes`;

  // Habilitar botão de exportação Excel
  const btnExport = document.getElementById('btn-nfe-export-excel');
  if (btnExport) btnExport.disabled = false;

  // 2. Renderizar Grupos de Destino / CT-e
  const container = document.getElementById('nfe-groups-container');
  if (!container) return;

  if (grupos.length === 0) {
    container.innerHTML = `
      <div style="background: #ffffff; padding: 2rem; text-align: center; border-radius: var(--radius-md); border: 1px solid var(--border-glass);">
        <p style="color: #64748b; margin: 0;">Nenhuma nota válida encontrada no lote.</p>
      </div>
    `;
    return;
  }

  let html = '';

  grupos.forEach((group, gIdx) => {
    const cidade = group.destino_cidade || group.cidade || '';
    const uf = group.destino_uf || group.uf || '';
    const rotaLabel = group.rota_label || `${cidade} / ${uf}`;
    const destFiscal = group.destinatario_fiscal_consolidado || {};
    const valorCarga = group.somatorio_valor_carga !== undefined ? group.somatorio_valor_carga : (group.valor_total_carga || 0);
    const pesoBruto = group.somatorio_peso_bruto !== undefined ? group.somatorio_peso_bruto : (group.peso_bruto_total || 0);
    const volumes = group.somatorio_volumes !== undefined ? group.somatorio_volumes : (group.volumes_total || 0);
    const nfes = group.nfes || [];
    const chaves = group.chaves_nfe || [];

    const isPF = group.regra_aplicada === 'PF_PARA_FILIAL' || (group.qtd_nfes_pf > 0 && group.qtd_nfes_pj === 0);
    const isPJ = group.regra_aplicada === 'PJ_DIRETO' || (group.qtd_nfes_pj > 0 && group.qtd_nfes_pf === 0);

    let routingBadgeHtml = '';
    if (isPF) {
      routingBadgeHtml = `
        <span class="badge-pf-routing" title="Todas as NF-es deste lote têm destinatários Pessoa Física. Pela regra de negócio, o CT-e é faturado para a Filial da Empresa na praça.">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Roteamento Fiscal: Cliente PF ➔ Tomador Fiscal: Filial da Praça
        </span>
      `;
    } else if (isPJ) {
      routingBadgeHtml = `
        <span class="badge-pj-direct" title="Destinatário Pessoa Jurídica (CNPJ). O CT-e é faturado diretamente ao destinatário PJ da NF-e.">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          Roteamento Fiscal: Cliente PJ ➔ Tomador Fiscal Direto (PJ)
        </span>
      `;
    } else {
      routingBadgeHtml = `
        <span class="badge-mixed-routing" title="Lote com destinos mistos. Roteamento consolidado para a Filial da praça.">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/></svg>
          Roteamento Fiscal Misto (PF + PJ) ➔ Faturamento Consolidado Filial
        </span>
      `;
    }

    const nfeRowsHtml = nfes.map((nfe, nIdx) => {
      const docDest = nfe.destinatario.documento || nfe.destinatario.cpf || nfe.destinatario.cnpj || '';
      const isDocPF = nfe.destinatario.is_pj === false || nfe.destinatario.tipo_documento === 'CPF' || docDest.length <= 14;
      const badgeDoc = isDocPF ? '<span class="badge-tag-pf">PF (CPF)</span>' : '<span class="badge-tag-pj">PJ (CNPJ)</span>';
      
      const valNota = (nfe.valores && nfe.valores.valor_total_nfe !== undefined) ? nfe.valores.valor_total_nfe : (nfe.totais && nfe.totais.valor_total_nfe) || 0;
      const valProds = (nfe.valores && nfe.valores.valor_produtos !== undefined) ? nfe.valores.valor_produtos : (nfe.totais && nfe.totais.valor_produtos) || 0;
      const pesoBrutoNfe = (nfe.carga && nfe.carga.peso_bruto !== undefined) ? nfe.carga.peso_bruto : (nfe.transporte && nfe.transporte.peso_bruto) || 0;
      const volumesNfe = (nfe.carga && nfe.carga.volumes !== undefined) ? nfe.carga.volumes : (nfe.transporte && nfe.transporte.quantidade_volumes) || 1;
      const end = nfe.destinatario.endereco || {};
      const ieDest = nfe.destinatario.ie || nfe.destinatario.inscricao_estadual || '';

      return `
        <tr>
          <td>
            <div style="font-weight: 700; color: #0f172a;">${nfe.numero} <span style="font-size: 0.7rem; color: #64748b;">(Série ${nfe.serie || '1'})</span></div>
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; color: #64748b; letter-spacing: -0.3px;">${nfe.chave_acesso ? nfe.chave_acesso.slice(0, 22) + '...' : '-'}</div>
          </td>
          <td style="white-space: nowrap;">
            ${nfe.data_emissao ? new Date(nfe.data_emissao).toLocaleDateString('pt-BR') : '-'}
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 2px;">
              ${badgeDoc}
              <span style="font-weight: 600; color: #1e293b;">${escapeHtml(nfe.destinatario.nome || 'Cliente')}</span>
            </div>
            <div style="font-size: 0.72rem; color: #475569; font-family: 'JetBrains Mono', monospace;">
              Doc: ${docDest || '-'} ${ieDest ? '| IE: ' + ieDest : ''}
            </div>
          </td>
          <td style="max-width: 220px; line-height: 1.25;">
            <div style="font-size: 0.75rem; color: #334155;">${escapeHtml(end.logradouro || '')}, ${escapeHtml(end.numero || 'S/N')}</div>
            <div style="font-size: 0.7rem; color: #64748b;">${escapeHtml(end.bairro || '')} - CEP: ${end.cep || '-'}</div>
          </td>
          <td style="font-weight: 700; color: #047857; text-align: right; white-space: nowrap;">
            ${fmtMoney(valNota)}
            <div style="font-size: 0.68rem; color: #64748b; font-weight: normal;">Prods: ${fmtMoney(valProds)}</div>
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <div style="font-weight: 700; color: #1e293b;">${fmtNumber(pesoBrutoNfe, 3)} kg</div>
            <div style="font-size: 0.68rem; color: #64748b;">${volumesNfe} vol(s)</div>
          </td>
          <td style="text-align: center; white-space: nowrap;">
            <div style="display: flex; gap: 0.35rem; justify-content: flex-end;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="openNFeDetailsModal(${gIdx}, ${nIdx})" title="Ver Itens e Tributos da NF-e" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;">
                🔍 Detalhes
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="copyNFeChave('${nfe.chave_acesso}')" title="Copiar Chave de 44 Dígitos" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;">
                📋 Chave
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    html += `
      <article class="nfe-group-card" id="nfe-group-card-${gIdx}">
        <!-- Group Header: Destination and Route identification -->
        <header class="nfe-group-header">
          <div class="nfe-group-title">
            <span class="nfe-route-badge">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              DESTINO: ${rotaLabel}
            </span>
            <span class="nfe-group-badge-count">${nfes.length} NF-e(s) Agrupada(s)</span>
          </div>
          <div>
            ${routingBadgeHtml}
          </div>
        </header>

        <!-- Fiscal Recipient Banner -->
        <div class="nfe-fiscal-recipient-box">
          <div>
            <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 2px;">
              Destinatário / Tomador Fiscal do CT-e (${isPF ? 'Filial da Empresa na Praça' : 'Destinatário PJ'})
            </div>
            <div style="font-size: 0.88rem; font-weight: 800; color: #0f172a;">
              ${escapeHtml(destFiscal.razao_social || 'FILIAL DA EMPRESA')}
            </div>
            <div style="font-size: 0.75rem; color: #475569; margin-top: 2px;">
              <strong>CNPJ:</strong> <span style="font-family: 'JetBrains Mono', monospace;">${destFiscal.cnpj || '-'}</span> | 
              <strong>IE:</strong> ${destFiscal.inscricao_estadual || 'ISENTO'} | 
              <strong>Endereço Fiscal:</strong> ${escapeHtml(destFiscal.endereco || '')}, ${escapeHtml(destFiscal.cidade || cidade)}/${destFiscal.uf || uf}
            </div>
          </div>
          <div style="text-align: right;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="copyGroupFiscalData(${gIdx})" title="Copiar Dados Fiscais deste Destino para Emissão" style="font-size: 0.75rem;">
              📋 Copiar Dados Fiscais
            </button>
          </div>
        </div>

        <!-- Consolidated Metrics Summary -->
        <div class="nfe-metrics-summary">
          <div class="nfe-summary-pill">
            <div class="nfe-summary-pill-label">Valor Total da Carga</div>
            <div class="nfe-summary-pill-value" style="color: #059669;">${fmtMoney(valorCarga)}</div>
          </div>
          <div class="nfe-summary-pill">
            <div class="nfe-summary-pill-label">Peso Bruto Acumulado</div>
            <div class="nfe-summary-pill-value" style="color: #2563eb;">${fmtNumber(pesoBruto, 3)} kg</div>
          </div>
          <div class="nfe-summary-pill">
            <div class="nfe-summary-pill-label">Quantidade de Volumes</div>
            <div class="nfe-summary-pill-value" style="color: #7c3aed;">${volumes} vol(s)</div>
          </div>
          <div class="nfe-summary-pill">
            <div class="nfe-summary-pill-label">Total NF-es Atreladas</div>
            <div class="nfe-summary-pill-value" style="color: #475569;">${nfes.length} nota(s)</div>
          </div>
        </div>

        <!-- Commodity Description Box for CT-e -->
        <div class="nfe-commodity-box">
          <div class="nfe-commodity-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            </svg>
          </div>
          <div style="flex: 1;">
            <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 700; color: #475569; margin-bottom: 2px;">
              Resumo da Mercadoria / Produto Predominante (Para Campo Descrição do CT-e)
            </div>
            <div class="nfe-commodity-text">
              ${escapeHtml(group.resumo_mercadoria || 'CARGA FRACIONADA DE MATERIAIS DIVERSOS')}
            </div>
          </div>
        </div>

        <!-- Triage Table of NF-es -->
        <div class="nfe-triage-container">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span style="font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase;">
              Notas Fiscais Vinculadas a Este Destino (${nfes.length})
            </span>
            <span style="font-size: 0.72rem; color: #64748b;">
              Visualização tabular limpa de conferência e triagem fiscal
            </span>
          </div>

          <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: var(--radius-sm);">
            <table class="nfe-triage-table">
              <thead>
                <tr>
                  <th>Nº / Série / Chave</th>
                  <th>Emissão</th>
                  <th>Destinatário</th>
                  <th>Endereço Físico de Entrega</th>
                  <th style="text-align: right;">Total Nota</th>
                  <th style="text-align: right;">Peso / Vol</th>
                  <th style="text-align: right;">Ações</th>
                </tr>
              </thead>
              <tbody>
                ${nfeRowsHtml}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Quick Action Toolbar Footer -->
        <footer class="nfe-group-footer">
          <div style="font-size: 0.78rem; color: #64748b;">
            Chaves NF-e: <strong>${chaves.length}</strong> chave(s) pronta(s) para atrelar ao CT-e.
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="copyGroupNFeKeys(${gIdx})" title="Copiar todas as chaves de 44 dígitos deste lote">
              🔑 Copiar Chaves NF-e
            </button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="copyGroupFiscalData(${gIdx})" title="Copiar resumo fiscal completo para a área de transferência">
              📋 Copiar Resumo Fiscal
            </button>
            <button type="button" class="btn btn-primary btn-sm" onclick="fillCTeFromNFeGroup(${gIdx})" title="Abrir formulário de CT-e preenchendo automaticamente rota, remetente, filial/PJ recebedora, peso, valor e chaves">
              ⚡ Preencher Formulário de CT-e
            </button>
          </div>
        </footer>
      </article>
    `;
  });

  container.innerHTML = html;
}

/**
 * Preencher Diretamente o Formulário de Emissão de CT-e com Dados do Grupo
 */
function fillCTeFromNFeGroup(groupIndex) {
  if (!currentNFeBatchData) {
    showToast('Lote de NF-e não encontrado.', 'error');
    return;
  }

  const grupos = currentNFeBatchData.grupos_cte || currentNFeBatchData.grupos || [];
  const group = grupos[groupIndex];
  if (!group) {
    showToast('Grupo de CT-e não encontrado.', 'error');
    return;
  }

  // Open manual trip modal
  openManualTripModal();

  // Ensure CT-e mode
  setManualTripType('CT-e');

  const cidade = group.destino_cidade || group.cidade || '';
  const uf = group.destino_uf || group.uf || '';
  const destFiscal = group.destinatario_fiscal_consolidado || {};
  const valorCarga = group.somatorio_valor_carga !== undefined ? group.somatorio_valor_carga : (group.valor_total_carga || 0);
  const pesoBruto = group.somatorio_peso_bruto !== undefined ? group.somatorio_peso_bruto : (group.peso_bruto_total || 0);
  const volumes = group.somatorio_volumes !== undefined ? group.somatorio_volumes : (group.volumes_total || 0);
  const chaves = group.chaves_nfe || [];

  // Fill destination & origin
  const cidadeDestino = document.getElementById('manual-trip-cidade-destino');
  if (cidadeDestino) cidadeDestino.value = cidade;
  const ufDestino = document.getElementById('manual-trip-uf-destino');
  if (ufDestino) ufDestino.value = uf;

  const cidadeOrigem = document.getElementById('manual-trip-cidade-origem');
  if (cidadeOrigem && !cidadeOrigem.value) cidadeOrigem.value = 'MACEIO';
  const ufOrigem = document.getElementById('manual-trip-uf-origem');
  if (ufOrigem && !ufOrigem.value) ufOrigem.value = 'AL';

  // Fill Emitter (Carajás Matriz)
  const remetenteNome = document.getElementById('manual-trip-remetente-nome');
  if (remetenteNome) remetenteNome.value = (group.remetente && group.remetente.nome) || 'CARAJAS MATERIAL DE CONSTRUCAO LTDA';
  const remetenteCnpj = document.getElementById('manual-trip-remetente-cnpj');
  if (remetenteCnpj) remetenteCnpj.value = (group.remetente && group.remetente.documento) || '03.656.804/0001-31';

  // Fill Recipient (Consolidated Branch or Direct PJ)
  const destNome = document.getElementById('manual-trip-destinatario-nome');
  if (destNome) destNome.value = destFiscal.razao_social || 'CARAJAS - FILIAL';
  const destCnpj = document.getElementById('manual-trip-destinatario-cnpj');
  if (destCnpj) destCnpj.value = destFiscal.cnpj || '03.656.804/0002-12';

  // Fill Cargo Value, Gross Weight, Volumes, Description and Keys
  const cargaInput = document.getElementById('manual-trip-carga-cte');
  if (cargaInput) cargaInput.value = Number(valorCarga).toFixed(2);

  const pesoInput = document.getElementById('manual-trip-peso-cte');
  if (pesoInput) pesoInput.value = Number(pesoBruto).toFixed(3);

  const volInput = document.getElementById('manual-trip-volumes-cte');
  if (volInput) volInput.value = volumes;

  const prodInput = document.getElementById('manual-trip-produto-predominante');
  if (prodInput) prodInput.value = group.produto_predominante || group.resumo_mercadoria || 'MATERIAIS DE CONSTRUCAO';

  const keysInput = document.getElementById('manual-trip-chaves-nfe');
  if (keysInput) keysInput.value = chaves.join('\n');

  // Suggest a realistic freight based on weight/cargo or default percentage
  const freteInput = document.getElementById('manual-trip-frete');
  if (freteInput && (!freteInput.value || parseFloat(freteInput.value) === 0)) {
    const suggestedFreight = Math.max(1200, Math.round(Number(pesoBruto) * 0.48 * 100) / 100);
    freteInput.value = suggestedFreight.toFixed(2);
    updateManualCommissionPreview();
  }

  showToast(`Formulário de CT-e preenchido para ${cidade}/${uf} com sucesso!`, 'success');
}

/**
 * Copiar Dados Fiscais Consolidados de um Grupo para o Clipboard
 */
function copyGroupFiscalData(groupIndex) {
  if (!currentNFeBatchData) return;
  const grupos = currentNFeBatchData.grupos_cte || currentNFeBatchData.grupos || [];
  const group = grupos[groupIndex];
  if (!group) return;

  const cidade = group.destino_cidade || group.cidade || '';
  const uf = group.destino_uf || group.uf || '';
  const destFiscal = group.destinatario_fiscal_consolidado || {};
  const valorCarga = group.somatorio_valor_carga !== undefined ? group.somatorio_valor_carga : (group.valor_total_carga || 0);
  const pesoBruto = group.somatorio_peso_bruto !== undefined ? group.somatorio_peso_bruto : (group.peso_bruto_total || 0);
  const volumes = group.somatorio_volumes !== undefined ? group.somatorio_volumes : (group.volumes_total || 0);
  const chaves = group.chaves_nfe || [];

  const text = [
    `=== DADOS FISCAIS CONSOLIDADOS PARA EMISSÃO DE CT-E ===`,
    `ROTA / DESTINO: ${cidade} / ${uf}`,
    `DESTINATÁRIO FISCAL: ${destFiscal.razao_social || '-'}`,
    `CNPJ DESTINATÁRIO: ${destFiscal.cnpj || '-'}`,
    `INSCRIÇÃO ESTADUAL: ${destFiscal.inscricao_estadual || 'ISENTO'}`,
    `ENDEREÇO FISCAL: ${destFiscal.endereco || '-'}, ${destFiscal.cidade || cidade}/${destFiscal.uf || uf} - CEP: ${destFiscal.cep || '-'}`,
    `VALOR TOTAL DA CARGA: R$ ${Number(valorCarga).toFixed(2)}`,
    `PESO BRUTO TOTAL: ${Number(pesoBruto).toFixed(3)} KG`,
    `VOLUMES: ${volumes}`,
    `PRODUTO PREDOMINANTE: ${group.resumo_mercadoria || 'CARGA FRACIONADA'}`,
    `QUANTIDADE DE NF-ES: ${(group.nfes || []).length}`,
    `CHAVES DAS NF-ES:`,
    ...chaves
  ].join('\n');

  navigator.clipboard.writeText(text).then(() => {
    showToast(`Dados fiscais de ${cidade}/${uf} copiados para a área de transferência!`, 'success');
  }).catch(() => {
    showToast('Falha ao copiar para a área de transferência.', 'error');
  });
}

/**
 * Copiar Chaves de NF-e do Grupo
 */
function copyGroupNFeKeys(groupIndex) {
  if (!currentNFeBatchData) return;
  const grupos = currentNFeBatchData.grupos_cte || currentNFeBatchData.grupos || [];
  const group = grupos[groupIndex];
  if (!group) return;

  const chaves = group.chaves_nfe || [];
  const keysText = chaves.join('\n');

  navigator.clipboard.writeText(keysText).then(() => {
    showToast(`${chaves.length} chave(s) de NF-e copiada(s)!`, 'success');
  }).catch(() => {
    showToast('Falha ao copiar chaves.', 'error');
  });
}

/**
 * Copiar Chave Individual de uma NF-e
 */
function copyNFeChave(chave) {
  if (!chave) return;
  navigator.clipboard.writeText(chave).then(() => {
    showToast('Chave NF-e copiada para a área de transferência!', 'info');
  }).catch(() => {
    showToast('Falha ao copiar chave.', 'error');
  });
}

/**
 * Exportar Triagem e Lotes em Planilha Excel
 */
async function exportNFeBatchExcel() {
  if (!currentNFeBatchData) {
    showToast('Nenhum lote processado para exportação.', 'warning');
    return;
  }

  const btn = document.getElementById('btn-nfe-export-excel');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Gerando Excel...</span>';
  }

  try {
    const res = await fetch('/api/nfe/export-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchData: currentNFeBatchData })
    });

    if (!res.ok) throw new Error('Falha ao gerar planilha Excel.');

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    a.download = `Lotes_NFe_CTe_Roteamento_${timestamp}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();

    showToast('Planilha Excel de triagem e lotes de CT-e baixada com sucesso!', 'success');
  } catch (err) {
    console.error('Erro na exportação Excel:', err);
    showToast('Erro ao exportar Excel: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

/**
 * Modal: Gerenciador de Filiais da Empresa
 */
async function openBranchesModal() {
  openModal('modal-branches-manager');
  await loadBranchesList();
}

async function loadBranchesList() {
  try {
    const res = await fetch('/api/branches');
    const data = await res.json();
    if (data.success) {
      cachedCompanyBranches = data.items || data.data || [];
      renderBranchesTable(cachedCompanyBranches);
    }
  } catch (err) {
    console.error('Erro ao listar filiais:', err);
    showToast('Erro ao carregar lista de filiais.', 'error');
  }
}

function renderBranchesTable(branches) {
  const tbody = document.getElementById('table-branches-tbody');
  const badge = document.getElementById('branch-count-badge');
  if (badge) badge.textContent = branches.length;
  if (!tbody) return;

  if (branches.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 1.5rem;">Nenhuma filial cadastrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = branches.map(b => `
    <tr>
      <td style="font-weight: 700; color: #1e293b;">
        ${escapeHtml(b.nome_filial || b.razao_social || 'Filial')}
        ${b.nome_fantasia ? `<div style="font-size: 0.7rem; color: #64748b;">${escapeHtml(b.nome_fantasia)}</div>` : ''}
      </td>
      <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.75rem;">${b.cnpj}</td>
      <td>${b.inscricao_estadual || 'ISENTO'}</td>
      <td><span style="font-weight: 700; color: #2563eb;">${escapeHtml(b.cidade)} / ${b.uf}</span></td>
      <td style="font-size: 0.72rem; color: #64748b;">
        ${escapeHtml(b.logradouro || '')} ${b.numero || ''} ${b.bairro ? '- ' + escapeHtml(b.bairro) : ''}
      </td>
    </tr>
  `).join('');
}

function filterBranchesList() {
  const q = (document.getElementById('branch-search-input')?.value || '').toLowerCase().trim();
  if (!q) {
    renderBranchesTable(cachedCompanyBranches);
    return;
  }
  const filtered = cachedCompanyBranches.filter(b => 
    ((b.nome_filial || b.razao_social) && (b.nome_filial || b.razao_social).toLowerCase().includes(q)) ||
    (b.cidade && b.cidade.toLowerCase().includes(q)) ||
    (b.cnpj && b.cnpj.includes(q)) ||
    (b.uf && b.uf.toLowerCase().includes(q))
  );
  renderBranchesTable(filtered);
}

async function handleSaveBranch(e) {
  e.preventDefault();
  const body = {
    nome_filial: document.getElementById('branch-razao-social').value,
    razao_social: document.getElementById('branch-razao-social').value,
    cnpj: document.getElementById('branch-cnpj').value,
    inscricao_estadual: document.getElementById('branch-ie').value,
    cidade: document.getElementById('branch-cidade').value,
    uf: document.getElementById('branch-uf').value.toUpperCase(),
    logradouro: document.getElementById('branch-endereco').value,
    cep: document.getElementById('branch-cep').value
  };

  try {
    const res = await fetch('/api/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Erro ao salvar filial.');

    showToast('Filial cadastrada com sucesso!', 'success');
    document.getElementById('form-new-branch').reset();
    const details = document.getElementById('details-new-branch');
    if (details) details.removeAttribute('open');
    await loadBranchesList();
  } catch (err) {
    showToast('Erro ao salvar filial: ' + err.message, 'error');
  }
}

/**
 * Modal: Detalhes Completos de uma NF-e
 */
function openNFeDetailsModal(groupIndex, nfeIndex) {
  if (!currentNFeBatchData) return;
  const grupos = currentNFeBatchData.grupos_cte || currentNFeBatchData.grupos || [];
  const group = grupos[groupIndex];
  if (!group || !group.nfes || !group.nfes[nfeIndex]) return;

  const nfe = group.nfes[nfeIndex];

  const fmtMoney = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const fmtNumber = (v, dec = 0) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  const titleEl = document.getElementById('nfe-detail-title');
  if (titleEl) titleEl.textContent = `NF-e Nº ${nfe.numero} - Série ${nfe.serie || '1'}`;

  const chaveEl = document.getElementById('nfe-detail-chave-badge');
  if (chaveEl) chaveEl.textContent = `Chave de Acesso: ${nfe.chave_acesso || 'Sem chave'}`;

  const btnCopy = document.getElementById('btn-copy-modal-nfe-chave');
  if (btnCopy) {
    btnCopy.onclick = () => copyNFeChave(nfe.chave_acesso);
  }

  const docDest = nfe.destinatario.documento || nfe.destinatario.cpf || nfe.destinatario.cnpj || '';
  const isPF = nfe.destinatario.is_pj === false || nfe.destinatario.tipo_documento === 'CPF' || docDest.length <= 14;
  const valNota = (nfe.valores && nfe.valores.valor_total_nfe !== undefined) ? nfe.valores.valor_total_nfe : (nfe.totais && nfe.totais.valor_total_nfe) || 0;
  const valProds = (nfe.valores && nfe.valores.valor_produtos !== undefined) ? nfe.valores.valor_produtos : (nfe.totais && nfe.totais.valor_produtos) || 0;
  const pesoBrutoNfe = (nfe.carga && nfe.carga.peso_bruto !== undefined) ? nfe.carga.peso_bruto : (nfe.transporte && nfe.transporte.peso_bruto) || 0;
  const volumesNfe = (nfe.carga && nfe.carga.volumes !== undefined) ? nfe.carga.volumes : (nfe.transporte && nfe.transporte.quantidade_volumes) || 1;
  const endDest = nfe.destinatario.endereco || {};

  const bodyEl = document.getElementById('nfe-detail-body');
  if (bodyEl) {
    const itemsHtml = (nfe.itens || []).map(it => `
      <tr>
        <td style="text-align: center; color: #64748b;">${it.numero_item}</td>
        <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.72rem;">${it.codigo_produto || '-'}</td>
        <td style="font-weight: 600; color: #1e293b;">${escapeHtml(it.descricao)}</td>
        <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.72rem;">${it.ncm || '-'}</td>
        <td style="text-align: center;">${it.unidade}</td>
        <td style="text-align: right; font-weight: 700;">${fmtNumber(it.quantidade, 2)}</td>
        <td style="text-align: right;">${fmtMoney(it.valor_unitario)}</td>
        <td style="text-align: right; font-weight: 700; color: #047857;">${fmtMoney(it.valor_total)}</td>
      </tr>
    `).join('');

    bodyEl.innerHTML = `
      <!-- Dados de Identificação e Roteamento -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); padding: 0.75rem;">
          <div style="font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase;">Emitente da NF-e</div>
          <div style="font-weight: 700; font-size: 0.85rem; color: #1e293b; margin-top: 2px;">${escapeHtml(nfe.emitente.nome || 'CARAJAS')}</div>
          <div style="font-size: 0.75rem; color: #475569; margin-top: 2px;">CNPJ: ${nfe.emitente.documento} | IE: ${nfe.emitente.ie || 'ISENTO'}</div>
          <div style="font-size: 0.72rem; color: #64748b;">${escapeHtml(nfe.emitente.cidade || '')} / ${nfe.emitente.uf || ''}</div>
        </div>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); padding: 0.75rem;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase;">Destinatário da NF-e</div>
            <span class="${isPF ? 'badge-tag-pf' : 'badge-tag-pj'}">${isPF ? 'Pessoa Física (PF)' : 'Pessoa Jurídica (PJ)'}</span>
          </div>
          <div style="font-weight: 700; font-size: 0.85rem; color: #1e293b; margin-top: 2px;">${escapeHtml(nfe.destinatario.nome)}</div>
          <div style="font-size: 0.75rem; color: #475569; margin-top: 2px;">${isPF ? 'CPF' : 'CNPJ'}: ${docDest}</div>
          <div style="font-size: 0.72rem; color: #64748b;">
            ${escapeHtml(endDest.logradouro || '')}, ${escapeHtml(endDest.numero || 'S/N')} - ${escapeHtml(endDest.bairro || '')}<br>
            <strong>${escapeHtml(endDest.cidade || '')} / ${escapeHtml(endDest.uf || '')}</strong> - CEP: ${endDest.cep || '-'}
          </div>
        </div>
      </div>

      <!-- Resumo dos Valores e Carga -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; text-align: center;">
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: var(--radius-sm); padding: 0.5rem;">
          <div style="font-size: 0.68rem; color: #1e40af; font-weight: 700;">VALOR TOTAL NOTA</div>
          <div style="font-size: 1.05rem; font-weight: 800; color: #1e3a8a;">${fmtMoney(valNota)}</div>
        </div>
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: var(--radius-sm); padding: 0.5rem;">
          <div style="font-size: 0.68rem; color: #065f46; font-weight: 700;">VALOR PRODUTOS</div>
          <div style="font-size: 1.05rem; font-weight: 800; color: #047857;">${fmtMoney(valProds)}</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); padding: 0.5rem;">
          <div style="font-size: 0.68rem; color: #64748b; font-weight: 700;">PESO BRUTO</div>
          <div style="font-size: 1.05rem; font-weight: 800; color: #0f172a;">${fmtNumber(pesoBrutoNfe, 3)} kg</div>
        </div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); padding: 0.5rem;">
          <div style="font-size: 0.68rem; color: #64748b; font-weight: 700;">VOLUMES</div>
          <div style="font-size: 1.05rem; font-weight: 800; color: #0f172a;">${volumesNfe}</div>
        </div>
      </div>

      <!-- Tabela de Itens e Produtos -->
      <div>
        <div style="font-size: 0.75rem; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 0.35rem;">
          Produtos / Mercadorias (${(nfe.itens || []).length} itens)
        </div>
        <div style="max-height: 240px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: var(--radius-sm);">
          <table class="data-table" style="font-size: 0.75rem; margin: 0;">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">#</th>
                <th>Código</th>
                <th>Descrição do Produto</th>
                <th>NCM</th>
                <th style="text-align: center;">UN</th>
                <th style="text-align: right;">Qtd</th>
                <th style="text-align: right;">Unitário</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  openModal('modal-nfe-details');
}

// Funções do Leitor de NF-e e Roteador de Cargas para CT-e
window.setupNFeDropzone = setupNFeDropzone;
window.uploadNFeBatch = uploadNFeBatch;
window.loadNFeSampleBatch = loadNFeSampleBatch;
window.clearNFeProcessor = clearNFeProcessor;
window.renderNFeBatchView = renderNFeBatchView;
window.fillCTeFromNFeGroup = fillCTeFromNFeGroup;
window.copyGroupFiscalData = copyGroupFiscalData;
window.copyGroupNFeKeys = copyGroupNFeKeys;
window.copyNFeChave = copyNFeChave;
window.exportNFeBatchExcel = exportNFeBatchExcel;
window.openBranchesModal = openBranchesModal;
window.loadBranchesList = loadBranchesList;
window.renderBranchesTable = renderBranchesTable;
window.filterBranchesList = filterBranchesList;
window.handleSaveBranch = handleSaveBranch;
window.openNFeDetailsModal = openNFeDetailsModal;



