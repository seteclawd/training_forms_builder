let currentForm = {
  id: null,
  name: '',
  form_type: 'simulator',
  description: '',
  config: {
    title: '',
    subtitle: '',
    sections: { session: [], training: [], comments: [] }
  }
};
let selectedField = null;
let selectedFieldsetId = null;
let currentSection = 'session';
let fieldCounter = 0;
let previewInterval = null;

// ===== VIEW MANAGEMENT =====
async function loadSavedTables() {
  try {
    const res = await fetch('/api/saved-tables');
    const tables = await res.json();
    const list = document.getElementById('savedTablesList');
    if (!tables.length) {
      list.innerHTML = '<p class="hint" style="font-size:0.75rem;">No saved tables yet. Use Table Importer to create.</p>';
      return;
    }
    list.innerHTML = tables.map(t => `
      <div class="palette-item" draggable="true" data-type="saved_table" data-table-id="${t.id}" style="font-size:0.75rem;padding:6px 8px;margin-bottom:4px;">
        📊 ${esc(t.name)}
      </div>
    `).join('');
    // Add drag handlers
    list.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('fieldType', item.dataset.type);
        if (item.dataset.tableId) {
          e.dataTransfer.setData('tableId', item.dataset.tableId);
        }
      });
    });
  } catch (err) {
    console.error(err);
  }
}

function showView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(view + 'View').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
}

function showDashboard() { showView('dashboard'); loadForms(); }
function showTemplates() { showView('templates'); loadTemplates(); }

function createNewTemplate() {
  _editingTemplateId = null;
  document.getElementById('editingTemplateId').value = '';
  document.getElementById('templateModalTitle').textContent = 'Create Section Template';
  document.getElementById('templateName').value = '';
  document.getElementById('templateDescription').value = '';
  const section = document.getElementById('newTemplateSection')?.value || document.getElementById('templateSectionFilter')?.value || 'session';
  currentSection = section;
  currentForm = {
    name: 'New Template',
    form_type: 'simulator',
    description: '',
    config: {
      title: 'New Template',
      subtitle: '',
      formId: '',
      formIssue: '',
      formRevision: '',
      formDate: '',
      sections: { session: [], training: [], comments: [] }
    }
  };
  currentForm.config.sections[section] = [
    {
      id: 'fieldset_' + Date.now(),
      type: 'fieldset',
      title: 'New Section',
      fields: []
    }
  ];
  showView('builder');
  resetBuilder();
  renderCurrentSection();
  startPreviewSync();
  // Override save to save as template
  window._saveAsTemplate = true;
  window._templateSection = section;
}
function showBuilder() { showView('builder'); resetBuilder(); startPreviewSync(); }

// ===== TEMPLATE MANAGEMENT =====
let templateSections = { session: [], training: [], comments: [] };

function showBuilderWithTemplate() {
  showBuilder();
}

async function loadTemplates() {
  try {
    const res = await fetch('/api/templates');
    const templates = await res.json();
    const grid = document.getElementById('templatesList');
    if (!templates.length) {
      grid.innerHTML = '<p class="hint">No templates yet. Create one from the Builder.</p>';
      return;
    }
    grid.innerHTML = templates.map(t => `
      <div class="template-card">
        <h3>${esc(t.name)}</h3>
        <div class="meta">${t.section_type} · ${new Date(t.created_at).toLocaleDateString()}</div>
        <p style="color:#64748b;font-size:0.8rem;margin:8px 0;">${esc(t.description || '')}</p>
        <div class="template-actions">
          <button class="btn-use" onclick="useTemplate(${t.id})">
            <span>📋</span> Use
          </button>
          <button class="btn-edit" onclick="editTemplate(${t.id})">
            <span>✏️</span> Edit
          </button>
          <button class="btn-delete" onclick="deleteTemplate(${t.id})">🗑️</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

async function useTemplate(templateId) {
  try {
    const res = await fetch(`/api/templates/${templateId}`);
    const template = await res.json();
    currentForm = {
      id: null,
      name: '',
      form_type: 'simulator',
      description: '',
      config: { title: '', subtitle: '', sections: { session: [], training: [], comments: [] } }
    };
    // Apply template fields to the appropriate section
    currentForm.config.sections[template.section_type] = JSON.parse(JSON.stringify(template.fields));
    showBuilder();
    document.getElementById('formId').value = template.name;
    // Switch to the section that has the template
    document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.section-tab[data-section="${template.section_type}"]`).classList.add('active');
    document.querySelectorAll('.builder-section').forEach(s => s.classList.remove('active'));
    document.getElementById('section-' + template.section_type).classList.add('active');
    currentSection = template.section_type;
    renderCurrentSection();
    updateLivePreview();
  } catch (err) {
    console.error(err);
    alert('Error loading template');
  }
}

async function deleteTemplate(id) {
  if (!confirm('Delete this template?')) return;
  try {
    await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    loadTemplates();
  } catch (err) {
    console.error(err);
  }
}

let _editingTemplateId = null;

async function editTemplate(id) {
  try {
    const res = await fetch(`/api/templates/${id}`);
    const template = await res.json();
    _editingTemplateId = template.id;

    // Fill modal with template data
    document.getElementById('templateName').value = template.name;
    document.getElementById('templateSectionType').value = template.section_type || 'session';
    document.getElementById('templateDescription').value = template.description || '';
    document.getElementById('templateModalTitle').textContent = 'Edit Template';
    document.getElementById('editingTemplateId').value = template.id;

    // Load fields into builder canvas
    currentSection = template.section_type || 'session';
    currentForm.config.sections[currentSection] = JSON.parse(JSON.stringify(template.fields));
    renderTemplateBuilderCanvas();

    // Show modal
    document.getElementById('templateBuilderModal').style.display = 'flex';
  } catch (err) {
    console.error(err);
    alert('Error loading template for editing');
  }
}

function renderTemplateBuilderCanvas() {
  const container = document.getElementById('templateBuilderCanvas');
  container.innerHTML = '';
  const fieldsets = currentForm.config.sections[currentSection] || [];
  if (!fieldsets.length) {
    container.innerHTML = '<p class="hint">Design your template section here. Add sub-sections and fields.</p>';
    return;
  }
  fieldsets.forEach(fs => {
    const fsDiv = document.createElement('div');
    fsDiv.style.cssText = 'border:2px dashed #e2e8f0;border-radius:8px;padding:12px;margin-bottom:12px;';
    fsDiv.innerHTML = `<strong>${esc(fs.title || 'Sub-section')}</strong>`;
    if (fs.fields && fs.fields.length) {
      fs.fields.forEach(f => {
        const fDiv = document.createElement('div');
        fDiv.style.cssText = 'margin:4px 0;padding:4px 8px;background:#f8fafc;border-radius:4px;font-size:0.8rem;';
        fDiv.textContent = `${f.type}: ${f.label}`;
        fsDiv.appendChild(fDiv);
      });
    }
    container.appendChild(fsDiv);
  });
}

function renderTemplateBuilderCanvasFromCurrentSection() {
  // Copy current section data to the modal's display
  const section = document.getElementById('templateSectionType').value || currentSection;
  const fieldsets = currentForm.config.sections[section] || [];
  
  // Copy to the working area for the modal
  if (!currentForm.config.sections[section]) {
    currentForm.config.sections[section] = [];
  }
  // The modal will show whatever is in currentForm.config.sections[section]
  renderTemplateBuilderCanvas();
}

async function saveCurrentSectionAsTemplate() {
  console.log('saveCurrentSectionAsTemplate clicked');
  
  // Make sure currentForm exists
  if (!currentForm || !currentForm.config || !currentForm.config.sections) {
    console.error('currentForm not initialized:', currentForm);
    alert('Please create some fields first before saving as template.');
    return;
  }
  
  // Open the template builder modal with current section data pre-filled
  const fields = currentForm.config.sections[currentSection] || [];
  
  if (!fields || !fields.length) {
    alert('Current section is empty. Add some fields first.');
    return;
  }

  _editingTemplateId = null;
  document.getElementById('editingTemplateId').value = '';
  document.getElementById('templateModalTitle').textContent = 'Save as Template - ' + currentSection.toUpperCase();
  document.getElementById('templateName').value = '';
  document.getElementById('templateDescription').value = '';
  document.getElementById('templateSectionType').value = currentSection;

  // Render the current section fields in the modal canvas
  renderTemplateBuilderCanvasFromCurrentSection();

  // Show modal
  document.getElementById('templateBuilderModal').style.display = 'flex';
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

// ===== SECTION TABS =====
document.querySelectorAll('.section-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentSection = tab.dataset.section;
    document.querySelectorAll('.builder-section').forEach(s => s.classList.remove('active'));
    document.getElementById('section-' + currentSection).classList.add('active');
  });
});

// ===== DRAG & DROP =====
document.querySelectorAll('.palette-item').forEach(item => {
  item.addEventListener('dragstart', e => {
    e.dataTransfer.setData('fieldType', item.dataset.type);
    if (item.dataset.tableId) {
      e.dataTransfer.setData('tableId', item.dataset.tableId);
    }
  });
  item.addEventListener('click', () => {
    // If a fieldset is selected, add field to it; otherwise add to the first fieldset or create one
    const fieldsets = currentForm.config.sections[currentSection];
    if (!fieldsets.length) {
      addFieldset();
    }
    addField(item.dataset.type);
  });
});

// ===== FIELDSET MANAGEMENT =====
function addFieldset() {
  fieldCounter++;
  const fieldset = {
    id: 'fieldset_' + Date.now() + '_' + fieldCounter,
    type: 'fieldset',
    title: 'Sub-section ' + (currentForm.config.sections[currentSection].length + 1),
    fields: []
  };
  currentForm.config.sections[currentSection].push(fieldset);
  renderFieldset(fieldset);
  selectFieldset(fieldset);
}

function deleteFieldset(id) {
  currentForm.config.sections[currentSection] = currentForm.config.sections[currentSection].filter(f => f.id !== id);
  if (selectedFieldsetId === id) {
    selectedFieldsetId = null;
    selectedField = null;
    document.getElementById('propertiesContent').innerHTML = '<p class="hint">Select a field or sub-section to edit its properties</p>';
  }
  renderCurrentSection();
}

function moveFieldset(id, dir) {
  const arr = currentForm.config.sections[currentSection];
  const idx = arr.findIndex(f => f.id === id);
  if (idx === -1) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= arr.length) return;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  renderCurrentSection();
}

function selectFieldset(fieldset) {
  selectedFieldsetId = fieldset.id;
  selectedField = fieldset;
  document.querySelectorAll('.builder-field').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.fieldset-header').forEach(el => el.classList.remove('selected'));
  const el = document.querySelector(`.fieldset-header[data-id="${fieldset.id}"]`);
  if (el) el.classList.add('selected');
  renderFieldsetProperties(fieldset);
}

function renderFieldsetProperties(fieldset) {
  const panel = document.getElementById('propertiesContent');
  const bgOpacity = fieldset.bgOpacity !== undefined ? fieldset.bgOpacity : 15;
  const bgSize = fieldset.bgSize || 'cover';
  panel.innerHTML = `
    ${propGroup('Sub-section Title', `<input type="text" id="prop_title" value="${esc(fieldset.title)}" oninput="updateFieldsetProp('${fieldset.id}', 'title', this.value)">`)}
    <div class="prop-group">
      <label>Background Image</label>
      <input type="text" id="prop_bgImage" value="${esc(fieldset.bgImage || '')}" placeholder="Image URL" oninput="updateFieldsetProp('${fieldset.id}', 'bgImage', this.value)">
      <div style="margin-top:8px;">
        <label style="font-size:0.75rem;color:#64748b;">Opacity (${bgOpacity}%)</label>
        <input type="range" min="0" max="100" value="${bgOpacity}" style="width:100%;margin:4px 0;"
          oninput="updateFieldsetProp('${fieldset.id}', 'bgOpacity', parseInt(this.value)); document.getElementById('bgOpacityValue').textContent = this.value + '%';">
        <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#94a3b8;">
          <span>0%</span><span id="bgOpacityValue">${bgOpacity}%</span><span>100%</span>
        </div>
      </div>
      <div style="margin-top:8px;">
        <label style="font-size:0.75rem;color:#64748b;">Image Size</label>
        <select onchange="updateFieldsetProp('${fieldset.id}', 'bgSize', this.value)" style="width:100%;padding:4px;border:1px solid #e2e8f0;border-radius:4px;margin-top:4px;">
          <option value="cover" ${bgSize === 'cover' ? 'selected' : ''}>Cover (fill)</option>
          <option value="contain" ${bgSize === 'contain' ? 'selected' : ''}>Contain (fit)</option>
          <option value="auto" ${bgSize === 'auto' ? 'selected' : ''}>Auto (original)</option>
        </select>
      </div>
    </div>
    <div class="prop-group">
      <label>Fields in this sub-section: ${fieldset.fields.length}</label>
    </div>
  `;
}

function updateFieldsetProp(id, key, value) {
  const fs = findFieldset(id);
  if (!fs) return;
  fs[key] = value;
  if (key === 'title') {
    const el = document.querySelector(`.fieldset-header[data-id="${id}"] .fieldset-title-text`);
    if (el) el.textContent = value;
  }
}

function findFieldset(id) {
  for (const sec of Object.values(currentForm.config.sections)) {
    const fs = sec.find(f => f.id === id);
    if (fs) return fs;
  }
  return null;
}

// ===== RESIZE FUNCTIONALITY =====
function setupResize(handle, field, mode, infoEl) {
  let isResizing = false;
  let startX, startY, startWidth, startHeight;

  handle.addEventListener('mousedown', e => {
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    const parentEl = handle.closest('.builder-field');
    startWidth = parentEl.offsetWidth;
    startHeight = parentEl.offsetHeight;
    e.stopPropagation();
    e.preventDefault();

    // Update the blue bar immediately to show current width
    const currentWidth = field.width && field.width !== 'auto' ? parseInt(field.width) : 100;
    parentEl.style.setProperty('--field-width', currentWidth + '%');

    function onMouseMove(ev) {
      if (!isResizing) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const parentEl = handle.closest('.builder-field');
      const containerWidth = parentEl.parentElement.offsetWidth;

      let infoText = '';
      if (mode === 'width' || mode === 'both') {
        const newWidthPx = startWidth + dx;
        const newWidthPct = Math.round((newWidthPx / containerWidth) * 100);
        const clamped = Math.max(5, Math.min(100, newWidthPct));
        infoText += clamped + '%';
        
        // Update the blue bar in real-time
        parentEl.style.setProperty('--field-width', clamped + '%');
      }
      if (mode === 'height' || mode === 'both') {
        const newHeight = startHeight + dy;
        // Calculate lines: each line is ~30px, max 10 lines
        const lines = Math.max(1, Math.min(10, Math.round(newHeight / 30)));
        infoText += (infoText ? ' / ' : '') + lines + ' lines';
      }
      infoEl.textContent = infoText;
      infoEl.style.display = 'block';
    }

    function onMouseUp(ev) {
      if (!isResizing) return;
      isResizing = false;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const parentEl = handle.closest('.builder-field');
      const containerWidth = parentEl.parentElement.offsetWidth;

      if (mode === 'width' || mode === 'both') {
        const newWidthPx = startWidth + dx;
        const newWidthPct = Math.round((newWidthPx / containerWidth) * 100);
        const clamped = Math.max(5, Math.min(100, newWidthPct));
        field.width = clamped.toString();
        // Update the blue bar
        parentEl.style.setProperty('--field-width', clamped + '%');
      }
      if (mode === 'height' || mode === 'both') {
        const newHeight = startHeight + dy;
        const lines = Math.max(1, Math.min(10, Math.round(newHeight / 30)));
        // Map lines to height values
        const heightMap = {1: 'auto', 2: 'small', 3: 'small', 4: 'medium', 5: 'medium', 
                          6: 'medium', 7: 'large', 8: 'large', 9: 'xlarge', 10: 'xlarge'};
        field.height = heightMap[lines] || 'auto';
      }
      infoEl.style.display = 'none';
      renderCurrentSection();
      if (selectedField === field) renderProperties(field);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// ===== ADD FIELD (into selected fieldset) =====
function reorderFieldInFieldset(fieldsetId, draggedId, targetId) {
  const fieldset = findFieldset(fieldsetId);
  if (!fieldset) return;
  const fields = fieldset.fields;
  const draggedIdx = fields.findIndex(f => f.id === draggedId);
  const targetIdx = fields.findIndex(f => f.id === targetId);
  if (draggedIdx === -1 || targetIdx === -1) return;
  // Move dragged field to target position
  const [moved] = fields.splice(draggedIdx, 1);
  fields.splice(targetIdx, 0, moved);
  renderCurrentSection();
}

function addField(type, targetFieldsetId) {
  const fieldsets = currentForm.config.sections[currentSection];
  let targetFs;
  const fsId = targetFieldsetId || selectedFieldsetId;
  if (fsId) {
    targetFs = fieldsets.find(f => f.id === fsId);
  }
  if (!targetFs) {
    if (!fieldsets.length) addFieldset();
    targetFs = fieldsets[fieldsets.length - 1];
  }

  const field = createField(type);
  targetFs.fields.push(field);
  selectedFieldsetId = targetFs.id; // Keep track of which fieldset we're working with
  renderCurrentSection();
  selectField(field);
}

function createField(type) {
  fieldCounter++;
  const id = 'field_' + Date.now() + '_' + fieldCounter;
  const base = { id, type, label: getDefaultLabel(type), name: 'field_' + fieldCounter, required: false, width: 'auto', rowGroup: 1, height: 'auto' };

  switch (type) {
    case 'text': case 'email': case 'number': case 'tel':
      return { ...base, placeholder: '' };
    case 'date':
      return { ...base };
    case 'select':
      return { ...base, options: [{value:'opt1', label:'Option 1'}, {value:'opt2', label:'Option 2'}] };
    case 'radio':
      return { ...base, options: [{value:'yes', label:'Yes'}, {value:'no', label:'No'}] };
    case 'checkbox':
      return { ...base, label: 'Checkbox field', options: [{value:'chk1', label:'Check 1'}] };
    case 'textarea':
      return { ...base, placeholder: '', rows: 3 };
    case 'table':
      return {
        ...base,
        label: 'Evaluation Table',
        columns: ['Item', 'Pass', 'Fail', 'Notes'],
        columnTypes: ['text', 'checkbox', 'checkbox', 'text'],
        rows: [
          { id: 'row_' + Date.now() + '_1', label: 'Item 1', name: 'item_1' },
          { id: 'row_' + Date.now() + '_2', label: 'Item 2', name: 'item_2' }
        ]
      };
    case 'signature':
      return { ...base, label: 'Signature' };
    case 'heading':
      return { ...base, label: 'Section Heading', level: 'h3' };
    case 'infoblock':
      return { ...base, label: 'Info Block', content: '<ul><li>Item 1</li><li>Item 2</li></ul>', width: '100' };
    case 'db_crewName':
      return { ...base, label: 'Crew Name', dbSource: 'crewName', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_crewId':
      return { ...base, label: 'Crew ID', dbSource: 'crewId', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_crewLicense':
      return { ...base, label: 'License Number', dbSource: 'crewLicense', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_crew3lc':
      return { ...base, label: 'Crew 3LC', dbSource: 'crew3lc', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_instructorTri':
      return { ...base, label: 'Instructors', dbSource: 'instructorTri', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_examinerTre':
      return { ...base, label: 'Examiners', dbSource: 'examinerTre', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_pilotPosition':
      return { ...base, label: 'Pilot Position', dbSource: 'pilotPosition', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_location':
      return { ...base, label: 'Location', dbSource: 'location', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_trainingType':
      return { ...base, label: 'Type of Training', dbSource: 'trainingType', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_fstdId':
      return { ...base, label: 'FSTD ID', dbSource: 'fstdId', options: [{value:'', label:'-- Select from database --'}] };
    default:
      return base;
  }
}

function getDefaultLabel(type) {
  const labels = {
    text: 'Text Field', email: 'Email', number: 'Number', date: 'Date',
    tel: 'Phone', select: 'Dropdown', radio: 'Radio Group',
    checkbox: 'Checkbox Group', textarea: 'Text Area',
    table: 'Table', signature: 'Signature', heading: 'Heading',
    db_crewName: 'Crew Name', db_crewId: 'Crew ID', db_crewLicense: 'License Number',
    db_crew3lc: 'Crew 3LC', db_instructorTri: 'Instructors', db_pilotPosition: 'Pilot Position',
    db_trainingType: 'Type of Training', db_fstdId: 'FSTD ID'
  };
  return labels[type] || 'Field';
}

// ===== RENDER =====
function renderCurrentSection() {
  const container = document.querySelector('#section-' + currentSection + ' .field-container');
  container.innerHTML = '';
  const fieldsets = currentForm.config.sections[currentSection];

  if (!fieldsets.length) {
    const hint = document.createElement('p');
    hint.className = 'drop-hint';
    hint.textContent = 'Add a sub-section to start adding fields';
    container.appendChild(hint);
    return;
  }

  fieldsets.forEach(fs => renderFieldset(fs));
  updateLivePreview();
}

function renderFieldset(fs) {
  const container = document.querySelector('#section-' + currentSection + ' .field-container');

  const fsEl = document.createElement('div');
  fsEl.className = 'fieldset-block';
  fsEl.dataset.id = fs.id;
  
  // Apply background image if set
  if (fs.bgImage) {
    const opacity = (fs.bgOpacity !== undefined ? fs.bgOpacity : 15) / 100;
    fsEl.style.backgroundImage = `url(${fs.bgImage})`;
    fsEl.style.backgroundSize = fs.bgSize || 'cover';
    fsEl.style.backgroundPosition = 'center';
    fsEl.style.backgroundRepeat = 'no-repeat';
    fsEl.style.position = 'relative';
    
    // Add overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,${1 - opacity}); z-index: 0; pointer-events: none;`;
    fsEl.appendChild(overlay);
  }

  // Header
  const header = document.createElement('div');
  header.className = 'fieldset-header';
  header.dataset.id = fs.id;
  header.innerHTML = `
    <span class="fieldset-title-text">${esc(fs.title)}</span>
    <div class="fieldset-actions">
      <button class="move-btn" onclick="event.stopPropagation(); moveFieldset('${fs.id}', -1)">↑</button>
      <button class="move-btn" onclick="event.stopPropagation(); moveFieldset('${fs.id}', 1)">↓</button>
      <button class="delete-btn" onclick="event.stopPropagation(); deleteFieldset('${fs.id}')">✕</button>
    </div>
  `;
  header.addEventListener('click', (e) => {
    if (e.target.closest('.fieldset-actions')) return;
    selectFieldset(fs);
  });
  fsEl.appendChild(header);

  // Fields container (drop zone)
  const fieldsDiv = document.createElement('div');
  fieldsDiv.className = 'fieldset-fields';
  fieldsDiv.addEventListener('dragover', e => e.preventDefault());
  fieldsDiv.addEventListener('drop', e => {
    e.preventDefault();
    const type = e.dataTransfer.getData('fieldType');
    const tableId = e.dataTransfer.getData('tableId');
    if (tableId) {
      // Load saved table and add it
      fetch(`/api/saved-tables/${tableId}`)
        .then(r => r.json())
        .then(data => {
          const tableField = data.config;
          tableField.id = 'table_' + Date.now();
          const fieldset = currentForm.config.sections[currentSection].find(f => f.id === fs.id);
          if (fieldset) {
            fieldset.fields.push(tableField);
            renderFieldset(fieldset);
            updateLivePreview();
          }
        })
        .catch(err => console.error(err));
    } else if (type) {
      selectedFieldsetId = fs.id;
      addField(type);
    }
  });

  if (!fs.fields.length) {
    const hint = document.createElement('p');
    hint.className = 'drop-hint';
    hint.textContent = 'Drag fields here or click to add ⬅️';
    fieldsDiv.appendChild(hint);
  }

  fs.fields.forEach(field => {
    const el = document.createElement('div');
    el.className = 'builder-field' + (selectedField && selectedField.id === field.id ? ' selected' : '');
    el.dataset.id = field.id;
    el.style.position = 'relative';
    el.innerHTML = `
      <div class="field-type-tag">${field.type}</div>
      <div class="field-label">${esc(field.label)}</div>
      <div class="field-actions">
        <button class="move-btn" onclick="event.stopPropagation(); moveField('${field.id}', -1)">↑</button>
        <button class="move-btn" onclick="event.stopPropagation(); moveField('${field.id}', 1)">↓</button>
        <button class="delete-btn" onclick="event.stopPropagation(); deleteField('${field.id}')">✕</button>
      </div>
      <div class="resize-handle resize-handle-e" data-handle="e"></div>
      <div class="resize-handle resize-handle-s" data-handle="s"></div>
      <div class="resize-handle resize-handle-se" data-handle="se"></div>
      <div class="resize-info"></div>
    `;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.field-actions') || e.target.classList.contains('resize-handle')) return;
      selectedFieldsetId = fs.id;
      selectField(field);
    });
    // Resize handlers
    const resizeE = el.querySelector('.resize-handle-e');
    const resizeS = el.querySelector('.resize-handle-s');
    const resizeSE = el.querySelector('.resize-handle-se');
    const resizeInfo = el.querySelector('.resize-info');
    if (resizeE) setupResize(resizeE, field, 'width', resizeInfo);
    if (resizeS) setupResize(resizeS, field, 'height', resizeInfo);
    if (resizeSE) setupResize(resizeSE, field, 'both', resizeInfo);
    fieldsDiv.appendChild(el);
  });

  fsEl.appendChild(fieldsDiv);
  container.appendChild(fsEl);
}

// ===== FIELD SELECTION =====
function selectField(field) {
  selectedField = field;
  document.querySelectorAll('.builder-field').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.fieldset-header').forEach(el => el.classList.remove('selected'));
  const el = document.querySelector(`.builder-field[data-id="${field.id}"]`);
  if (el) el.classList.add('selected');
  renderProperties(field);
}

function renderProperties(field) {
  const panel = document.getElementById('propertiesContent');
  let html = '';

  html += propGroup('Label', `<input type="text" id="prop_label" value="${esc(field.label)}" oninput="updateField('label', this.value)">`);
  html += propGroup('Name', `<input type="text" id="prop_name" value="${esc(field.name)}" oninput="updateField('name', this.value)">`);

  if (field.type !== 'heading') {
    html += propGroup('Required', `<label><input type="checkbox" id="prop_required" ${field.required ? 'checked' : ''} onchange="updateField('required', this.checked)"> Required field</label>`);
    const currentWidth = field.width === 'auto' || !field.width ? 100 : parseInt(field.width);
    html += propGroup('Width (%)', `<div style="display:flex;gap:8px;align-items:center;">
        <input type="range" id="prop_width" min="5" max="100" value="${currentWidth}"
          oninput="updateField('width', this.value); document.getElementById('widthValue').textContent = this.value + '%'; document.getElementById('widthInput').value = this.value;"
          style="flex:1;margin:4px 0;"
        >
        <input type="number" id="widthInput" min="5" max="100" value="${currentWidth}" style="width:60px;padding:4px 8px;border:1px solid #e2e8f0;border-radius:4px;text-align:center;"
          oninput="const val = Math.max(5, Math.min(100, parseInt(this.value) || 5)); updateField('width', val.toString()); document.getElementById('prop_width').value = val; document.getElementById('widthValue').textContent = val + '%';"
        >
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#94a3b8;">
        <span>5%</span><span id="widthValue">${currentWidth}%</span><span>100%</span>
      </div>
`);
    const heightLines = {auto: 1, small: 2, medium: 4, large: 6, xlarge: 10};
    const currentLines = field.height && heightLines[field.height] ? heightLines[field.height] : 1;
    html += propGroup('Height (lines)', `<div style="display:flex;gap:8px;align-items:center;">
        <input type="range" id="prop_height_lines" min="1" max="10" value="${currentLines}"
          oninput="const val = parseInt(this.value); let h = 'auto'; if(val >= 8) h = 'xlarge'; else if(val >= 6) h = 'large'; else if(val >= 4) h = 'medium'; else if(val >= 2) h = 'small'; updateField('height', h); document.getElementById('heightValue').textContent = val + ' lines'; document.getElementById('heightInput').value = val;"
          style="flex:1;margin:4px 0;"
        >
        <input type="number" id="heightInput" min="1" max="10" value="${currentLines}" style="width:60px;padding:4px 8px;border:1px solid #e2e8f0;border-radius:4px;text-align:center;"
          oninput="const val = Math.max(1, Math.min(10, parseInt(this.value) || 1)); let h = 'auto'; if(val >= 8) h = 'xlarge'; else if(val >= 6) h = 'large'; else if(val >= 4) h = 'medium'; else if(val >= 2) h = 'small'; updateField('height', h); document.getElementById('prop_height_lines').value = val; document.getElementById('heightValue').textContent = val + ' lines';"
        >
      </div>
      <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#94a3b8;">
        <span>1 line</span><span id="heightValue">${currentLines} lines</span><span>10 lines</span>
      </div>`);

    // Font Style
    const fontStyle = field.fontStyle || 'normal';
    const fontSize = field.fontSize || 'normal';
    html += propGroup('Font Style', `<select id="prop_fontStyle" onchange="updateField('fontStyle',this.value)" style="width:100%;padding:6px;border:1px solid #e2e8f0;border-radius:4px;">
        <option value="normal" ${fontStyle==='normal'?'selected':''}>Regular</option>
        <option value="bold" ${fontStyle==='bold'?'selected':''}>Bold</option>
        <option value="italic" ${fontStyle==='italic'?'selected':''}>Italic</option>
        <option value="bold-italic" ${fontStyle==='bold-italic'?'selected':''}>Bold + Italic</option>
      </select>`);
    html += propGroup('Font Size', `<select id="prop_fontSize" onchange="updateField('fontSize',this.value)" style="width:100%;padding:6px;border:1px solid #e2e8f0;border-radius:4px;">
        <option value="small" ${fontSize==='small'?'selected':''}>Small (12px)</option>
        <option value="normal" ${fontSize==='normal'?'selected':''}>Normal (14px)</option>
        <option value="large" ${fontSize==='large'?'selected':''}>Large (16px)</option>
        <option value="xlarge" ${fontSize==='xlarge'?'selected':''}>X-Large (18px)</option>
      </select>`);

    // Move field between fieldsets
    const currentFieldsets = currentForm.config.sections[currentSection];
    const currentFieldset = currentFieldsets.find(fs => fs.fields.some(f => f.id === field.id));
    if (currentFieldsets.length > 1) {
      html += propGroup('Move to Sub-section', `<select onchange="moveFieldToFieldset('${field.id}', this.value)">
        <option value="">-- Select sub-section --</option>
        ${currentFieldsets.map(fs => `<option value="${fs.id}" ${currentFieldset && fs.id === currentFieldset.id ? 'selected' : ''}>${esc(fs.title)}</option>`).join('')}
      </select>`);
    }
  }
    html += propGroup('Row Group', `<div style="display:flex;gap:4px;align-items:center;">
        <input type="text" id="prop_rowGroup" value="${field.rowGroup || 1}" readonly style="width:60px;text-align:center;padding:4px 8px;border:1px solid #e2e8f0;border-radius:4px;"
        >
        <button onclick="decrementRowGroup()" style="padding:4px 8px;border:1px solid #e2e8f0;border-radius:4px;background:#f8fafc;cursor:pointer;font-size:0.8rem;" title="Descend (move to lower row group)"
        >↑</button>
        <button onclick="incrementRowGroup()" style="padding:4px 8px;border:1px solid #e2e8f0;border-radius:4px;background:#f8fafc;cursor:pointer;font-size:0.8rem;" title="Ascend (move to higher row group)"
        >↓</button>
      </div>`);

  if (field.placeholder !== undefined) {
    html += propGroup('Placeholder', `<input type="text" id="prop_placeholder" value="${esc(field.placeholder || '')}" oninput="updateField('placeholder', this.value)">`);
  }

  if (field.type === 'select' || field.type === 'radio' || field.type === 'checkbox') {
    html += `<div class="prop-group">
      <label>Options</label>
      <div class="options-list" id="optionsList">`;
    field.options?.forEach((opt, i) => {
      html += `<div class="option-row">
        <input type="text" value="${esc(opt.value)}" placeholder="Value" onchange="updateOption(${i}, 'value', this.value)">
        <input type="text" value="${esc(opt.label)}" placeholder="Label" onchange="updateOption(${i}, 'label', this.value)">
        <button onclick="removeOption(${i})">✕</button>
      </div>`;
    });
    html += `</div><button class="add-option-btn" onclick="addOption()">+ Add Option</button>
    </div>`;
  }

  if (field.type === 'table') {
    html += `<div class="prop-group">
      <label>Columns</label>
      <div class="options-list" id="columnsList">`;
    field.columns?.forEach((col, i) => {
      html += `<div class="option-row" draggable="true" data-col-index="${i}" data-col-id="col_${i}">
        <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
        <input type="text" value="${esc(col)}" placeholder="Column ${i+1} name" onchange="updateTableColumn(${i}, this.value)" style="min-width:100px;">
        <select onchange="updateTableColumnType(${i}, this.value)">
          <option value="text" ${(field.columnTypes?.[i] || 'text') === 'text' ? 'selected' : ''}>Text</option>
          <option value="multiline" ${field.columnTypes?.[i] === 'multiline' ? 'selected' : ''}>Multi-line</option>
          <option value="radio" ${field.columnTypes?.[i] === 'radio' ? 'selected' : ''}>Radio</option>
          <option value="checkbox" ${field.columnTypes?.[i] === 'checkbox' ? 'selected' : ''}>Checkbox</option>
          <option value="number" ${field.columnTypes?.[i] === 'number' ? 'selected' : ''}>Number</option>
          <option value="signature" ${field.columnTypes?.[i] === 'signature' ? 'selected' : ''}>Signature</option>
        </select>
        <input type="text" value="${field.columnWidths?.[i] || ''}" placeholder="Width" style="width:50px;text-align:center;padding:4px 8px;border:1px solid #e2e8f0;border-radius:4px;" onchange="updateTableColumnWidth(${i}, this.value)" title="e.g. 20%, 150px, auto">
        <select onchange="updateTableColumnSigHeight(${i}, this.value)" title="Signature height (rows)">
          <option value="1row" ${(field.columnSigHeights?.[i] || '2row') === '1row' ? 'selected' : ''}>1 row</option>
          <option value="2row" ${(field.columnSigHeights?.[i] || '2row') === '2row' ? 'selected' : ''}>2 rows</option>
          <option value="3row" ${field.columnSigHeights?.[i] === '3row' ? 'selected' : ''}>3 rows</option>
          <option value="4row" ${field.columnSigHeights?.[i] === '4row' ? 'selected' : ''}>4 rows</option>
          <option value="5row" ${field.columnSigHeights?.[i] === '5row' ? 'selected' : ''}>5 rows</option>
        </select>
        <input type="number" value="${field.columnRows?.[i] || 2}" min="1" max="10" placeholder="Rows" style="width:45px;text-align:center;padding:4px 8px;border:1px solid #e2e8f0;border-radius:4px;" onchange="updateTableColumnRows(${i}, this.value)" title="Multi-line rows (default 2)"
        <select onchange="updateTableColumnStyle(${i}, 'fontWeight', this.value)" title="Font weight" style="padding:4px;border:1px solid #e2e8f0;border-radius:4px;">
          <option value="normal" ${(field.columnStyles?.[i]?.fontWeight || 'normal') === 'normal' ? 'selected' : ''}>Regular</option>
          <option value="bold" ${field.columnStyles?.[i]?.fontWeight === 'bold' ? 'selected' : ''}>Bold</option>
        </select>
        <select onchange="updateTableColumnStyle(${i}, 'fontStyle', this.value)" title="Font style" style="padding:4px;border:1px solid #e2e8f0;border-radius:4px;">
          <option value="normal" ${(field.columnStyles?.[i]?.fontStyle || 'normal') === 'normal' ? 'selected' : ''}>Normal</option>
          <option value="italic" ${field.columnStyles?.[i]?.fontStyle === 'italic' ? 'selected' : ''}>Italic</option>
        </select>
        <select onchange="updateTableColumnStyle(${i}, 'fontSize', this.value)" title="Font size" style="padding:4px;border:1px solid #e2e8f0;border-radius:4px;">
          <option value="small" ${(field.columnStyles?.[i]?.fontSize || 'normal') === 'small' ? 'selected' : ''}>S</option>
          <option value="normal" ${(field.columnStyles?.[i]?.fontSize || 'normal') === 'normal' ? 'selected' : ''}>M</option>
          <option value="large" ${field.columnStyles?.[i]?.fontSize === 'large' ? 'selected' : ''}>L</option>
        </select>
        <button onclick="moveTableColumn(${i}, -1)" title="Move Up">↑</button>
        <button onclick="moveTableColumn(${i}, 1)" title="Move Down">↓</button>
        <button onclick="removeTableColumn(${i})">✕</button>
      </div>`;
    });
    html += `<button class="add-option-btn" onclick="addTableColumn()">+ Add Column</button>
      </div>
    </div>`;

    html += `<div class="prop-group">
      <label>Rows (each row is a field)</label>
      <div class="options-list" id="rowsList">`;
    field.rows?.forEach((row, i) => {
      html += `<div class="option-row" draggable="true" data-row-index="${i}">
        <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
        <textarea placeholder="Row label" oninput="updateTableRowLabel(${i}, this.value)" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.blur();}" style="min-width:150px;min-height:36px;resize:vertical;">${esc(row.label || row)}</textarea>
        <input type="text" value="${esc(row.name || ('row_' + (i+1)))}" placeholder="Field name" style="width:120px;min-width:120px;" onchange="updateTableRowName(${i}, this.value)">
        <select onchange="updateTableRowStyle(${i}, 'fontStyle', this.value)" title="Font Style" style="padding:4px;border:1px solid #e2e8f0;border-radius:4px;font-size:0.8rem;">
          <option value="normal" ${(row.rowStyles?.fontStyle || 'normal') === 'normal' ? 'selected' : ''}>Regular</option>
          <option value="bold" ${row.rowStyles?.fontStyle === 'bold' ? 'selected' : ''}>Bold</option>
          <option value="italic" ${row.rowStyles?.fontStyle === 'italic' ? 'selected' : ''}>Italic</option>
          <option value="bold-italic" ${row.rowStyles?.fontStyle === 'bold-italic' ? 'selected' : ''}>B+I</option>
        </select>
        <select onchange="updateTableRowStyle(${i}, 'fontSize', this.value)" title="Font Size" style="padding:4px;border:1px solid #e2e8f0;border-radius:4px;font-size:0.8rem;">
          <option value="small" ${(row.rowStyles?.fontSize || 'normal') === 'small' ? 'selected' : ''}>S</option>
          <option value="normal" ${(row.rowStyles?.fontSize || 'normal') === 'normal' ? 'selected' : ''}>M</option>
          <option value="large" ${row.rowStyles?.fontSize === 'large' ? 'selected' : ''}>L</option>
          <option value="xlarge" ${row.rowStyles?.fontSize === 'xlarge' ? 'selected' : ''}>XL</option>
        </select>
        <button onclick="moveTableRow(${i}, -1)">↑</button>
        <button onclick="moveTableRow(${i}, 1)">↓</button>
        <button onclick="removeTableRow(${i})">✕</button>
      </div>`;
    });
    html += `<button class="add-option-btn" onclick="addTableRow()">+ Add Row</button>
      </div>
    </div>`;
  }

  if (field.type === 'textarea') {
    html += propGroup('Rows', `<input type="number" id="prop_rows" value="${field.rows || 3}" onchange="updateField('rows', parseInt(this.value))">`);
  }

  if (field.type === 'heading') {
    html += propGroup('Heading Level', `<select id="prop_level" onchange="updateField('level', this.value)">
      <option value="h2" ${field.level === 'h2' ? 'selected' : ''}>H2</option>
      <option value="h3" ${field.level === 'h3' ? 'selected' : ''}>H3</option>
      <option value="h4" ${field.level === 'h4' ? 'selected' : ''}>H4</option>
    </select>`);
  }
  if (field.type === 'infoblock') {
    const contentType = field.contentType || 'text';
    html += propGroup('Content Type', `<select id="prop_contentType" onchange="updateField('contentType',this.value);showContentType('${field.id}',this.value)">
        <option value="text" ${contentType==='text'?'selected':''}>Visual Editor</option>
        <option value="html" ${contentType==='html'?'selected':''}>HTML Code</option>
      </select>`);
    if (contentType === 'html') {
      html += propGroup('Content (HTML)', `<textarea id="prop_content" rows="8" oninput="updateField('content', this.value)" style="font-family:monospace;font-size:0.85rem;">${esc(field.content || '')}</textarea>`);
    } else {
      const toolbarId = 'toolbar_' + field.id;
      const editorId = 'editor_' + field.id;
      html += `<div class="prop-group">
        <label>Content</label>
        <div id="${toolbarId}_bar" class="editor-menubar">
          <div class="editor-menu-item" data-menu="file">File ▾</div>
          <div class="editor-menu-item" data-menu="edit">Edit ▾</div>
          <div class="editor-menu-item" data-menu="insert">Insert ▾</div>
          <div class="editor-menu-item" data-menu="view">View ▾</div>
          <div class="editor-menu-item" data-menu="format">Format ▾</div>
          <div class="editor-menu-item" data-menu="table">Table ▾</div>
          <div class="editor-menu-item" data-menu="tools">Tools ▾</div>
        </div>
        <div class="editor-dropdown-container" id="${toolbarId}_menus">
          <div class="editor-dropdown" data-menu="file">
            <div class="editor-dropdown-item" data-cmd="new">📄 New document</div>
            <div class="editor-dropdown-item" data-cmd="source">📄 Source code</div>
          </div>
          <div class="editor-dropdown" data-menu="edit">
            <div class="editor-dropdown-item" data-cmd="undo">↩ Undo</div>
            <div class="editor-dropdown-item" data-cmd="redo">↪ Redo</div>
            <div class="editor-dropdown-separator"></div>
            <div class="editor-dropdown-item" data-cmd="cut">✂ Cut</div>
            <div class="editor-dropdown-item" data-cmd="copy">📋 Copy</div>
            <div class="editor-dropdown-item" data-cmd="paste">📄 Paste</div>
            <div class="editor-dropdown-separator"></div>
            <div class="editor-dropdown-item" data-cmd="selectAll">☑ Select all</div>
            <div class="editor-dropdown-item" data-cmd="find">🔍 Find and replace</div>
          </div>
          <div class="editor-dropdown" data-menu="insert">
            <div class="editor-dropdown-item" data-cmd="link">🔗 Insert/edit link</div>
            <div class="editor-dropdown-item" data-cmd="image">🖼️ Insert/edit image</div>
            <div class="editor-dropdown-item" data-cmd="video">🎬 Insert/edit video</div>
            <div class="editor-dropdown-separator"></div>
            <div class="editor-dropdown-item" data-cmd="specialChar">Ω Special character</div>
            <div class="editor-dropdown-item" data-cmd="hr">— Horizontal line</div>
            <div class="editor-dropdown-item" data-cmd="nbsp">␣ Nonbreaking space</div>
            <div class="editor-dropdown-item" data-cmd="anchor">⚓ Anchor</div>
            <div class="editor-dropdown-item" data-cmd="datetime">🕐 Insert date/time</div>
          </div>
          <div class="editor-dropdown" data-menu="view">
            <div class="editor-dropdown-item" data-cmd="showBlocks">▢ Show invisible characters</div>
            <div class="editor-dropdown-item" data-cmd="showBlocks">▢ Show blocks</div>
            <div class="editor-dropdown-item" data-cmd="visualAids">✓ Visual aids</div>
            <div class="editor-dropdown-separator"></div>
            <div class="editor-dropdown-item" data-cmd="preview">👁 Preview</div>
            <div class="editor-dropdown-item" data-cmd="fullscreen">⛶ Fullscreen</div>
          </div>
          <div class="editor-dropdown" data-menu="format">
            <div class="editor-dropdown-item" data-cmd="bold"><b>B</b> Bold</div>
            <div class="editor-dropdown-item" data-cmd="italic"><i>I</i> Italic</div>
            <div class="editor-dropdown-item" data-cmd="underline"><u>U</u> Underline</div>
            <div class="editor-dropdown-item" data-cmd="strikeThrough"><s>S</s> Strikethrough</div>
            <div class="editor-dropdown-separator"></div>
            <div class="editor-dropdown-item" data-cmd="superscript">X² Superscript</div>
            <div class="editor-dropdown-item" data-cmd="subscript">X₂ Subscript</div>
            <div class="editor-dropdown-separator"></div>
            <div class="editor-dropdown-submenu">
              <div class="editor-dropdown-item">▸ Formats ▾</div>
              <div class="editor-dropdown" style="left:100%;top:0;">
                <div class="editor-dropdown-item" data-cmd="formatBlock" data-val="H3">H3 Heading</div>
                <div class="editor-dropdown-item" data-cmd="formatBlock" data-val="H4">H4 Heading</div>
                <div class="editor-dropdown-item" data-cmd="formatBlock" data-val="P">P Paragraph</div>
              </div>
            </div>
            <div class="editor-dropdown-separator"></div>
            <div class="editor-dropdown-item" data-cmd="insertUnorderedList">• Bullet list</div>
            <div class="editor-dropdown-item" data-cmd="insertOrderedList">1. Numbered list</div>
            <div class="editor-dropdown-separator"></div>
            <div class="editor-dropdown-item" data-cmd="removeFormat">Ix Clear formatting</div>
          </div>
          <div class="editor-dropdown" data-menu="table">
            <div class="editor-dropdown-submenu">
              <div class="editor-dropdown-item">⊞ Insert table ▾</div>
              <div class="editor-dropdown table-grid-dropdown" style="left:100%;top:0;display:none;">
                <div class="table-grid-info">1 × 1</div>
                <div class="table-grid"></div>
              </div>
            </div>
            <div class="editor-dropdown-item" data-cmd="tableProp">Table properties</div>
            <div class="editor-dropdown-item" data-cmd="deleteTable">🗑 Delete table</div>
            <div class="editor-dropdown-separator"></div>
            <div class="editor-dropdown-submenu">
              <div class="editor-dropdown-item">Cell ▾</div>
              <div class="editor-dropdown" style="left:100%;top:0;">
                <div class="editor-dropdown-item" data-cmd="cellProp">Cell properties</div>
                <div class="editor-dropdown-item" data-cmd="mergeCells">Merge cells</div>
                <div class="editor-dropdown-item" data-cmd="splitCell">Split cell</div>
              </div>
            </div>
            <div class="editor-dropdown-submenu">
              <div class="editor-dropdown-item">Row ▾</div>
              <div class="editor-dropdown" style="left:100%;top:0;">
                <div class="editor-dropdown-item" data-cmd="insertRowAbove">Insert row before</div>
                <div class="editor-dropdown-item" data-cmd="insertRowBelow">Insert row after</div>
                <div class="editor-dropdown-item" data-cmd="deleteRow">Delete row</div>
                <div class="editor-dropdown-item" data-cmd="rowProp">Row properties</div>
                <div class="editor-dropdown-separator"></div>
                <div class="editor-dropdown-item" data-cmd="cutRow">Cut row</div>
                <div class="editor-dropdown-item" data-cmd="copyRow">Copy row</div>
                <div class="editor-dropdown-item" data-cmd="pasteRowAbove">Paste row before</div>
                <div class="editor-dropdown-item" data-cmd="pasteRowBelow">Paste row after</div>
              </div>
            </div>
            <div class="editor-dropdown-submenu">
              <div class="editor-dropdown-item">Column ▾</div>
              <div class="editor-dropdown" style="left:100%;top:0;">
                <div class="editor-dropdown-item" data-cmd="insertColBefore">Insert column before</div>
                <div class="editor-dropdown-item" data-cmd="insertColAfter">Insert column after</div>
                <div class="editor-dropdown-item" data-cmd="deleteCol">Delete column</div>
              </div>
            </div>
          </div>
          <div class="editor-dropdown" data-menu="tools">
            <div class="editor-dropdown-item" data-cmd="source"><> Source code</div>
          </div>
        </div>
        <div class="editor-toolbar">
          <button data-cmd="bold" title="Bold" class="style-btn"><b>B</b></button>
          <button data-cmd="italic" title="Italic" class="style-btn"><i>I</i></button>
          <button data-cmd="underline" title="Underline" class="style-btn"><u>U</u></button>
          <span class="toolbar-sep"></span>
          <button data-cmd="insertUnorderedList" title="Bullet list" class="style-btn">•</button>
          <button data-cmd="insertOrderedList" title="Numbered list" class="style-btn">1.</button>
          <span class="toolbar-sep"></span>
          <button data-cmd="formatBlock" data-val="H3" title="H3" class="style-btn">H3</button>
          <button data-cmd="formatBlock" data-val="H4" title="H4" class="style-btn">H4</button>
          <span class="toolbar-sep"></span>
          <button data-cmd="justifyLeft" title="Align left" class="style-btn">⫷</button>
          <button data-cmd="justifyCenter" title="Center" class="style-btn">☰</button>
          <button data-cmd="justifyRight" title="Align right" class="style-btn">⫸</button>
          <span class="toolbar-sep"></span>
          <button data-cmd="table" title="Insert table" class="style-btn">⊞</button>
          <button data-cmd="link" title="Insert link" class="style-btn">🔗</button>
          <button data-cmd="image" title="Insert image" class="style-btn">🖼</button>
        </div>
        <div id="${editorId}" contenteditable="true" style="min-height:120px;padding:8px;border:2px solid #e2e8f0;border-radius:6px;background:#fff;">${field.content || ''}</div>
        <textarea id="prop_content" style="display:none;">${esc(field.content || '')}</textarea>
      </div>`;
    }
  }

  panel.innerHTML = html;
}

function propGroup(label, content) {
  return `<div class="prop-group"><label>${label}</label>${content}</div>`;
}

function updateField(key, value) {
  if (!selectedField) return;
  selectedField[key] = value;
  if (key === 'label') {
    const el = document.querySelector(`.builder-field[data-id="${selectedField.id}"] .field-label`);
    if (el) el.textContent = value;
  }
}

function highlightStyleBtn(btn, prop) {
  btn.parentElement.querySelectorAll('.style-btn').forEach(b => { b.style.background = '#f8fafc'; b.style.color = '#475569'; });
  btn.style.background = '#1a365d'; btn.style.color = '#fff';
}

function execCmd(command, value) {
  document.execCommand(command, false, value || null);
}

// ===== WYSIWYG EDITOR MENU SYSTEM =====
let currentEditorMenu = null;

document.addEventListener('click', function(e) {
  const menuItem = e.target.closest('.editor-menu-item');
  if (menuItem && menuItem.dataset.menu) {
    e.stopPropagation();
    const menuName = menuItem.dataset.menu;
    const bar = menuItem.closest('.editor-menubar') || menuItem.closest('.editor-toolbar');
    if (!bar) return;
    const container = bar.parentElement.querySelector('.editor-dropdown-container');
    if (!container) return;
    const dropdown = container.querySelector(`.editor-dropdown[data-menu="${menuName}"]`);
    if (!dropdown) return;
    // Close all other menus
    container.querySelectorAll('.editor-dropdown').forEach(d => { if (d !== dropdown) d.style.display = 'none'; });
    if (dropdown.style.display === 'block') {
      dropdown.style.display = 'none';
    } else {
      dropdown.style.display = 'block';
    }
    return;
  }
  
  const item = e.target.closest('.editor-dropdown-item');
  if (item && item.dataset.cmd) {
    e.stopPropagation();
    const cmd = item.dataset.cmd;
    const val = item.dataset.val || null;
    const editor = item.closest('.prop-group').querySelector('[contenteditable]');
    if (!editor) return;
    editor.focus();
    
    // Close all menus
    document.querySelectorAll('.editor-dropdown').forEach(d => d.style.display = 'none');
    
    switch(cmd) {
      case 'bold': case 'italic': case 'underline': case 'strikeThrough':
      case 'superscript': case 'subscript':
      case 'insertUnorderedList': case 'insertOrderedList':
      case 'justifyLeft': case 'justifyCenter': case 'justifyRight':
      case 'undo': case 'redo': case 'cut': case 'copy':
      case 'selectAll': case 'removeFormat':
      case 'insertHorizontalRule':
        document.execCommand(cmd, false, null);
        break;
      case 'formatBlock':
        document.execCommand('formatBlock', false, val || 'P');
        break;
      case 'new':
        if (confirm('Clear all content?')) {
          editor.innerHTML = '';
          editor.dispatchEvent(new Event('input'));
        }
        break;
      case 'source':
        toggleSourceCode(editor.id);
        break;
      case 'link':
        insertLink(editor.id);
        break;
      case 'image':
        insertImage(editor.id);
        break;
      case 'video':
        insertVideo(editor.id);
        break;
      case 'hr':
        document.execCommand('insertHorizontalRule', false, null);
        break;
      case 'specialChar':
        insertSpecialChar(editor.id);
        break;
      case 'nbsp':
        document.execCommand('insertText', false, '\u00A0');
        break;
      case 'datetime':
        const now = new Date();
        document.execCommand('insertText', false, now.toLocaleString());
        break;
      case 'anchor':
        const name = prompt('Anchor name:');
        if (name) document.execCommand('insertHTML', false, `<a name="${esc(name)}"></a>`);
        break;
      case 'find':
        showFindReplace(editor.id);
        break;
      case 'preview':
        togglePreview(editor.id);
        break;
      case 'fullscreen':
        toggleFullscreen(editor.id);
        break;
      case 'showBlocks':
        editor.classList.toggle('show-blocks');
        break;
      case 'visualAids':
        editor.classList.toggle('visual-aids');
        break;
      // Table operations
      case 'insertRowAbove': tableAction('addRowAbove'); break;
      case 'insertRowBelow': tableAction('addRowBelow'); break;
      case 'deleteRow': tableAction('deleteRow'); break;
      case 'insertColBefore': tableAction('addColBefore'); break;
      case 'insertColAfter': tableAction('addColAfter'); break;
      case 'deleteCol': tableAction('deleteCol'); break;
      case 'mergeCells': tableAction('mergeCells'); break;
      case 'splitCell': tableAction('splitCell'); break;
      case 'deleteTable': tableAction('deleteTable'); break;
      case 'table':
        showInsertTable(editor.id);
        break;
    }
    // Update field content
    editor.dispatchEvent(new Event('input'));
    return;
  }
  
  // Close menus on click elsewhere
  if (!e.target.closest('.editor-menubar') && !e.target.closest('.editor-dropdown')) {
    document.querySelectorAll('.editor-dropdown').forEach(d => d.style.display = 'none');
  }
});

function toggleEditorMenu(menuName) {
  // legacy, unused now
}

function closeEditorMenus() {
  document.querySelectorAll('.editor-dropdown').forEach(d => d.style.display = 'none');
}

function showInsertTable(editorId) {
  // Find the toolbar bar and show table grid
  const editor = document.getElementById(editorId);
  if (!editor) return;
  const propGroup = editor.closest('.prop-group');
  const tableMenu = propGroup.querySelector('.editor-dropdown[data-menu="table"]');
  const grid = tableMenu?.querySelector('.table-grid-dropdown');
  if (!grid) {
    // Simple prompt fallback
    const rows = prompt('Number of rows:', '3');
    if (!rows) return;
    const cols = prompt('Number of columns:', '3');
    if (!cols) return;
    editor.focus();
    const tableHtml = '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin:8px 0;">' + Array(parseInt(rows)).fill().map(() => '<tr>' + Array(parseInt(cols)).fill('<td>&nbsp;</td>').join('') + '</tr>').join('') + '</table><p></p>';
    document.execCommand('insertHTML', false, tableHtml);
    editor.dispatchEvent(new Event('input'));
    return;
  }
  grid.style.display = grid.style.display === 'block' ? 'none' : 'block';
}

let currentEditorId = null;

tableAction = function(action) {
  const activeEl = document.activeElement;
  const editor = activeEl?.closest('.prop-group')?.querySelector('[contenteditable]') || activeEl;
  if (!editor || !editor.contentEditable) return;
  editor.focus();
  currentEditorId = editor.id;
  
  const sel = window.getSelection();
  let cell = sel?.anchorNode;
  while (cell && cell.nodeName !== 'TD' && cell.nodeName !== 'TH') {
    cell = cell.parentNode;
  }
  let row = cell?.parentNode;
  let table = cell?.closest('table');
  
  switch(action) {
    case 'addRowAbove':
      if (!row || !table) return;
      const newRowAbove = table.insertRow(row.rowIndex);
      for (let i = 0; i < row.cells.length; i++) {
        const newCell = newRowAbove.insertCell();
        newCell.innerHTML = '&nbsp;';
      }
      break;
    case 'addRowBelow':
      if (!row || !table) return;
      const newRowBelow = table.insertRow(row.rowIndex + 1);
      for (let i = 0; i < row.cells.length; i++) {
        const newCell = newRowBelow.insertCell();
        newCell.innerHTML = '&nbsp;';
      }
      break;
    case 'deleteRow':
      if (!row || !table) return;
      table.deleteRow(row.rowIndex);
      break;
    case 'addColBefore':
      if (!cell || !table) return;
      const colIdx = cell.cellIndex;
      table.querySelectorAll('tr').forEach(r => {
        const newCell = r.insertCell(colIdx);
        newCell.innerHTML = '&nbsp;';
      });
      break;
    case 'addColAfter':
      if (!cell || !table) return;
      const colIdxAfter = cell.cellIndex + 1;
      table.querySelectorAll('tr').forEach(r => {
        const newCell = r.insertCell(colIdxAfter);
        newCell.innerHTML = '&nbsp;';
      });
      break;
    case 'deleteCol':
      if (!cell || !table) return;
      const delIdx = cell.cellIndex;
      table.querySelectorAll('tr').forEach(r => {
        if (r.cells[delIdx]) r.deleteCell(delIdx);
      });
      break;
    case 'mergeCells':
      // Simple: merge selected cells (would need more complex handling)
      alert('Select cells and use Table > Merge cells');
      break;
    case 'splitCell':
      if (!cell) return;
      // Just split by inserting a break
      cell.innerHTML = '<div>&nbsp;</div><div>&nbsp;</div>';
      break;
    case 'deleteTable':
      if (!table) return;
      table.remove();
      break;
  }
  editor.dispatchEvent(new Event('input'));
};

function toggleSourceCode(editorId) {
  const editor = document.getElementById(editorId);
  if (!editor) return;
  const propGroup = editor.closest('.prop-group');
  let textarea = propGroup.querySelector('.source-code-area');
  if (textarea && textarea.style.display !== 'none') {
    // Switch back to visual
    editor.innerHTML = textarea.value;
    textarea.style.display = 'none';
    editor.style.display = 'block';
    editor.dispatchEvent(new Event('input'));
  } else {
    // Show source
    if (!textarea) {
      textarea = document.createElement('textarea');
      textarea.className = 'source-code-area';
      textarea.rows = 10;
      textarea.style.cssText = 'width:100%;font-family:monospace;font-size:0.85rem;padding:8px;border:2px solid #e2e8f0;border-radius:6px;background:#f8fafc;';
      propGroup.appendChild(textarea);
    }
    textarea.value = editor.innerHTML;
    textarea.style.display = 'block';
    editor.style.display = 'none';
  }
}

function insertLink(editorId) {
  const url = prompt('URL:', 'https://');
  if (!url) return;
  const text = prompt('Link text:', url);
  document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(text || url)}</a>`);
}

function insertImage(editorId) {
  const url = prompt('Image URL:', 'https://');
  if (!url) return;
  const alt = prompt('Alt text:', '');
  document.execCommand('insertHTML', false, `<img src="${esc(url)}" alt="${esc(alt || '')}" style="max-width:100%;">`);
}

function insertVideo(editorId) {
  const url = prompt('Video URL (YouTube embed or direct):', 'https://');
  if (!url) return;
  let embedUrl = url;
  if (url.includes('youtube.com/watch')) {
    embedUrl = url.replace('watch?v=', 'embed/');
  } else if (url.includes('youtu.be/')) {
    embedUrl = url.replace('youtu.be/', 'youtube.com/embed/');
  }
  document.execCommand('insertHTML', false, `<iframe src="${esc(embedUrl)}" width="560" height="315" style="max-width:100%;border:0;" allowfullscreen></iframe>`);
}

function insertSpecialChar(editorId) {
  const chars = '©®™°±²³µ×÷≠≤≥£¥€§¶¡¿«»·–—†‡•…′″€₢₣₤₥₦₧₵₶₷₸₹'.split('');
  const char = prompt('Type a character or paste from here:\n\n' + chars.join(' '), '');
  if (char) document.execCommand('insertText', false, char);
}

function showFindReplace(editorId) {
  const find = prompt('Find:');
  if (!find) return;
  const replace = prompt('Replace with:');
  if (replace === null) return;
  const editor = document.getElementById(editorId);
  if (!editor) return;
  editor.innerHTML = editor.innerHTML.replace(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replace);
  editor.dispatchEvent(new Event('input'));
}

function togglePreview(editorId) {
  const editor = document.getElementById(editorId);
  if (!editor) return;
  const propGroup = editor.closest('.prop-group');
  let preview = propGroup.querySelector('.preview-area');
  if (preview && preview.style.display !== 'none') {
    preview.style.display = 'none';
    editor.style.display = 'block';
  } else {
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'preview-area';
      preview.style.cssText = 'min-height:120px;padding:8px;border:2px solid #e2e8f0;border-radius:6px;background:#fff;';
      propGroup.appendChild(preview);
    }
    preview.innerHTML = '<div style="font-size:0.7rem;color:#94a3b8;margin-bottom:4px;">Preview:</div>' + editor.innerHTML;
    preview.style.display = 'block';
    editor.style.display = 'none';
  }
}

function toggleFullscreen(editorId) {
  const editor = document.getElementById(editorId);
  if (!editor) return;
  const propGroup = editor.closest('.prop-group');
  if (propGroup.classList.contains('fullscreen')) {
    propGroup.classList.remove('fullscreen');
    propGroup.style.cssText = '';
  } else {
    propGroup.classList.add('fullscreen');
    propGroup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:#fff;padding:16px;overflow:auto;';
  }
}

function showContentType(fieldId, type) {
  // Re-render properties panel
  selectField(selectedField);
}

function incrementRowGroup() {
  if (!selectedField) return;
  selectedField.rowGroup = (selectedField.rowGroup || 1) + 1;
  renderCurrentSection();
  renderProperties(selectedField);
}

function decrementRowGroup() {
  if (!selectedField) return;
  selectedField.rowGroup = Math.max(1, (selectedField.rowGroup || 1) - 1);
  renderCurrentSection();
  renderProperties(selectedField);
}

function moveFieldToFieldset(fieldId, targetFieldsetId) {
  if (!targetFieldsetId) return;
  const fieldsets = currentForm.config.sections[currentSection];
  let sourceFs = null;
  let targetFs = null;
  let fieldToMove = null;
  
  for (const fs of fieldsets) {
    const fieldIdx = fs.fields.findIndex(f => f.id === fieldId);
    if (fieldIdx !== -1) {
      sourceFs = fs;
      fieldToMove = fs.fields[fieldIdx];
      break;
    }
  }
  
  for (const fs of fieldsets) {
    if (fs.id === targetFieldsetId) {
      targetFs = fs;
      break;
    }
  }
  
  if (!sourceFs || !targetFs || !fieldToMove || sourceFs.id === targetFs.id) return;
  
  // Remove from source
  sourceFs.fields = sourceFs.fields.filter(f => f.id !== fieldId);
  // Add to target
  targetFs.fields.push(fieldToMove);
  selectedFieldsetId = targetFs.id;
  renderCurrentSection();
  selectField(fieldToMove);
}

function updateOption(idx, key, value) {
  if (!selectedField || !selectedField.options) return;
  selectedField.options[idx][key] = value;
}

function addOption() {
  if (!selectedField) return;
  if (!selectedField.options) selectedField.options = [];
  const n = selectedField.options.length + 1;
  selectedField.options.push({ value: 'opt' + n, label: 'Option ' + n });
  selectField(selectedField);
}

function removeOption(idx) {
  if (!selectedField || !selectedField.options) return;
  selectedField.options.splice(idx, 1);
  selectField(selectedField);
}

function deleteField(id) {
  const fs = findFieldsetContainingField(id);
  if (!fs) return;
  fs.fields = fs.fields.filter(f => f.id !== id);
  if (selectedField?.id === id) {
    selectedField = null;
    document.getElementById('propertiesContent').innerHTML = '<p class="hint">Select a field or sub-section to edit its properties</p>';
  }
  renderCurrentSection();
}

function moveField(id, dir) {
  const fs = findFieldsetContainingField(id);
  if (!fs) return;
  const idx = fs.fields.findIndex(f => f.id === id);
  if (idx === -1) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= fs.fields.length) return;
  [fs.fields[idx], fs.fields[newIdx]] = [fs.fields[newIdx], fs.fields[idx]];
  renderCurrentSection();
}

function findFieldsetContainingField(fieldId) {
  for (const sec of Object.values(currentForm.config.sections)) {
    for (const fs of sec) {
      if (fs.fields?.some(f => f.id === fieldId)) return fs;
    }
  }
  return null;
}

// ===== TABLE MANAGEMENT =====
function addTableColumn() {
  if (!selectedField || selectedField.type !== 'table') return;
  if (!selectedField.columns) selectedField.columns = [];
  if (!selectedField.columnTypes) selectedField.columnTypes = [];
  selectedField.columns.push('New Column');
  selectedField.columnTypes.push('text');
  selectField(selectedField);
}

function updateTableColumn(idx, value) {
  if (!selectedField || !selectedField.columns) return;
  selectedField.columns[idx] = value;
  selectField(selectedField);
}

function updateTableColumnType(idx, value) {
  if (!selectedField || !selectedField.columnTypes) return;
  selectedField.columnTypes[idx] = value;
  selectField(selectedField);
}

function updateTableColumnSigHeight(idx, value) {
  if (!selectedField) return;
  if (!selectedField.columnSigHeights) selectedField.columnSigHeights = [];
  selectedField.columnSigHeights[idx] = value;
  selectField(selectedField);
}

function updateTableColumnRows(idx, value) {
  if (!selectedField) return;
  if (!selectedField.columnRows) selectedField.columnRows = [];
  selectedField.columnRows[idx] = value;
  selectField(selectedField);
}

function updateTableColumnWidth(idx, value) {
  if (!selectedField) return;
  if (!selectedField.columnWidths) selectedField.columnWidths = [];
  selectedField.columnWidths[idx] = value;
  selectField(selectedField);
}

function updateTableColumnStyle(idx, prop, value) {
  if (!selectedField) return;
  if (!selectedField.columnStyles) selectedField.columnStyles = [];
  if (!selectedField.columnStyles[idx]) selectedField.columnStyles[idx] = {};
  selectedField.columnStyles[idx][prop] = value;
  selectField(selectedField);
}

function updateTableRowStyle(idx, prop, value) {
  if (!selectedField) return;
  if (!selectedField.rowStyles) selectedField.rowStyles = [];
  if (!selectedField.rowStyles[idx]) selectedField.rowStyles[idx] = {};
  selectedField.rowStyles[idx][prop] = value;
  selectField(selectedField);
}

function removeTableColumn(idx) {
  if (!selectedField || !selectedField.columns) return;
  selectedField.columns.splice(idx, 1);
  selectedField.columnTypes.splice(idx, 1);
  selectField(selectedField);
}

function moveTableColumn(idx, dir) {
  if (!selectedField || !selectedField.columns) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= selectedField.columns.length) return;
  // Swap columns
  [selectedField.columns[idx], selectedField.columns[newIdx]] = [selectedField.columns[newIdx], selectedField.columns[idx]];
  // Swap column types
  if (selectedField.columnTypes) {
    [selectedField.columnTypes[idx], selectedField.columnTypes[newIdx]] = [selectedField.columnTypes[newIdx], selectedField.columnTypes[idx]];
  }
  selectField(selectedField);
}

function addTableRow() {
  if (!selectedField || selectedField.type !== 'table') return;
  if (!selectedField.rows) selectedField.rows = [];
  const n = selectedField.rows.length + 1;
  selectedField.rows.push({
    id: 'row_' + Date.now() + '_' + n,
    label: 'Item ' + n,
    name: 'item_' + n
  });
  selectField(selectedField);
}

function updateTableRowLabel(idx, value) {
  if (!selectedField || !selectedField.rows) return;
  if (typeof selectedField.rows[idx] === 'string') {
    selectedField.rows[idx] = { id: 'row_' + idx, label: value, name: 'item_' + idx };
  } else {
    selectedField.rows[idx].label = value;
  }
  renderCurrentSection();
}

function updateTableRowName(idx, value) {
  if (!selectedField || !selectedField.rows) return;
  if (typeof selectedField.rows[idx] === 'string') {
    selectedField.rows[idx] = { id: 'row_' + idx, label: selectedField.rows[idx], name: value };
  } else {
    selectedField.rows[idx].name = value;
  }
}

function removeTableRow(idx) {
  if (!selectedField || !selectedField.rows) return;
  selectedField.rows.splice(idx, 1);
  selectField(selectedField);
}

function moveTableRow(idx, dir) {
  if (!selectedField || !selectedField.rows) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= selectedField.rows.length) return;
  [selectedField.rows[idx], selectedField.rows[newIdx]] = [selectedField.rows[newIdx], selectedField.rows[idx]];
  selectField(selectedField);
}

function updateLivePreview() {
  if (document.getElementById('livePreviewPanel').classList.contains('hidden')) return;
  const frame = document.getElementById('livePreviewFrame');
  if (!frame) return;
  const formName = document.getElementById('formId').value || '';
  const formIdCode = document.getElementById('formSubtitle').value || '';
  const formIssue = document.getElementById('formIssue').value || '';
  const formRevision = document.getElementById('formRevision').value || '';
  const formDate = document.getElementById('formDate').value || '';
  const title = formName || 'Draft Preview';
  const sectionNames = ['Session Details', 'Training Details', 'Comments & Signatures'];
  const sectionName = sectionNames[['session', 'training', 'comments'].indexOf(currentSection)] || currentSection;
  document.getElementById('previewSectionNum').textContent = ['session', 'training', 'comments'].indexOf(currentSection) + 1;
  const html = generateLivePreviewHtml(title, sectionName, formIdCode, formIssue, formRevision, formDate);
  frame.srcdoc = html;
}

function generateLivePreviewHtml(title, sectionName, formIdCode, formIssue, formRevision, formDate) {
  const fieldsets = currentForm.config.sections[currentSection] || [];
  let bodyHtml = '';
  fieldsets.forEach(fs => {
    const fsBg = fs.bgImage ? `background-image: url(${esc(fs.bgImage)}); background-size: ${esc(fs.bgSize || 'cover')}; background-position: center; background-repeat: no-repeat;` : '';
    const fsBgOverlay = fs.bgImage ? `position: relative;` : '';
    bodyHtml += `\n    <fieldset style="${fsBg} ${fsBgOverlay}">\n      <legend>${esc(fs.title)}</legend>
`;
    if (fs.bgImage) {
      const opacity = (fs.bgOpacity !== undefined ? fs.bgOpacity : 15) / 100;
      bodyHtml += `      <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255,255,255,${opacity}); z-index: 0; pointer-events: none;"></div>\n`;
    }
    const fields = fs.fields || [];
    const rows = {};
    fields.forEach(field => {
      const rg = field.rowGroup || 1;
      if (!rows[rg]) rows[rg] = [];
      rows[rg].push(field);
    });
    const sortedKeys = Object.keys(rows).sort((a, b) => parseInt(a) - parseInt(b));
    sortedKeys.forEach(rg => {
      const rowFields = rows[rg];
      bodyHtml += `    <div class="form-row">\n`;
      rowFields.forEach(field => {
        bodyHtml += renderPreviewField(field);
      });
      bodyHtml += `    </div>\n`;
    });
    bodyHtml += `    </fieldset>\n`;
  });
  return `
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fff; padding: 16px; font-size: 14px; }
  .form-row { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
  .form-group { flex: 1; min-width: 150px; }
  .form-group.full { flex: 0 0 100%; max-width: 100%; }
  fieldset { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  legend { font-weight: 700; color: #1a365d; padding: 0 8px; font-size: 0.9rem; }
  label { display: block; font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 4px; }
  input, select, textarea { width: 100%; padding: 8px; border: 2px solid #e2e8f0; border-radius: 6px; font-size: 0.9rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  th { background: #1a365d; color: #fff; padding: 6px 8px; text-align: left; }
  td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
  input[type="radio"] { width: 16px; height: 16px; }
  canvas { width: 100%; max-width: 250px; height: 60px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; }
  .db-field { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px; width: 100%; }
  small { color: #94a3b8; font-size: 0.75rem; }
</style>
  ${bodyHtml || '<p style="color:#94a3b8;text-align:center;padding:40px;">Empty section. Add sub-sections and fields.</p>'}

  <script>
  function formatDate(input) {
    const val = input.value.trim();
    if (!val) return;
    if (/^[0-9]{2}\/[A-Za-z]{3}\/[0-9]{4}$/.test(val)) return;
    const isoMatch = val.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
    if (isoMatch) {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      input.value = isoMatch[3] + '/' + months[parseInt(isoMatch[2]) - 1] + '/' + isoMatch[1];
      return;
    }
    const euroMatch = val.match(/^([0-9]{2})[-\/]([0-9]{2})[-\/]([0-9]{4})$/);
    if (euroMatch) {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      input.value = euroMatch[1] + '/' + months[parseInt(euroMatch[2]) - 1] + '/' + euroMatch[3];
    }
  }
  function unformatDate(input) {
    const val = input.value.trim();
    if (!val) return;
    const months = {'jan':'01','feb':'02','mar':'03','apr':'04','may':'05','jun':'06','jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12'};
    const match = val.match(/^([0-9]{2})\/([A-Za-z]{3})\/([0-9]{4})$/);
    if (match) {
      const month = months[match[2].toLowerCase()];
      if (month) input.value = match[3] + '-' + month + '-' + match[1];
    }
  }
  </script>
</body>\n</html>`;
}

function getHeightStyle(field) {
  const heights = {
    small: 'min-height: 32px;',
    medium: 'min-height: 60px;',
    large: 'min-height: 120px;',
    xlarge: 'min-height: 200px;'
  };
  return field.height && heights[field.height] ? ` style="${heights[field.height]}"` : '';
}

function getTextareaRows(field) {
  const rows = { small: 2, medium: 4, large: 8, xlarge: 15 };
  return field.height && rows[field.height] ? rows[field.height] : (field.rows || 3);
}

function getSignatureHeight(field) {
  const heights = { small: 40, medium: 60, large: 100, xlarge: 150 };
  return field.height && heights[field.height] ? heights[field.height] : 60;
}

function renderPreviewField(field) {
  const name = field.name || field.id;
  // Add reorder controls wrapper
  const pw = field.width && field.width !== 'auto' ? field.width : null;
  let html = `<div class="preview-field-wrapper" data-field-id="${field.id}" style="${pw ? 'flex: 0 0 ' + pw + '%; max-width: ' + pw + '%; min-width: auto;' : 'flex: 1; min-width: 140px;'}">
`;
  html += `  <div class="preview-field-controls">
`;
  html += `    <button class="preview-move-btn" onclick="parent.postMessage({type:'moveFieldUp',fieldId:'${field.id}'},'*')" title="Move to previous row group (↑)">↑</button>
`;
  html += `    <button class="preview-move-btn" onclick="parent.postMessage({type:'moveFieldDown',fieldId:'${field.id}'},'*')" title="Move to next row group (↓)">↓</button>
`;
  html += `  </div>
`;'';
  if (field.type === 'heading') {
    html += `      <${field.level || 'h3'}>${esc(field.label)}</${field.level || 'h3'}>\n`;
    html += `    </div>\n`;
    return html;
  }
  if (field.type === 'infoblock') {
    let ibStyle = 'padding:8px;';
    if (field.fontStyle === 'bold') ibStyle += 'font-weight:bold;';
    else if (field.fontStyle === 'italic') ibStyle += 'font-style:italic;';
    else if (field.fontStyle === 'bold-italic') ibStyle += 'font-weight:bold;font-style:italic;';
    if (field.fontSize === 'small') ibStyle += 'font-size:0.85rem;';
    else if (field.fontSize === 'large') ibStyle += 'font-size:1.05rem;';
    else if (field.fontSize === 'xlarge') ibStyle += 'font-size:1.15rem;';
    else ibStyle += 'font-size:0.9rem;';
    const ibContent = field.contentType === 'html' ? (field.content || '') : (field.content || '').replace(/\n/g, '<br>');
    html += `      <div style="${ibStyle}">${ibContent}</div>\n`;
    html += `    </div>\n`;
    return html;
  }
  html += `      <div class="form-group${field.width === '100' ? ' full' : ''}">\n`;
  if (field.type !== 'radio' && field.type !== 'checkbox') {
    html += `        <label>${esc(field.label)}${field.required ? ' *' : ''}</label>\n`;
  }
  switch (field.type) {
    case 'date':
      html += `        <input type="text" placeholder="dd/mmm/yyyy" pattern="[0-9]{2}/[A-Za-z]{3}/[0-9]{4}" onblur="formatDate(this)" onfocus="unformatDate(this)" ${field.required ? 'required' : ''}>\n`;
      break;
    case 'select':
      html += `        <select ${field.required ? 'required' : ''}><option value="">Select...</option>${field.options?.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('') || ''}</select>\n`;
      break;
    case 'radio':
      html += `        <label>${esc(field.label)}${field.required ? ' *' : ''}</label>\n`;
      field.options?.forEach(opt => {
        html += `        <label><input type="radio" name="${name}" value="${esc(opt.value)}"> ${esc(opt.label)}</label>\n`;
      });
      break;
    case 'checkbox':
      html += `        <label>${esc(field.label)}${field.required ? ' *' : ''}</label>\n`;
      field.options?.forEach(opt => {
        html += `        <label><input type="checkbox" name="${name}[]" value="${esc(opt.value)}"> ${esc(opt.label)}</label>\n`;
      });
      break;
    case 'textarea':
      html += `        <textarea rows="${getTextareaRows(field)}" placeholder="${esc(field.placeholder || '')}" ${field.required ? 'required' : ''}></textarea>\n`;
      break;
    case 'table':
      html += renderPreviewTable(field);
      break;
    case 'signature':
      const sigH = getSignatureHeight(field);
      html += `        <canvas style="width:100%;max-width:200px;height:${sigH}px;border:1px solid #e2e8f0;border-radius:4px;"></canvas>
`;
      break;
    case 'db_crewName': case 'db_crewId': case 'db_crewLicense': case 'db_crew3lc':
    case 'db_instructorTri': case 'db_examinerTre': case 'db_pilotPosition':
      {
        const dbName = field.dbSource || 'unknown';
        const selId = 'db_' + field.id + '_' + Math.random().toString(36).substr(2,5);
        html += `        <select class="db-field" id="${selId}" data-db="${esc(dbName)}" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px;">\n`;
        html += `          <option value="">-- Loading... --</option>\n`;
        html += `        </select>\n`;
        html += `<script>setTimeout(function(){fetch('/api/crew?source=${dbName}').then(r=>r.json()).then(rows=>{var s=document.getElementById('${selId}');if(!s)return;s.innerHTML='<option value="">-- Select --</option>';rows.forEach(r=>{var v='${dbName}'==='crewName'?r.name:'${dbName}'==='crew3lc'||'${dbName}'==='crewId'?r.three_lc:'${dbName}'==='crewLicense'?(r.license_number||''):r.name;var l='${dbName}'==='crew3lc'||'${dbName}'==='crewId'?r.three_lc+' - '+r.name:r.name+(r.position?' ('+r.position+')':'');s.innerHTML+='<option value="'+v+'">'+l+'</option>';});}).catch(e=>{var s=document.getElementById('${selId}');if(s)s.innerHTML='<option value="">-- Error --</option>';});},100);</script>\n`;
      }
      break;
  }
  html += `      </div>\n`;
  html += `    </div>\n`; // Close preview-field-wrapper
  return html;
}

function renderPreviewTable(field) {
  let html = `        <table>\n          <thead>\n            <tr>\n`;
  field.columns?.forEach((col, i) => {
    const colWidth = field.columnWidths?.[i];
    const colStyle = field.columnStyles?.[i] || {};
    let styleAttr = '';
    if (colWidth) styleAttr += `width:${esc(colWidth)};`;
    if (colStyle.fontWeight === 'bold') styleAttr += 'font-weight:bold;';
    if (colStyle.fontStyle === 'italic') styleAttr += 'font-style:italic;';
    if (colStyle.fontSize === 'small') styleAttr += 'font-size:0.8rem;';
    if (colStyle.fontSize === 'large') styleAttr += 'font-size:1rem;';
    html += `              <th style="${styleAttr}text-align:center;">${esc(col)}</th>
`;
  });
  html += `            </tr>\n          </thead>\n          <tbody>\n`;
  field.rows?.forEach((row, idx) => {
    const rowLabel = typeof row === 'object' ? row.label : row;
    const rowStyle = (typeof row === 'object' && row.rowStyles) ? row.rowStyles : {};
    let rowTdStyle = 'white-space:pre-line;';
    if (rowStyle.fontStyle === 'bold') rowTdStyle += 'font-weight:bold;';
    else if (rowStyle.fontStyle === 'italic') rowTdStyle += 'font-style:italic;';
    else if (rowStyle.fontStyle === 'bold-italic') rowTdStyle += 'font-weight:bold;font-style:italic;';
    if (rowStyle.fontSize === 'small') rowTdStyle += 'font-size:0.8rem;';
    else if (rowStyle.fontSize === 'large') rowTdStyle += 'font-size:1.05rem;';
    else if (rowStyle.fontSize === 'xlarge') rowTdStyle += 'font-size:1.15rem;';
    html += `            <tr>\n              <td style="${rowTdStyle}">${esc(rowLabel)}</td>\n`;
    for (let i = 1; i < (field.columns?.length || 1); i++) {
      const colType = field.columnTypes?.[i] || 'text';
      if (colType === 'radio') html += `              <td class="radio-cell"><input type="radio"></td>\n`;
      else if (colType === 'checkbox') html += `              <td class="radio-cell"><input type="checkbox"></td>\n`;
      else if (colType === 'number') html += `              <td><input type="number" class="notes-input" placeholder="..."></td>\n`;
      else if (colType === 'select') html += `              <td><select><option>Select...</option><option>Yes</option><option>No</option></select></td>\n`;
      else if (colType === 'multiline') {
        const mlRows = field.columnRows?.[i] || 2;
        html += `              \u003ctd\u003e\u003ctextarea rows="${mlRows}" class="notes-input" placeholder="..."\u003e\u003c/textarea\u003e\u003c/td\u003e\n`;
      }
      else if (colType === 'signature') {
        const sigHeight = field.columnSigHeights?.[i] || '2row';
        const sigPx = { '1row': 40, '2row': 60, '3row': 100, '4row': 150, '5row': 200 }[sigHeight] || 60;
        html += `              <td><canvas style="width:100%;max-width:200px;height:${sigPx}px;border:1px solid #e2e8f0;border-radius:4px;"></canvas></td>\n`;
      }
      else html += `              <td><input type="text" class="notes-input" placeholder="..."></td>\n`;
    }
    html += `            </tr>\n`;
  });
  html += `          </tbody>\n        </table>\n`;
  return html;
}

function toggleLivePreview() {
  document.getElementById('livePreviewPanel').classList.toggle('hidden');
  if (!document.getElementById('livePreviewPanel').classList.contains('hidden')) {
    updateLivePreview();
  }
}

function startPreviewSync() {
  // Preview updates only on demand (button click or manual refresh)
  // No more automatic 2-second interval
}

function stopPreviewSync() {
  if (previewInterval) {
    clearInterval(previewInterval);
    previewInterval = null;
  }
}

// ===== FORM ACTIONS =====
function resetBuilder() {
  currentForm = {
    id: null,
    name: '',
    form_type: 'simulator',
    description: '',
    config: { title: '', subtitle: '', sections: { session: [], training: [], comments: [] } }
  };
  selectedField = null;
  selectedFieldsetId = null;
  fieldCounter = 0;
  document.getElementById('formId').value = '';
  document.getElementById('formIssue').value = '';
  document.getElementById('formRevision').value = '';
  document.getElementById('formDate').value = '';
  document.getElementById('formSubtitle').value = '';
  document.querySelectorAll('.field-container').forEach(c => c.innerHTML = '');
  document.getElementById('propertiesContent').innerHTML = '<p class="hint">Select a field or sub-section to edit its properties</p>';

  document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.section-tab[data-section="session"]').classList.add('active');
  document.querySelectorAll('.builder-section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-session').classList.add('active');
  currentSection = 'session';
}

async function saveForm() {
  // Check if saving as template
  if (window._saveAsTemplate) {
    return saveTemplate();
  }
  
  currentForm.config.formId = document.getElementById('formId').value || '';
  currentForm.config.formIssue = document.getElementById('formIssue').value || '';
  currentForm.config.formRevision = document.getElementById('formRevision').value || '';
  currentForm.config.formDate = document.getElementById('formDate').value || '';
  currentForm.config.subtitle = document.getElementById('formSubtitle').value;
  currentForm.name = currentForm.config.title;

  const url = currentForm.id ? `/api/forms/${currentForm.id}` : '/api/forms';
  const method = currentForm.id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentForm)
    });
    const data = await res.json();
    if (data.id) currentForm.id = data.id;
    alert('Form saved! ✅');
    showDashboard();
  } catch (err) {
    console.error(err);
    alert('Error saving form');
  }
}

async function saveTemplate() {
  const name = document.getElementById('templateName').value;
  if (!name) { alert('Please enter a template name'); return; }
  
  const section = document.getElementById('templateSectionType').value;
  const description = document.getElementById('templateDescription').value;
  const editingId = document.getElementById('editingTemplateId').value;
  
  // Collect fields from all fieldsets in current section
  const fieldsets = currentForm.config.sections[section] || [];
  const fields = [];
  fieldsets.forEach(fs => {
    (fs.fields || []).forEach(f => fields.push(f));
  });
  
  try {
    const url = editingId ? `/api/templates/${editingId}` : '/api/templates';
    const method = editingId ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        section_type: section,
        description: description || '',
        fields: fields
      })
    });
    const data = await res.json();
    if (data.id || data.ok || data.success) {
      alert(editingId ? 'Template updated!' : 'Template saved!');
      document.getElementById('editingTemplateId').value = '';
      document.getElementById('templateModalTitle').textContent = 'Create Section Template';
      _editingTemplateId = null;
      window._saveAsTemplate = false;
      showTemplates();
    }
  } catch (err) {
    console.error(err);
    alert('Error saving template');
  }
}

async function previewForm() {
  currentForm.config.formId = document.getElementById('formId').value || '';
  currentForm.config.formIssue = document.getElementById('formIssue').value || '';
  currentForm.config.formRevision = document.getElementById('formRevision').value || '';
  currentForm.config.formDate = document.getElementById('formDate').value || '';
  currentForm.config.subtitle = document.getElementById('formSubtitle').value;

  try {
    const res = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: currentForm.config })
    });
    const html = await res.text();
    const blob = new Blob([html], { type: 'text/html' });
    document.getElementById('previewFrame').src = URL.createObjectURL(blob);
    document.getElementById('previewModal').classList.add('active');
  } catch (err) {
    console.error(err);
    alert('Error generating preview');
  }
}

function downloadPreviewForm() {
  try {
    const frame = document.getElementById('previewFrame');
    const html = frame.contentDocument.documentElement.outerHTML;
    const blob = new Blob([html], {type: 'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (currentForm.config.title || currentForm.config.formId || 'training-form') + '.html';
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  } catch(e) {
    console.error('Download error:', e);
    alert('Error downloading form');
  }
}

function closePreview() {
  document.getElementById('previewModal').classList.remove('active');
}

// ===== LOAD FORMS =====
async function deleteForm(id, name) {
  if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;
  try {
    await fetch('/api/forms/' + id, { method: 'DELETE' });
    loadForms();
  } catch (err) {
    console.error(err);
    alert('Error deleting form');
  }
}

async function loadForms() {
  try {
    const res = await fetch('/api/forms');
    const forms = await res.json();
    const tbody = document.getElementById('formsList');
    const emptyState = document.getElementById('formsEmptyState');
    if (!forms.length) {
      tbody.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';
    tbody.innerHTML = forms.map(f => {
      const cfg = typeof f.config_json === 'string' ? JSON.parse(f.config_json) : (f.config || {});
      const formId = cfg.formId || cfg.subtitle || f.name || '';
      const title = cfg.title || f.name || '';
      const rev = cfg.formRevision || '';
      const date = cfg.formDate || '';
      return `
        <tr onclick="editForm(${f.id})" style="cursor:pointer;">
          <td>${esc(formId)}</td>
          <td>${esc(title)}</td>
          <td>${esc(rev)}</td>
          <td>${esc(date)}</td>
          <td>Luis Rivas Robles</td>
          <td><button class="btn-action pdf" onclick="event.stopPropagation();downloadFormPdf(${f.id})" title="Download PDF">📄 PDF</button></td>
          <td><button class="btn-action edit" onclick="event.stopPropagation();editForm(${f.id})" title="Edit">✏️ Edit</button></td>
          <td><button class="btn-action track" onclick="event.stopPropagation();trackForm(${f.id})" title="Track">Track</button></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

async function downloadFormPdf(formId) {
  try {
    const res = await fetch(`/api/forms/${formId}`);
    const form = await res.json();
    const config = typeof form.config_json === 'string' ? JSON.parse(form.config_json) : (form.config || {});
    const html = generateHtml(config);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.formId || form.name || 'form'}.html`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert('Error generating PDF');
  }
}

async function trackForm(formId) {
  try {
    const res = await fetch(`/api/forms/${formId}`);
    const form = await res.json();
    alert(`Form Tracking:\n\nID: ${form.id}\nName: ${form.name}\nCreated: ${new Date(form.created_at).toLocaleString()}\nUpdated: ${new Date(form.updated_at).toLocaleString()}\nType: ${form.form_type}`);
  } catch (err) {
    console.error(err);
  }
}

async function editForm(id) {
  try {
    const res = await fetch(`/api/forms/${id}`);
    const form = await res.json();
    currentForm = form;
    currentForm.config = JSON.parse(form.config_json);

    // Migrate old flat structure to fieldset structure
    ['session', 'training', 'comments'].forEach(sec => {
      if (currentForm.config.sections[sec]) {
        currentForm.config.sections[sec] = currentForm.config.sections[sec].map(item => {
          if (item.type === 'fieldset') return item;
          // Wrap standalone field in a default fieldset
          return {
            id: 'fieldset_migrated_' + item.id,
            type: 'fieldset',
            title: 'General',
            fields: [item]
          };
        });
      }
    });

    document.getElementById('formId').value = currentForm.config.formId || '';
    document.getElementById('formIssue').value = currentForm.config.formIssue || '';
    document.getElementById('formRevision').value = currentForm.config.formRevision || '';
    document.getElementById('formDate').value = currentForm.config.formDate || '';
    document.getElementById('formSubtitle').value = currentForm.config.subtitle || '';

    ['session', 'training', 'comments'].forEach(sec => {
      currentSection = sec;
      renderCurrentSection();
    });

    // Reset to first tab
    currentSection = 'session';
    document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.section-tab[data-section="session"]').classList.add('active');
    document.querySelectorAll('.builder-section').forEach(s => s.classList.remove('active'));
    document.getElementById('section-session').classList.add('active');

    showView('builder');
  } catch (err) {
    console.error(err);
    alert('Error loading form');
  }
}

// ===== DATE FORMATTING =====
function formatDate(input) {
  const val = input.value.trim();
  if (!val) return;
  // If already formatted, do nothing
  if (/^[0-9]{2}\/[A-Za-z]{3}\/[0-9]{4}$/.test(val)) return;
  // Try to parse yyyy-mm-dd
  const isoMatch = val.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
  if (isoMatch) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    input.value = isoMatch[3] + '/' + months[parseInt(isoMatch[2]) - 1] + '/' + isoMatch[1];
    return;
  }
  // Try dd-mm-yyyy or dd/mm/yyyy
  const euroMatch = val.match(/^([0-9]{2})[-/]([0-9]{2})[-/]([0-9]{4})$/);
  if (euroMatch) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    input.value = euroMatch[1] + '/' + months[parseInt(euroMatch[2]) - 1] + '/' + euroMatch[3];
  }
}

function unformatDate(input) {
  const val = input.value.trim();
  if (!val) return;
  // If formatted as dd/mmm/yyyy, convert back to yyyy-mm-dd for editing
  const months = {'jan':'01','feb':'02','mar':'03','apr':'04','may':'05','jun':'06','jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12'};
  const match = val.match(/^([0-9]{2})\/([A-Za-z]{3})\/([0-9]{4})$/);
  if (match) {
    const month = months[match[2].toLowerCase()];
    if (month) {
      input.value = match[3] + '-' + month + '-' + match[1];
    }
  }
}

// ===== UTILS =====
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Listen for messages from preview iframe
window.addEventListener('message', e => {
  if (e.data && e.data.type === 'moveFieldUp') {
    changeFieldRowGroup(e.data.fieldId, -1);
  } else if (e.data && e.data.type === 'moveFieldDown') {
    changeFieldRowGroup(e.data.fieldId, 1);
  }
});

function changeFieldRowGroup(fieldId, direction) {
  const fieldsets = currentForm.config.sections[currentSection];
  for (const fs of fieldsets) {
    const field = fs.fields.find(f => f.id === fieldId);
    if (field) {
      const currentRg = field.rowGroup || 1;
      const newRg = Math.max(1, currentRg + direction);
      field.rowGroup = newRg;
      renderCurrentSection();
      if (selectedField === field) renderProperties(field);
      updateLivePreview();
      break;
    }
  }
}

// ===== PROPERTIES PANEL RESIZE =====
(function initPropertiesResize() {
  const divider = document.getElementById('resizeDivider');
  const panel = document.querySelector('.properties-panel');
  if (!divider || !panel) return;

  let isResizing = false;
  let startX, startWidth;

  divider.addEventListener('mousedown', e => {
    isResizing = true;
    startX = e.clientX;
    startWidth = panel.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!isResizing) return;
    const dx = e.clientX - startX;
    const newWidth = Math.max(220, Math.min(window.innerWidth - 300, startWidth - dx));
    panel.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
})();

// ===== INIT =====
showDashboard();
loadTemplates();
loadSavedTables();