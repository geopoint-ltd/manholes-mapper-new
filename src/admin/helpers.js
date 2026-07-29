/**
 * Build the options editor section for the Admin Modal (richer UI with icons and tables).
 * Returns a detached Element for insertion.
 */
export function buildOptionsEditorModal(adminConfig, t, title, cfgKey, specs) {
  const section = document.createElement('div');
  section.className = 'admin-section';
  section.setAttribute('data-tab', cfgKey);

  const header = document.createElement('div');
  header.className = 'admin-section-header';
  header.innerHTML = `<h3 class="admin-section-title"><span class="material-icons">${cfgKey === 'nodes' ? 'account_tree' : 'timeline'}</span>${title}</h3>`;
  section.appendChild(header);

  const body = document.createElement('div');
  body.className = 'admin-section-body';

  const include = adminConfig[cfgKey].include;
  const includeDiv = document.createElement('div');
  includeDiv.className = 'admin-group';
  includeDiv.innerHTML = `
    <button type="button" class="admin-group-toggle" aria-expanded="true">
      <div class="admin-group-toggle-header">
        <div class="admin-subtitle"><span class="material-icons">checklist</span>${t('admin.includeTitle')}</div>
        <span class="material-icons admin-group-toggle-icon">expand_more</span>
      </div>
    </button>
    <div class="admin-group-content">
      <div class="admin-desc">${t('admin.includeDesc')}</div>
      <div class="admin-checkbox-group">${Object.keys(include).map(k => {
        const checked = include[k] ? 'checked' : '';
        const id = `inc_${cfgKey}_${k}`;
        return `<div class="admin-checkbox-item"><input type="checkbox" data-inc="${cfgKey}:${k}" ${checked} id="${id}"/><label for="${id}">${k}</label></div>`;
      }).join('')}</div>
    </div>
  `;
  body.appendChild(includeDiv);

  const defaults = adminConfig[cfgKey].defaults;
  const defaultsDiv = document.createElement('div');
  defaultsDiv.className = 'admin-group';
  defaultsDiv.innerHTML = `
    <button type="button" class="admin-group-toggle" aria-expanded="true">
      <div class="admin-group-toggle-header">
        <div class="admin-subtitle"><span class="material-icons">settings</span>${t('admin.defaultsTitle')}</div>
        <span class="material-icons admin-group-toggle-icon">expand_more</span>
      </div>
    </button>
    <div class="admin-group-content">
      <div class="admin-desc">${t('admin.defaultsDesc')}</div>
      ${specs.map(spec => {
        const current = defaults[spec.key] ?? '';
        if (spec.type === 'select') {
          const opts = adminConfig[cfgKey].options[spec.key] || [];
          const optionsHtml = [`<option value="">${t('labels.optional')}</option>`].concat(
            opts.filter(o => o.enabled !== false).map(o => {
              const value = (spec.valueKind === 'code') ? String(o.code) : String(o.label);
              const text = String(o.label);
              return `<option value="${value}">${text}</option>`;
            })
          ).join('');
          const id = `def_${cfgKey}_${spec.key}`;
          return `<div class="field"><label for="${id}">${spec.label}</label><select id="${id}" data-def="${cfgKey}:${spec.key}">${optionsHtml}</select></div>`;
        }
        const id = `def_${cfgKey}_${spec.key}`;
        return `<div class="field"><label for="${id}">${spec.label}</label><input id="${id}" type="text" value="${current}" data-def="${cfgKey}:${spec.key}" placeholder="${t('admin.placeholders.defaultValue')}"/></div>`;
      }).join('')}
    </div>
  `;
  body.appendChild(defaultsDiv);

  const optsWrap = document.createElement('div');
  optsWrap.className = 'admin-group';
  optsWrap.innerHTML = specs.filter(s => s.optionsKey).map(spec => {
    const opts = adminConfig[cfgKey].options[spec.optionsKey] || [];
    const rows = opts.map((o) => `<tr>
      <td class="opt-enabled" data-label="${t('admin.thEnabled')}"><input type="checkbox" ${o.enabled!==false?'checked':''} data-opt-enabled="${cfgKey}:${spec.optionsKey}"/></td>
      <td class="opt-label" data-label="${t('admin.thLabel')}"><input type="text" value="${o.label}" data-opt-label="${cfgKey}:${spec.optionsKey}"/></td>
      <td class="opt-code" data-label="${t('admin.thCode')}"><input type="text" value="${o.code}" data-opt-code="${cfgKey}:${spec.optionsKey}"/></td>
      <td class="opt-actions" data-label="${t('admin.delete')}"><button class="btn btn-danger btn-sm" title="${t('admin.delete')}" aria-label="${t('admin.delete')}" data-opt-del="${cfgKey}:${spec.optionsKey}">×</button></td>
    </tr>`).join('');
    return `
      <button type="button" class="admin-group-toggle" aria-expanded="true">
        <div class="admin-group-toggle-header">
          <div class="admin-subtitle">${t('admin.optionsTitle', spec.label)}</div>
          <span class="material-icons admin-group-toggle-icon">expand_more</span>
        </div>
      </button>
      <div class="admin-group-content">
        <div class="field">
          <div class="admin-desc">${t('admin.optionsDesc')}</div>
          <table class="option-table" style="width:100%;">
            <thead><tr><th class="opt-enabled">${t('admin.thEnabled')}</th><th class="opt-label">${t('admin.thLabel')}</th><th class="opt-code">${t('admin.thCode')}</th><th class="opt-actions"></th></tr></thead>
            <tbody data-opt-body="${cfgKey}:${spec.optionsKey}">${rows}</tbody>
          </table>
          <div style="margin-top:6px;"><button class="btn" data-opt-add="${cfgKey}:${spec.optionsKey}">${t('admin.addOption')}</button></div>
        </div>
      </div>
    `;
  }).join('');
  body.appendChild(optsWrap);

  section.appendChild(body);
  return section;
}

/**
 * Build the options editor for the full Admin Screen (simpler header).
 */
export function buildOptionsEditorScreen(adminConfig, t, title, cfgKey, specs) {
  const section = document.createElement('div');
  section.className = 'admin-section';
  section.setAttribute('data-tab', cfgKey);
  section.innerHTML = `<h3 class="admin-section-title">${title}</h3>`;

  const include = adminConfig[cfgKey].include;
  const includeDiv = document.createElement('div');
  includeDiv.className = 'admin-group';
  includeDiv.innerHTML = `
    <button type="button" class="admin-group-toggle" aria-expanded="true">
      <div class="admin-group-toggle-header">
        <div class="admin-subtitle">${t('admin.includeTitle')}</div>
        <span class="material-icons admin-group-toggle-icon">expand_more</span>
      </div>
    </button>
    <div class="admin-group-content">
      <div class="admin-desc">${t('admin.includeDesc')}</div>
      ${Object.keys(include).map(k => {
        const checked = include[k] ? 'checked' : '';
        const id = `inc_${cfgKey}_${k}`;
        return `<span style="display:inline-flex;align-items:center;gap:6px;margin-inline-end:10px;"><input id="${id}" type="checkbox" data-inc="${cfgKey}:${k}" ${checked}/><label for="${id}"> ${k}</label></span>`;
      }).join('')}
    </div>
  `;
  section.appendChild(includeDiv);

  const defaults = adminConfig[cfgKey].defaults;
  const defaultsDiv = document.createElement('div');
  defaultsDiv.className = 'admin-group';
  defaultsDiv.innerHTML = `
    <button type="button" class="admin-group-toggle" aria-expanded="true">
      <div class="admin-group-toggle-header">
        <div class="admin-subtitle">${t('admin.defaultsTitle')}</div>
        <span class="material-icons admin-group-toggle-icon">expand_more</span>
      </div>
    </button>
    <div class="admin-group-content">
      <div class="admin-desc">${t('admin.defaultsDesc')}</div>
      ${specs.map(spec => {
        const current = defaults[spec.key] ?? '';
        if (spec.type === 'select') {
          const opts = adminConfig[cfgKey].options[spec.key] || [];
          const optionsHtml = [`<option value="">${t('labels.optional')}</option>`].concat(
            opts.map(o => {
              const value = (spec.valueKind === 'code') ? String(o.code) : String(o.label);
              const text = String(o.label);
              return `<option value="${value}">${text}</option>`;
            })
          ).join('');
          const id = `def_${cfgKey}_${spec.key}`;
          return `<div class="field"><label for="${id}">${spec.label}</label><select id="${id}" data-def="${cfgKey}:${spec.key}">${optionsHtml}</select></div>`;
        }
        const id = `def_${cfgKey}_${spec.key}`;
        return `<div class="field"><label for="${id}">${spec.label}</label><input id="${id}" type="text" value="${current}" data-def="${cfgKey}:${spec.key}"/></div>`;
      }).join('')}
    </div>
  `;
  section.appendChild(defaultsDiv);

  const optsWrap = document.createElement('div');
  optsWrap.className = 'admin-group';
  optsWrap.innerHTML = specs.filter(s => s.optionsKey).map(spec => {
    const opts = adminConfig[cfgKey].options[spec.optionsKey] || [];
    const rows = opts.map((o) => `<tr>
      <td class="opt-enabled" data-label="${t('admin.thEnabled')}"><input type="checkbox" ${o.enabled!==false?'checked':''} data-opt-enabled="${cfgKey}:${spec.optionsKey}"/></td>
      <td class="opt-label" data-label="${t('admin.thLabel')}"><input type="text" value="${o.label}" data-opt-label="${cfgKey}:${spec.optionsKey}"/></td>
      <td class="opt-code" data-label="${t('admin.thCode')}"><input type="text" value="${o.code}" data-opt-code="${cfgKey}:${spec.optionsKey}"/></td>
      <td class="opt-actions" data-label="${t('admin.delete')}"><button class="btn btn-danger btn-sm" title="${t('admin.delete')}" aria-label="${t('admin.delete')}" data-opt-del="${cfgKey}:${spec.optionsKey}">×</button></td>
    </tr>`).join('');
    return `
      <button type="button" class="admin-group-toggle" aria-expanded="true">
        <div class="admin-group-toggle-header">
          <div class="admin-subtitle">${t('admin.optionsTitle', spec.label)}</div>
          <span class="material-icons admin-group-toggle-icon">expand_more</span>
        </div>
      </button>
      <div class="admin-group-content">
        <div class="field">
          <div class="admin-desc">${t('admin.optionsDesc')}</div>
          <table class="option-table" style="width:100%;">
            <thead><tr><th class="opt-enabled">${t('admin.thEnabled')}</th><th class="opt-label">${t('admin.thLabel')}</th><th class="opt-code">${t('admin.thCode')}</th><th class="opt-actions"></th></tr></thead>
            <tbody data-opt-body="${cfgKey}:${spec.optionsKey}">${rows}</tbody>
          </table>
          <div style="margin-top:6px;"><button class="btn" data-opt-add="${cfgKey}:${spec.optionsKey}">${t('admin.addOption')}</button></div>
        </div>
      </div>
    `;
  }).join('');
  section.appendChild(optsWrap);

  return section;
}
 

