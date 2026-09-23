/**
 * Authentic SEFAZ DACTE & DAMDFE Layout Renderer
 */

function formatKeyWithSpaces(key) {
  if (!key) return '';
  const clean = String(key).replace(/\D/g, '');
  return clean.replace(/(\d{4})/g, '$1 ').trim();
}

function formatBRL(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

function formatDateBR(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('pt-BR');
}

/**
 * Render CT-e DACTE Layout
 */
function renderDACTE(doc) {
  const extras = doc.dados_extras || {};
  const emit = extras.emitente || {};
  const rem = extras.remetente || {};
  const dest = extras.destinatario || {};
  const valores = extras.valores || {};
  const carga = extras.carga || {};

  return `
    <div class="dacte-sheet">
      <!-- Top SEFAZ Header -->
      <div class="sefaz-header-grid">
        <div class="sefaz-emitter">
          <h4>${emit.nome || 'TRANSPORTADORA EMITENTE'}</h4>
          <div style="font-size: 10px; color: #475569;">
            ${emit.logradouro || ''}, ${emit.numero || ''}<br>
            ${emit.municipio || doc.cidade_origem || ''} - ${emit.uf || doc.uf_origem || ''} | CEP: ${emit.cep || ''}<br>
            <strong>CNPJ:</strong> ${emit.cnpj || '00.000.000/0001-00'} &nbsp; <strong>IE:</strong> ${emit.ie || 'ISENTO'}
          </div>
        </div>

        <div class="sefaz-doc-type">
          <div class="sefaz-title">DOCUMENTO AUXILIAR</div>
          <h2>DACTE</h2>
          <div style="font-size: 10px; font-weight: bold;">
            MOD 57 - SÉRIE ${doc.serie}<br>
            Nº ${String(doc.numero).padStart(9, '0')}
          </div>
        </div>

        <div class="sefaz-barcode-box">
          <div class="barcode-stripe"></div>
          <div class="sefaz-title">CHAVE DE ACESSO</div>
          <div class="chave-numerica">${formatKeyWithSpaces(doc.chave_acesso)}</div>
          <div style="font-size: 9px; margin-top: 4px; color: #475569;">
            Consulta em www.cte.fazenda.gov.br ou no site da SEFAZ autorizadora
          </div>
        </div>
      </div>

      <!-- Protocol & Nature -->
      <div class="sefaz-box sefaz-grid-2">
        <div>
          <div class="sefaz-title">NATUREZA DA OPERAÇÃO</div>
          <div class="sefaz-val">PRESTAÇÃO DE SERVIÇO DE TRANSPORTE RODOVIÁRIO DE CARGAS</div>
        </div>
        <div>
          <div class="sefaz-title">PROTOCOLO DE AUTORIZAÇÃO DE USO</div>
          <div class="sefaz-val">${extras.protocolo || '135240000000000'} - ${formatDateBR(extras.dhAutorizacao || doc.data_emissao)}</div>
        </div>
      </div>

      <!-- Route: Origem & Destino -->
      <div class="sefaz-box sefaz-grid-2">
        <div>
          <div class="sefaz-title">INÍCIO DA PRESTAÇÃO (ORIGEM)</div>
          <div class="sefaz-val">${doc.cidade_origem || '-'} / ${doc.uf_origem || '-'}</div>
        </div>
        <div>
          <div class="sefaz-title">TÉRMINO DA PRESTAÇÃO (DESTINO)</div>
          <div class="sefaz-val">${doc.cidade_destino || '-'} / ${doc.uf_destino || '-'}</div>
        </div>
      </div>

      <!-- Remetente & Destinatário -->
      <div class="sefaz-box sefaz-grid-2">
        <div>
          <div class="sefaz-title">REMETENTE</div>
          <div class="sefaz-val">${rem.nome || 'Remetente não informado'}</div>
          <div style="font-size: 10px;">CNPJ/CPF: ${rem.cnpj_cpf || '-'} &nbsp; IE: ${rem.ie || '-'}</div>
          <div style="font-size: 10px;">Município: ${rem.municipio || '-'} / ${rem.uf || '-'}</div>
        </div>
        <div>
          <div class="sefaz-title">DESTINATÁRIO</div>
          <div class="sefaz-val">${dest.nome || 'Destinatário não informado'}</div>
          <div style="font-size: 10px;">CNPJ/CPF: ${dest.cnpj_cpf || '-'} &nbsp; IE: ${dest.ie || '-'}</div>
          <div style="font-size: 10px;">Endereço: ${dest.logradouro || ''}, ${dest.numero || ''} - ${dest.municipio || ''}/${dest.uf || ''}</div>
        </div>
      </div>

      <!-- Freight Component Values -->
      <div class="sefaz-box sefaz-grid-4">
        <div>
          <div class="sefaz-title">VALOR TOTAL DO SERVIÇO</div>
          <div class="sefaz-val" style="color: #0284c7; font-size: 13px;">${formatBRL(doc.valor_frete || doc.valor)}</div>
        </div>
        <div>
          <div class="sefaz-title">VALOR A RECEBER</div>
          <div class="sefaz-val">${formatBRL(valores.valorReceber || doc.valor_frete || doc.valor)}</div>
        </div>
        <div>
          <div class="sefaz-title">PRODUTO PREDOMINANTE</div>
          <div class="sefaz-val">${carga.produtoPredominante || 'Carga Fracionada'}</div>
        </div>
        <div>
          <div class="sefaz-title">PESO BRUTO (KG)</div>
          <div class="sefaz-val">${carga.pesoBruto ? Number(carga.pesoBruto).toLocaleString('pt-BR') : '-'}</div>
        </div>
      </div>

      <!-- Driver & Road Modal Details -->
      <div class="sefaz-box sefaz-grid-3">
        <div>
          <div class="sefaz-title">MOTORISTA RESPONSÁVEL</div>
          <div class="sefaz-val">${doc.motorista_nome || 'Não Informado'}</div>
        </div>
        <div>
          <div class="sefaz-title">CPF DO MOTORISTA</div>
          <div class="sefaz-val">${doc.motorista_cpf || '-'}</div>
        </div>
        <div>
          <div class="sefaz-title">CNH DO MOTORISTA</div>
          <div class="sefaz-val">${doc.motorista_cnh || 'Não cadastrada'}</div>
        </div>
      </div>

      <!-- Additional Info -->
      <div class="sefaz-box" style="margin-top: 4px;">
        <div class="sefaz-title">INFORMAÇÕES COMPLEMENTARES</div>
        <div style="font-size: 10px; color: #475569;">
          Documento emitido nos termos do Ajuste SINIEF. Tributação conforme legislação SEFAZ aplicável.
          ${doc.manifesto_id ? `<br><strong>Vinculado ao Manifesto MDF-e ID:</strong> ${doc.manifesto_id}` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render MDF-e DAMDFE Layout
 */
function renderDAMDFE(doc) {
  const extras = doc.dados_extras || {};
  const emit = extras.emitente || {};
  const veic = extras.veiculo || {};
  const ctes = extras.ctesRelacionados || [];

  return `
    <div class="dacte-sheet">
      <!-- Top SEFAZ Header -->
      <div class="sefaz-header-grid">
        <div class="sefaz-emitter">
          <h4>${emit.nome || 'TRANSPORTADORA EMITENTE'}</h4>
          <div style="font-size: 10px; color: #475569;">
            ${emit.logradouro || ''}, ${emit.numero || ''}<br>
            ${emit.municipio || ''} - ${emit.uf || doc.uf_origem || ''} | CEP: ${emit.cep || ''}<br>
            <strong>CNPJ:</strong> ${emit.cnpj || '00.000.000/0001-00'} &nbsp; <strong>IE:</strong> ${emit.ie || 'ISENTO'}
          </div>
        </div>

        <div class="sefaz-doc-type">
          <div class="sefaz-title">DOCUMENTO AUXILIAR</div>
          <h2>DAMDFE</h2>
          <div style="font-size: 10px; font-weight: bold;">
            MOD 58 - SÉRIE ${doc.serie}<br>
            Nº ${String(doc.numero).padStart(9, '0')}
          </div>
        </div>

        <div class="sefaz-barcode-box">
          <div class="barcode-stripe"></div>
          <div class="sefaz-title">CHAVE DE ACESSO</div>
          <div class="chave-numerica">${formatKeyWithSpaces(doc.chave_acesso)}</div>
          <div style="font-size: 9px; margin-top: 4px; color: #475569;">
            Consulta em www.mdfe.fazenda.gov.br ou no site da SEFAZ autorizadora
          </div>
        </div>
      </div>

      <!-- Protocol & Route -->
      <div class="sefaz-box sefaz-grid-2">
        <div>
          <div class="sefaz-title">MODELO / EMISSÃO</div>
          <div class="sefaz-val">MDF-e Rodoviário - ${formatDateBR(doc.data_emissao)}</div>
        </div>
        <div>
          <div class="sefaz-title">PROTOCOLO DE AUTORIZAÇÃO DE USO</div>
          <div class="sefaz-val">${extras.protocolo || '135240000000000'} - ${formatDateBR(extras.dhAutorizacao || doc.data_emissao)}</div>
        </div>
      </div>

      <!-- Route: UF Origem & UF Destino -->
      <div class="sefaz-box sefaz-grid-2">
        <div>
          <div class="sefaz-title">UF CARREGAMENTO (INÍCIO)</div>
          <div class="sefaz-val" style="font-size: 14px;">${doc.uf_origem || '-'}</div>
        </div>
        <div>
          <div class="sefaz-title">UF DESCARREGAMENTO (FIM)</div>
          <div class="sefaz-val" style="font-size: 14px;">${doc.uf_destino || '-'}</div>
        </div>
      </div>

      <!-- Road Modal: Vehicle & Driver -->
      <div class="sefaz-box sefaz-grid-4">
        <div>
          <div class="sefaz-title">VEÍCULO DE TRAÇÃO (PLACA)</div>
          <div class="sefaz-val">${veic.placa || 'PLACA N/I'} - ${veic.uf || doc.uf_origem || ''}</div>
        </div>
        <div>
          <div class="sefaz-title">RNTRC</div>
          <div class="sefaz-val">${veic.rntrc || '12345678'}</div>
        </div>
        <div>
          <div class="sefaz-title">MOTORISTA</div>
          <div class="sefaz-val">${doc.motorista_nome || 'Não Informado'}</div>
        </div>
        <div>
          <div class="sefaz-title">CPF DO MOTORISTA</div>
          <div class="sefaz-val">${doc.motorista_cpf || '-'}</div>
        </div>
      </div>

      <!-- Cargo Totals -->
      <div class="sefaz-box sefaz-grid-3">
        <div>
          <div class="sefaz-title">QUANTIDADE TOTAL DE CT-E</div>
          <div class="sefaz-val">${extras.qtdCTe || (ctes.length || 1)}</div>
        </div>
        <div>
          <div class="sefaz-title">VALOR TOTAL DA CARGA</div>
          <div class="sefaz-val" style="color: #7c3aed; font-size: 13px;">${formatBRL(doc.valor_total_carga || doc.valor)}</div>
        </div>
        <div>
          <div class="sefaz-title">PESO BRUTO TOTAL (KG)</div>
          <div class="sefaz-val">${extras.pesoBruto ? Number(extras.pesoBruto).toLocaleString('pt-BR') : '-'}</div>
        </div>
      </div>

      <!-- Linked CT-es -->
      <div class="sefaz-box" style="margin-top: 4px;">
        <div class="sefaz-title">DOCUMENTOS FISCAIS VINCULADOS (CT-E)</div>
        <div style="font-size: 10px; font-family: monospace; color: #1e293b; max-height: 80px; overflow-y: auto;">
          ${ctes.length > 0 
            ? ctes.map((k, i) => `<div>${i+1}. ${formatKeyWithSpaces(k)}</div>`).join('') 
            : '<div>Documentos CT-e vinculados ao manifesto conforme autorização SEFAZ.</div>'
          }
        </div>
      </div>
    </div>
  `;
}

window.renderDACTE = renderDACTE;
window.renderDAMDFE = renderDAMDFE;
