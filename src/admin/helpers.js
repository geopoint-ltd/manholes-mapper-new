import { escapeHtml } from '../dom/dom-utils.js';

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
              return `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`;
            })
          ).join('');
          const id = `def_${cfgKey}_${spec.key}`;
          return `<div class="field"><label for="${id}">${spec.label}</label><select id="${id}" data-def="${cfgKey}:${spec.key}">${optionsHtml}</select></div>`;
        }
        const id = `def_${cfgKey}_${spec.key}`;
        return `<div class="field"><label for="${id}">${spec.label}</label><input id="${id}" type="text" value="${escapeHtml(current)}" data-def="${cfgKey}:${spec.key}" placeholder="${t('admin.placeholders.defaultValue')}"/></div>`;
      }).join('')}
    </div>
  `;
  body.appendChild(defaultsDiv);

  // The option lists (אפשרויות – חומר מכסה, רמת דיוק, …) are no longer editable
  // here. Their codes have to match the geodatabase domains exactly, and an
  // accidental edit silently corrupted them once already. The values still come
  // from adminConfig, so anything a site had saved keeps working — only the
  // editing UI is gone. Preserved on branch archive/settings-options-editor.

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
              return `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`;
            })
          ).join('');
          const id = `def_${cfgKey}_${spec.key}`;
          return `<div class="field"><label for="${id}">${spec.label}</label><select id="${id}" data-def="${cfgKey}:${spec.key}">${optionsHtml}</select></div>`;
        }
        const id = `def_${cfgKey}_${spec.key}`;
        return `<div class="field"><label for="${id}">${spec.label}</label><input id="${id}" type="text" value="${escapeHtml(current)}" data-def="${cfgKey}:${spec.key}"/></div>`;
      }).join('')}
    </div>
  `;
  section.appendChild(defaultsDiv);

  // The option lists (אפשרויות – חומר מכסה, רמת דיוק, …) are no longer editable
  // here. Their codes have to match the geodatabase domains exactly, and an
  // accidental edit silently corrupted them once already. The values still come
  // from adminConfig, so anything a site had saved keeps working — only the
  // editing UI is gone. Preserved on branch archive/settings-options-editor.

  return section;
}
 

