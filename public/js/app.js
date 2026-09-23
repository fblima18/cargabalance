/**
 * CARGABALANCE // Frontend Application Logic
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
  interstateOnly: false
};

let allDriversCache = [];
let allDocumentsCache = [];

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initDateDefaults();
  initTabs();
  loadDrivers();
  fetchAndRenderDocuments();
  setupEventListeners();
  setupDragAndDrop();
});

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

/**
 * Render dynamic KPI cards
 */
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
}

/**
 * Render Overview Table
 */
function renderTable(items) {
  const tableBody = document.getElementById('documents-table-body');
  if (!items || items.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="12" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          Nenhum documento encontrado para os filtros selecionados.
        </td>
      </tr>
    `;
    return;
  }

  const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const formatDate = (str) => str ? new Date(str).toLocaleDateString('pt-BR') : '-';

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
        <td style="font-weight: 700;">${doc.numero}</td>
        <td>${doc.serie}</td>
        <td>${formatDate(doc.data_emissao)}</td>
        <td style="font-weight: 600;">${doc.motorista_nome}</td>
        <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.775rem;">${doc.motorista_cpf}</td>
        <td>
          <span style="font-weight: 600;">${doc.destino}</span>
          ${doc.origem ? `<br><small style="color: var(--text-muted);">${doc.origem}</small>` : ''}
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
        <td style="text-align: center;">
          <div class="action-buttons" style="justify-content: center;">
            <button class="icon-btn" title="Visualizar DACTE / DAMDFE" onclick="openDocPreview('${cleanKey}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            <button class="icon-btn" title="Baixar XML Original" onclick="downloadOriginalXML('${cleanKey}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            <button class="icon-btn" title="Ver Metadados" onclick="openDocDetails('${cleanKey}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </button>
          </div>
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
  tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 2rem;">Carregando CT-es...</td></tr>`;

  try {
    const res = await fetch('/api/documents?docType=cte');
    const data = await res.json();
    const ctes = data.items || [];

    document.getElementById('cte-results-count').textContent = `${ctes.length} CT-es encontrados`;

    if (ctes.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 3rem; color: var(--text-muted);">Nenhum CT-e registrado.</td></tr>`;
      return;
    }

    const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
    const formatDate = (str) => str ? new Date(str).toLocaleDateString('pt-BR') : '-';

    tableBody.innerHTML = ctes.map((c) => {
      const cleanKey = String(c.chave_acesso).replace(/\D/g, '');
      return `
        <tr>
          <td style="font-weight: 700; color: #38bdf8;">${c.numero}</td>
          <td>${c.serie}</td>
          <td>${formatDate(c.data_emissao)}</td>
          <td style="font-weight: 600;">${c.motorista_nome}</td>
          <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.775rem;">${c.motorista_cpf}</td>
          <td>${c.origem}</td>
          <td style="font-weight: 600;">${c.destino}</td>
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
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
              <button class="icon-btn" title="Baixar XML Original" onclick="downloadOriginalXML('${cleanKey}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--accent-rose); padding: 2rem;">Erro: ${err.message}</td></tr>`;
  }
}

/**
 * Load TAB 3: Interstate Manifestos (MDF-e)
 */
async function loadManifestos() {
  const tableBody = document.getElementById('manifestos-table-body');
  tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 2rem;">Carregando manifestos interestaduais...</td></tr>`;

  try {
    const res = await fetch('/api/manifestos');
    const data = await res.json();
    const manifestos = data.manifestos || [];

    document.getElementById('manifestos-count').textContent = `${manifestos.length} manifestos cadastrados`;

    if (manifestos.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 3rem; color: var(--text-muted);">Nenhum manifesto interestadual encontrado.</td></tr>`;
      return;
    }

    const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
    const formatDate = (str) => str ? new Date(str).toLocaleDateString('pt-BR') : '-';

    tableBody.innerHTML = manifestos.map((m) => {
      const cleanKey = String(m.chave_acesso).replace(/\D/g, '');
      const placas = [m.placa_tracao, m.placa_reboque].filter(Boolean).join(' / ') || 'LQW0A19 / MUV0J59';

      return `
        <tr>
          <td style="font-weight: 700; color: #a78bfa;">${m.numero}</td>
          <td>${m.serie}</td>
          <td>${formatDate(m.data_emissao)}</td>
          <td style="font-weight: 600;">${m.motorista_nome}</td>
          <td><span style="font-family: 'JetBrains Mono', monospace; font-size: 0.775rem; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">${placas}</span></td>
          <td style="font-weight: 600;">${m.uf_origem} -> ${m.uf_destino}</td>
          <td><span class="badge-interstate">${m.ufs_percurso || 'PE'}</span></td>
          <td style="text-align: center; font-weight: 700;">${m.total_ctes_vinculados || 1}</td>
          <td style="text-align: right; font-family: 'JetBrains Mono', monospace;">${Number(m.peso_bruto || 10384).toLocaleString('pt-BR')} kg</td>
          <td class="currency-cell" style="color: #c4b5fd;">${formatBRL(m.valor_total_carga)}</td>
          <td style="text-align: center;">
            <div class="action-buttons" style="justify-content: center;">
              <button class="icon-btn" title="Visualizar DAMDFE" onclick="openDocPreview('${cleanKey}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
              <button class="icon-btn" title="Baixar XML Original" onclick="downloadOriginalXML('${cleanKey}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--accent-rose); padding: 2rem;">Erro: ${err.message}</td></tr>`;
  }
}

/**
 * Load TAB 4: Driver Management (CRUD & Memory)
 */
async function loadDriversManagement() {
  const tableBody = document.getElementById('drivers-management-table-body');
  tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 2rem;">Carregando lista de condutores...</td></tr>`;

  try {
    const res = await fetch('/api/drivers');
    const data = await res.json();
    const drivers = data.drivers || [];
    allDriversCache = drivers;

    if (drivers.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 3rem; color: var(--text-muted);">Nenhum motorista cadastrado no sistema.</td></tr>`;
      return;
    }

    const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

    tableBody.innerHTML = drivers.map((drv) => {
      const statusBadge = drv.ativo 
        ? `<span class="badge-active">Ativo</span>` 
        : `<span class="badge-inactive">Inativo</span>`;

      return `
        <tr>
          <td style="font-weight: 700;">${drv.nome}</td>
          <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.775rem;">${drv.cpf}</td>
          <td>${drv.cnh || '<span style="color: var(--text-muted);">-</span>'}</td>
          <td style="text-align: center;">
            <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; padding: 2px 8px; border-radius: 4px; font-weight: 700;">
              ${drv.percentual_comissao || 75}%
            </span>
          </td>
          <td>${drv.telefone || '<span style="color: var(--text-muted);">-</span>'}</td>
          <td style="font-family: 'JetBrains Mono', monospace; font-size: 0.775rem;">${drv.chave_pix || '<span style="color: var(--text-muted);">-</span>'}</td>
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
              <button class="icon-btn btn-outline-danger" title="Excluir ou Desativar" onclick="confirmDeleteDriver('${drv.id}', '${drv.nome}')">
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
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--accent-rose); padding: 2rem;">Erro: ${err.message}</td></tr>`;
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
      document.getElementById('driver-comissao').value = drv.percentual_comissao || 75.0;
      document.getElementById('driver-telefone').value = drv.telefone || '';
      document.getElementById('driver-pix').value = drv.chave_pix || '';
      document.getElementById('driver-ativo').checked = Boolean(drv.ativo);
    }
  } else {
    document.getElementById('modal-driver-title').textContent = 'Cadastrar Novo Motorista';
    document.getElementById('driver-edit-id').value = '';
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

  // Clear filters
  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    initDateDefaults();
    document.getElementById('filter-driver').value = 'all';
    document.getElementById('filter-doc-type').value = 'all';
    document.getElementById('filter-destination').value = '';
    document.getElementById('table-search').value = '';
    currentFilters.driverId = 'all';
    currentFilters.docType = 'all';
    currentFilters.destination = '';
    currentFilters.search = '';
    fetchAndRenderDocuments();
  });

  // Search input debouncing
  let searchTimer;
  document.getElementById('table-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentFilters.search = e.target.value.trim();
      fetchAndRenderDocuments();
    }, 300);
  });

  // Quick Seed Attached DACTE/DAMDFE button
  document.getElementById('btn-seed-attached').addEventListener('click', async () => {
    const btn = document.getElementById('btn-seed-attached');
    btn.disabled = true;
    btn.textContent = 'Importando DACTE...';

    try {
      const res = await fetch('/api/seed-attached-dacte', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(`DACTE nº 3199 e DAMDFE nº 1267 importados com sucesso! Motorista: JOSE ANTONIO LINS DE A (75% comissão = R$ 6.693,75).`, 'success');
        await loadDrivers();
        await fetchAndRenderDocuments();
        loadManifestos();
        loadCTEs();
        loadDriversManagement();
      } else {
        showToast(`Erro: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast(`Erro ao importar: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
        Importar DACTE Anexo (Rio Largo -> Juazeiro)
      `;
    }
  });

  // Seed sample data button
  document.getElementById('btn-seed').addEventListener('click', async () => {
    const btn = document.getElementById('btn-seed');
    btn.disabled = true;
    btn.textContent = 'Gerando amostras...';

    try {
      const res = await fetch('/api/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        await loadDrivers();
        await fetchAndRenderDocuments();
      } else {
        showToast(`Erro: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast(`Erro ao gerar amostras: ${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
          <line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
        Gerar Amostras
      `;
    }
  });

  // Export to Excel button
  document.getElementById('btn-export-excel').addEventListener('click', () => {
    const query = new URLSearchParams(currentFilters).toString();
    showToast('Gerando planilha Excel (.xlsx) com comissão de 75%...', 'info');
    window.location.href = `/api/export/excel?${query}`;
  });

  // Driver Form Submit (Create / Edit)
  document.getElementById('form-driver').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('driver-edit-id').value;
    const body = {
      nome: document.getElementById('driver-nome').value,
      cpf: document.getElementById('driver-cpf').value,
      cnh: document.getElementById('driver-cnh').value,
      percentual_comissao: parseFloat(document.getElementById('driver-comissao').value) || 75.0,
      telefone: document.getElementById('driver-telefone').value,
      chave_pix: document.getElementById('driver-pix').value,
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
    } catch (err) {
      showToast(`Erro ao salvar motorista: ${err.message}`, 'error');
    }
  });

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
 * Confirm Driver Deletion / Deactivation
 */
async function confirmDeleteDriver(id, nome) {
  if (!confirm(`Deseja realmente excluir ou desativar o condutor "${nome}"?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/drivers/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    showToast(data.message || 'Operação realizada com sucesso.', 'info');
    await loadDrivers();
    loadDriversManagement();
    fetchAndRenderDocuments();
  } catch (err) {
    showToast(`Erro: ${err.message}`, 'error');
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
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleBatchUpload(files);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleBatchUpload(e.target.files);
    }
  });
}

/**
 * Upload multiple files to server
 */
async function handleBatchUpload(files) {
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

    displayUploadResults(data);
    await loadDrivers();
    await fetchAndRenderDocuments();
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
