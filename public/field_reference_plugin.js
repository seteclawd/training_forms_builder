// ===== Field Reference Plugin for TinyMCE =====
// Plugin que permite vincular celdas de tabla a campos del Builder

(function() {
  'use strict';

  // Lista de campos DB disponibles
  const DB_FIELDS = {
    db_crewName: { label: 'Crew Name', type: 'db' },
    db_crewId: { label: 'Crew ID', type: 'db' },
    db_crewLicense: { label: 'License Number', type: 'db' },
    db_crew3lc: { label: 'Crew 3LC', type: 'db' },
    db_instructorTri: { label: 'Instructor (TRI)', type: 'db' },
    db_examinerTre: { label: 'Examiner (TRE)', type: 'db' },
    db_pilotPosition: { label: 'Pilot Position', type: 'db' },
    db_location: { label: 'Location', type: 'db' },
    db_fstdId: { label: 'FSTD ID', type: 'db' },
    db_acReg: { label: 'A/C Reg', type: 'db' },
    db_adIcao: { label: 'AD ICAO', type: 'db' },
    db_acType: { label: 'A/C Type', type: 'db' }
  };

  // Nombres descriptivos para campos normales
  const NORMAL_FIELD_LABELS = {
    text: 'Text Field',
    number: 'Number',
    email: 'Email',
    date: 'Date',
    tel: 'Phone',
    select: 'Dropdown',
    radio: 'Radio Group',
    checkbox: 'Checkbox Group',
    textarea: 'Text Area',
    signature: 'Signature',
    heading: 'Heading'
  };

  // Obtener campos del formulario actual
  function getAvailableFields() {
    const fields = [];
    
    // DB Fields (siempre disponibles)
    Object.entries(DB_FIELDS).forEach(([key, info]) => {
      fields.push({ name: key, label: info.label, type: 'db' });
    });
    
    // Campos normales del formulario actual
    if (window.currentForm && window.currentForm.config && window.currentForm.config.sections) {
      Object.entries(window.currentForm.config.sections).forEach(([section, fieldList]) => {
        if (Array.isArray(fieldList)) {
          fieldList.forEach(field => {
            if (!field.name?.startsWith('db_') && field.type && field.type !== 'table' && field.type !== 'infoblock') {
              const label = field.label || NORMAL_FIELD_LABELS[field.type] || field.type;
              fields.push({
                name: field.name || field.id,
                label: label + (section !== 'session' ? ` (${section})` : ''),
                type: 'normal',
                fieldType: field.type
              });
            }
          });
        }
      });
    }
    
    return fields;
  }

  // Generar HTML del dropdown de campos
  function createFieldDropdown(callback) {
    const fields = getAvailableFields();
    const dbFields = fields.filter(f => f.type === 'db');
    const normalFields = fields.filter(f => f.type === 'normal');
    
    let html = '<div class="field-ref-dropdown" style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);max-height:400px;overflow-y:auto;min-width:250px;">';
    html += '<div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;background:#f8fafc;"><strong style="font-size:14px;color:#0f172a;">🔗 Link to Field</strong></div>';
    
    if (dbFields.length > 0) {
      html += '<div style="padding:8px 16px;background:#eff6ff;color:#1e40af;font-size:11px;font-weight:600;text-transform:uppercase;">Database Fields</div>';
      dbFields.forEach(field => {
        html += `<div class="field-ref-item" data-field="${field.name}" style="padding:8px 16px;cursor:pointer;font-size:13px;color:#334155;display:flex;align-items:center;gap:8px;">
          <span style="background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">DB</span>
          ${field.label}
        </div>`;
      });
    }
    
    if (normalFields.length > 0) {
      html += '<div style="padding:8px 16px;background:#f0fdf4;color:#166534;font-size:11px;font-weight:600;text-transform:uppercase;">Form Fields</div>';
      normalFields.forEach(field => {
        html += `<div class="field-ref-item" data-field="${field.name}" style="padding:8px 16px;cursor:pointer;font-size:13px;color:#334155;display:flex;align-items:center;gap:8px;">
          <span style="background:#dcfce7;color:#166534;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;">${field.fieldType || 'field'}</span>
          ${field.label}
        </div>`;
      });
    }
    
    html += '</div>';
    
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    wrapper.style.position = 'absolute';
    wrapper.style.zIndex = '99999';
    
    // Add hover effects
    wrapper.querySelectorAll('.field-ref-item').forEach(item => {
      item.addEventListener('mouseenter', () => {
        item.style.background = '#f1f5f9';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
      });
      item.addEventListener('click', () => {
        const fieldName = item.dataset.field;
        callback(fieldName);
        wrapper.remove();
      });
    });
    
    // Close on click outside
    const closeHandler = (e) => {
      if (!wrapper.contains(e.target)) {
        wrapper.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
    
    return wrapper;
  }

  // Insertar referencia de campo en el editor
  function insertFieldReference(editor, fieldName) {
    const fields = getAvailableFields();
    const field = fields.find(f => f.name === fieldName);
    if (!field) return;
    
    const displayLabel = field.label || fieldName;
    const spanHtml = `<span class="field-reference" data-field="${fieldName}" contenteditable="false" style="background:#e0e7ff;border:1px dashed #6366f1;color:#4338ca;padding:2px 8px;border-radius:4px;font-size:0.9em;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">
      <span style="font-size:10px;">🔗</span> ${displayLabel}
    </span><span>&nbsp;</span>`;
    
    editor.insertContent(spanHtml);
  }

  // Registrar plugin TinyMCE
  tinymce.PluginManager.add('fieldreference', function(editor) {
    
    // Botón en toolbar
    editor.ui.registry.addSplitButton('fieldreference', {
      icon: 'user',
      tooltip: 'Insert Field Reference',
      text: 'Field',
      onAction: function() {
        // Mostrar dropdown
        const btn = editor.getContainer().querySelector('[aria-label="Insert Field Reference"]');
        if (btn) {
          const rect = btn.getBoundingClientRect();
          const dropdown = createFieldDropdown((fieldName) => {
            insertFieldReference(editor, fieldName);
          });
          dropdown.style.left = rect.left + 'px';
          dropdown.style.top = (rect.bottom + 4) + 'px';
          document.body.appendChild(dropdown);
        }
      },
      onItemAction: function(api, value) {
        insertFieldReference(editor, value);
      },
      fetch: function(callback) {
        const fields = getAvailableFields();
        const items = fields.map(f => ({
          type: 'menuitem',
          text: f.label,
          value: f.name,
          icon: f.type === 'db' ? 'user' : 'text-field'
        }));
        callback(items);
      }
    });

    // Agregar al menú Insert
    editor.ui.registry.addMenuItem('insertfieldref', {
      icon: 'user',
      text: 'Field Reference...',
      onAction: function() {
        const container = editor.getContainer();
        const rect = container.getBoundingClientRect();
        const dropdown = createFieldDropdown((fieldName) => {
          insertFieldReference(editor, fieldName);
        });
        dropdown.style.left = (rect.left + 100) + 'px';
        dropdown.style.top = (rect.top + 50) + 'px';
        document.body.appendChild(dropdown);
      }
    });

    // Agregar al context menu de celdas
    editor.ui.registry.addContextMenu('fieldrefcontext', {
      update: function(element) {
        return element.nodeName.toLowerCase() === 'td' ? 'insertfieldrefcell' : '';
      }
    });

    editor.ui.registry.addMenuItem('insertfieldrefcell', {
      icon: 'user',
      text: 'Link Cell to Field...',
      onAction: function() {
        const cell = editor.selection.getNode();
        if (cell.nodeName.toLowerCase() !== 'td') return;
        
        const rect = cell.getBoundingClientRect();
        const dropdown = createFieldDropdown((fieldName) => {
          const fields = getAvailableFields();
          const field = fields.find(f => f.name === fieldName);
          if (field) {
            cell.setAttribute('data-field', fieldName);
            cell.setAttribute('data-field-type', field.type);
            cell.style.background = '#e0e7ff';
            cell.style.border = '2px dashed #6366f1';
            cell.innerHTML = `<div style="display:flex;align-items:center;gap:4px;color:#4338ca;font-weight:500;font-size:0.9em;">
              <span>🔗</span> ${field.label}
            </div>`;
            editor.fire('change');
          }
        });
        dropdown.style.left = (rect.left + window.scrollX) + 'px';
        dropdown.style.top = (rect.bottom + window.scrollY + 4) + 'px';
        document.body.appendChild(dropdown);
      }
    });

    // Agregar items al menú existente
    editor.on('init', function() {
      // Añadir submenu a Insert menu
      const insertMenu = editor.settings.menu?.insert;
      if (insertMenu && insertMenu.items) {
        insertMenu.items = insertMenu.items.replace('| charmap', '| insertfieldref | charmap');
      }
    });
  });

})();