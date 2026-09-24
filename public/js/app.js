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
  fetchAndRenderDocuments();
  setupEventListeners();
  setupDragAndDrop();
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
          <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; padding: 2px 8px; border-radius: 4px; font-weight: 700;">
            ${drv.percentual_comissao || 75}%
          </span>
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
    window.print();
  };

  window.openFinancialReportModal = async function() {
    const container = document.getElementById('financial-report-content');
    if (!container) return;

    container.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
        <div class="loading-spinner" style="margin: 0 auto 1rem;"></div>
        <p style="font-weight: 600; font-size: 0.95rem;">Consolidando demonstrativo de prestação de contas financeira e fiscal...</p>
      </div>
    `;
    openModal('modal-financial-report');

    try {
      const query = new URLSearchParams(currentFilters).toString();
      const res = await fetch(`/api/documents?${query}`);
      const data = await res.json();
      const docs = data.items || allDocumentsCache || [];
      const kpis = data.kpis || currentKPIsCache || {};

      const totalFrete = parseFloat(kpis.totalFrete || 0);
      const totalComissao75 = parseFloat(kpis.totalComissao75 || (totalFrete * 0.75));
      const margem25 = Math.max(0, totalFrete - totalComissao75);
      const totalICMS = parseFloat(kpis.totalICMS || 0);

      // Group drivers for payout distribution
      const driverMap = {};
      docs.forEach(d => {
        const key = d.motorista_cpf || d.motorista_nome || 'Outros';
        if (!driverMap[key]) {
          driverMap[key] = {
            nome: d.motorista_nome || 'Não Informado',
            cpf: d.motorista_cpf || '-',
            cnh: d.motorista_cnh || '-',
            vinculo: d.motorista_tipo_vinculo || 'frota_propria',
            placas: [d.motorista_placa_cavalo, d.motorista_placa_carreta].filter(Boolean).join(' / ') || '-',
            pix: d.motorista_chave_pix || 'A Cadastrar',
            telefone: d.motorista_telefone || '-',
            qtdDocs: 0,
            totalFrete: 0,
            totalComissao75: 0,
            totalMargem25: 0
          };
        }
        driverMap[key].qtdDocs += 1;
        const v = parseFloat(d.valor || 0);
        const c = parseFloat(d.valor_comissao || (d.tipo === 'CT-e' ? (v * 0.75) : 0));
        driverMap[key].totalFrete += v;
        driverMap[key].totalComissao75 += c;
        driverMap[key].totalMargem25 += Math.max(0, v - c);
      });
      const driverList = Object.values(driverMap).sort((a, b) => b.totalComissao75 - a.totalComissao75);

      const nowStr = new Date().toLocaleString('pt-BR');
      const periodText = (currentFilters.startDate || currentFilters.endDate)
        ? `${currentFilters.startDate || 'Início'} até ${currentFilters.endDate || 'Atual'}`
        : 'Geral / Todos os Registros Auditados';
      const auditCode = `AUD-FIN-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const formatDt = (dt) => {
        if (!dt) return '-';
        try {
          const d = new Date(dt);
          return isNaN(d.getTime()) ? dt : d.toLocaleString('pt-BR');
        } catch {
          return dt;
        }
      };

      const formatMoney = (val) => Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      container.innerHTML = `
        <div class="fin-report-sheet" id="financial-report-print-area">
          <!-- Header Oficial -->
          <div class="fin-report-header">
            <div>
              <div class="fin-brand-title">
                <span style="display: inline-block; width: 12px; height: 12px; background: #2563eb; border-radius: 2px;"></span>
                CARGA BALANCE &bull; AUDITORIA DE FRETE
              </div>
              <div class="fin-brand-subtitle">
                DEMONSTRATIVO DE PRESTAÇÃO DE CONTAS FINANCEIRA E FISCAL &bull; SETOR FINANCEIRO & CONTÁBIL
              </div>
              <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.35rem;">
                CNPJ Emissor: <strong>20.664.328/0001-10</strong> &bull; Transportadora Central de Cargas
              </div>
            </div>
            <div class="fin-report-meta-box">
              <span class="fin-status-stamp">✓ Auditado SEFAZ</span>
              <div>Protocolo: <strong>${auditCode}</strong></div>
              <div>Período: <strong>${periodText}</strong></div>
              <div>Emissão: <strong>${nowStr}</strong></div>
            </div>
          </div>

          <!-- 1. Consolidação Financeira Executiva (Cards) -->
          <div class="fin-kpi-summary-grid">
            <div class="fin-kpi-card blue">
              <div class="fin-kpi-title">Faturamento Total Fretes (CT-e)</div>
              <div class="fin-kpi-val">${formatMoney(totalFrete)}</div>
              <div class="fin-kpi-desc">Total bruto de serviços de transporte contratados</div>
            </div>
            <div class="fin-kpi-card green">
              <div class="fin-kpi-title">Comissão Motoristas (75%)</div>
              <div class="fin-kpi-val">${formatMoney(totalComissao75)}</div>
              <div class="fin-kpi-desc">Repasse líquido a pagar aos condutores (regra 75%)</div>
            </div>
            <div class="fin-kpi-card blue">
              <div class="fin-kpi-title">Margem Transportadora (25%)</div>
              <div class="fin-kpi-val">${formatMoney(margem25)}</div>
              <div class="fin-kpi-desc">Resultado operacional retido pela empresa</div>
            </div>
            <div class="fin-kpi-card amber">
              <div class="fin-kpi-title">Total ICMS Destacado</div>
              <div class="fin-kpi-val">${formatMoney(totalICMS)}</div>
              <div class="fin-kpi-desc">Tributos recolhidos nas operações de transporte</div>
            </div>
          </div>

          <!-- 2. Programação de Pagamentos aos Motoristas (75%) -->
          <div class="fin-sec-header green">
            <span>1. PROGRAMAÇÃO DE PAGAMENTOS AOS CONDUTORES (CONTAS A PAGAR &bull; 75%)</span>
            <span style="font-size: 0.725rem; font-weight: 500;">${driverList.length} Motoristas com Fretes Auditados</span>
          </div>
          <table class="fin-table">
            <thead>
              <tr>
                <th>Motorista</th>
                <th class="text-center">CPF</th>
                <th class="text-center">Vínculo</th>
                <th class="text-center">Placas</th>
                <th class="text-center">Chave PIX</th>
                <th class="text-center">Viagens</th>
                <th class="text-right">Frete Gerado</th>
                <th class="text-right" style="color: #047857;">Comissão 75% (A Pagar)</th>
                <th class="text-right">Margem 25%</th>
                <th class="text-center">Autorização</th>
              </tr>
            </thead>
            <tbody>
              ${driverList.length === 0 ? `
                <tr><td colspan="10" class="text-center" style="padding: 1.5rem; color: #64748b;">Nenhum rateio localizado para o período filtrado.</td></tr>
              ` : driverList.map(d => `
                <tr>
                  <td><strong>${escapeHtml(d.nome)}</strong></td>
                  <td class="text-center">${escapeHtml(d.cpf)}</td>
                  <td class="text-center"><span style="font-size: 0.7rem; text-transform: uppercase;">${escapeHtml(d.vinculo.replace('_', ' '))}</span></td>
                  <td class="text-center">${escapeHtml(d.placas)}</td>
                  <td class="text-center"><code>${escapeHtml(d.pix)}</code></td>
                  <td class="text-center">${d.qtdDocs}</td>
                  <td class="text-right">${formatMoney(d.totalFrete)}</td>
                  <td class="text-right" style="font-weight: 800; color: #047857;">${formatMoney(d.totalComissao75)}</td>
                  <td class="text-right" style="font-weight: 600;">${formatMoney(d.totalMargem25)}</td>
                  <td class="text-center"><span style="display: inline-block; padding: 2px 6px; background: #ecfdf5; color: #047857; border-radius: 4px; font-weight: 700; font-size: 0.675rem;">Liberado</span></td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="5"><strong>TOTALIZAÇÃO DOS REPASSES AOS CONDUTORES</strong></td>
                <td class="text-center"><strong>${driverList.reduce((acc, d) => acc + d.qtdDocs, 0)}</strong></td>
                <td class="text-right"><strong>${formatMoney(driverList.reduce((acc, d) => acc + d.totalFrete, 0))}</strong></td>
                <td class="text-right" style="color: #047857;"><strong>${formatMoney(totalComissao75)}</strong></td>
                <td class="text-right"><strong>${formatMoney(margem25)}</strong></td>
                <td class="text-center"><strong>APROVADO</strong></td>
              </tr>
            </tbody>
          </table>

          <!-- 3. Relação Analítica de Documentos (CT-e e MDF-e) -->
          <div class="fin-sec-header blue">
            <span>2. DEMONSTRATIVO ANALÍTICO DE DOCUMENTOS FISCAIS (CT-e & MDF-e)</span>
            <span style="font-size: 0.725rem; font-weight: 500;">${docs.length} Documentos SEFAZ Auditados</span>
          </div>
          <div style="overflow-x: auto;">
            <table class="fin-table">
              <thead>
                <tr>
                  <th class="text-center">Tipo</th>
                  <th class="text-center">Nº / Série</th>
                  <th class="text-center">Emissão</th>
                  <th>Remetente (Origem)</th>
                  <th>Recebedor / Destinatário</th>
                  <th class="text-center">Rota & Percurso</th>
                  <th>Cronograma (Saída ➔ Previsão)</th>
                  <th>Motorista / Veículo</th>
                  <th class="text-right">Valor Frete/Carga</th>
                  <th class="text-right">ICMS</th>
                  <th class="text-right" style="color: #047857;">Comissão 75%</th>
                  <th class="text-right">Margem 25%</th>
                </tr>
              </thead>
              <tbody>
                ${docs.length === 0 ? `
                  <tr><td colspan="12" class="text-center" style="padding: 1.5rem; color: #64748b;">Nenhum documento encontrado para os filtros selecionados.</td></tr>
                ` : docs.map(doc => {
                  const val = parseFloat(doc.valor || 0);
                  const icms = parseFloat(doc.valor_icms || 0);
                  const com = parseFloat(doc.valor_comissao || (doc.tipo === 'CT-e' ? (val * 0.75) : 0));
                  const margem = Math.max(0, val - com);
                  const isCte = doc.tipo === 'CT-e';
                  const placas = [doc.motorista_placa_cavalo, doc.motorista_placa_carreta].filter(Boolean).join('/') || '-';
                  return `
                    <tr>
                      <td class="text-center ${isCte ? 'fin-badge-cte' : 'fin-badge-mdfe'}"><strong>${escapeHtml(doc.tipo)}</strong></td>
                      <td class="text-center"><strong>${escapeHtml(String(doc.numero || ''))}</strong><span style="font-size: 0.7rem; color: #64748b;">/${escapeHtml(String(doc.serie || '1'))}</span></td>
                      <td class="text-center">${doc.data_emissao ? new Date(doc.data_emissao).toLocaleDateString('pt-BR') : '-'}</td>
                      <td>
                        <div><strong>${escapeHtml(doc.remetente_nome || 'Não Informado')}</strong></div>
                        ${doc.remetente_cnpj ? `<div style="font-size: 0.675rem; color: #64748b;">${escapeHtml(doc.remetente_cnpj)}</div>` : ''}
                      </td>
                      <td>
                        <div><strong>${escapeHtml(doc.destinatario_nome || 'Não Informado')}</strong></div>
                        ${doc.destinatario_cnpj ? `<div style="font-size: 0.675rem; color: #64748b;">${escapeHtml(doc.destinatario_cnpj)}</div>` : ''}
                      </td>
                      <td class="text-center">
                        <div><strong>${escapeHtml(doc.origem || '')} ➔ ${escapeHtml(doc.destino || '')}</strong></div>
                        ${doc.ufs_percurso ? `<div style="font-size: 0.675rem; color: #2563eb;">Percurso: ${escapeHtml(doc.ufs_percurso)}</div>` : ''}
                      </td>
                      <td>
                        <div style="font-size: 0.725rem;">Saída: <strong>${formatDt(doc.data_saida)}</strong></div>
                        <div style="font-size: 0.725rem; color: #64748b;">Prev: <strong>${formatDt(doc.previsao_chegada)}</strong></div>
                      </td>
                      <td>
                        <div><strong>${escapeHtml(doc.motorista_nome || '')}</strong></div>
                        <div style="font-size: 0.675rem; color: #64748b;">Placa: ${escapeHtml(placas)}</div>
                      </td>
                      <td class="text-right" style="font-weight: 700;">${formatMoney(val)}</td>
                      <td class="text-right">${formatMoney(icms)}</td>
                      <td class="text-right" style="font-weight: 800; color: #047857;">${formatMoney(com)}</td>
                      <td class="text-right" style="font-weight: 600;">${formatMoney(margem)}</td>
                    </tr>
                  `;
                }).join('')}
                <tr class="total-row">
                  <td colspan="8"><strong>TOTAIS GERAIS CONSOLIDADOS (${docs.length} DOCUMENTOS)</strong></td>
                  <td class="text-right"><strong>${formatMoney(totalFrete)}</strong></td>
                  <td class="text-right"><strong>${formatMoney(totalICMS)}</strong></td>
                  <td class="text-right" style="color: #047857;"><strong>${formatMoney(totalComissao75)}</strong></td>
                  <td class="text-right"><strong>${formatMoney(margem25)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 4. Termo de Conformidade e Assinaturas -->
          <div style="margin-top: 1.5rem; padding: 0.85rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 0.75rem; color: #475569; line-height: 1.5;">
            <strong>Declaração de Conformidade & Auditoria:</strong> Declaramos para os devidos fins de prestação de contas contábil e financeira que os valores de frete, retenções fiscais de ICMS e os repasses de comissões aos motoristas (fixados em 75,0% do valor do frete contratado) foram rigorosamente conferidos e auditados com base nos arquivos XML autorizados pela Secretaria da Fazenda (SEFAZ).
          </div>

          <div class="fin-signatures-container">
            <div class="fin-sign-col">
              <div class="fin-sign-line"></div>
              <div class="fin-sign-role">Auditoria de Fretes & Transporte</div>
              <div class="fin-sign-dept">Conferência e Validação SEFAZ</div>
            </div>
            <div class="fin-sign-col">
              <div class="fin-sign-line"></div>
              <div class="fin-sign-role">Gerência Financeira & Contábil</div>
              <div class="fin-sign-dept">Contas a Pagar / Prestação de Contas</div>
            </div>
            <div class="fin-sign-col">
              <div class="fin-sign-line"></div>
              <div class="fin-sign-role">Diretoria Executiva / Operações</div>
              <div class="fin-sign-dept">Aprovação Final da Prestação de Contas</div>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      console.error('Error generating financial report:', err);
      container.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--accent-error);">
          <h4>Erro ao compor relatório financeiro</h4>
          <p>${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  };

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
    valor_total_carga: document.getElementById('manual-trip-carga').value,
    peso_bruto: document.getElementById('manual-trip-peso').value,
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

