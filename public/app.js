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
function showView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(view + 'View').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
}

function showDashboard() { showView('dashboard'); loadForms(); }
function showTemplates() { showView('templates'); loadTemplates(); }
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
      <div class="form-card">
        <h3>${esc(t.name)}</h3>
        <div class="meta">${t.section_type} · ${new Date(t.created_at).toLocaleDateString()}</div>
        <p style="color:#64748b;font-size:0.8rem;margin:8px 0;">${esc(t.description || '')}</p>
        <div style="margin-top:12px;display:flex;gap:8px;">
          <button class="btn btn-primary" style="padding:6px 12px;font-size:0.8rem;" onclick="useTemplate(${t.id})">📋 Use</button>
          <button class="btn btn-secondary" style="padding:6px 12px;font-size:0.8rem;" onclick="editTemplate(${t.id})">✏️ Edit</button>
          <button class="btn btn-secondary" style="padding:6px 12px;font-size:0.8rem;background:#fee2e2;color:#dc2626;" onclick="deleteTemplate(${t.id})">🗑️</button>
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

async function editTemplate(id) {
  try {
    const res = await fetch(`/api/templates/${id}`);
    const template = await res.json();
    alert('Edit template: ' + template.name + '\n\n(Feature coming soon - for now, delete and recreate)');
  } catch (err) {
    console.error(err);
  }
}

async function saveCurrentSectionAsTemplate() {
  const name = prompt('Template name:');
  if (!name) return;
  const description = prompt('Description (optional):') || '';
  const sectionType = currentSection;
  const fields = currentForm.config.sections[currentSection];
  
  if (!fields || !fields.length) {
    alert('Current section is empty. Add some fields first.');
    return;
  }
  
  try {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, section_type: sectionType, description, fields })
    });
    const data = await res.json();
    alert('Template saved! ✅');
  } catch (err) {
    console.error(err);
    alert('Error saving template');
  }
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
        columnTypes: ['text', 'radio', 'radio', 'text'],
        rows: [
          { id: 'row_' + Date.now() + '_1', label: 'Item 1', name: 'item_1' },
          { id: 'row_' + Date.now() + '_2', label: 'Item 2', name: 'item_2' }
        ]
      };
    case 'signature':
      return { ...base, label: 'Signature' };
    case 'heading':
      return { ...base, label: 'Section Heading', level: 'h3' };
    case 'db_crewName':
      return { ...base, label: 'Crew Name', dbSource: 'crewName', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_crewId':
      return { ...base, label: 'Crew ID', dbSource: 'crewId', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_crewLicense':
      return { ...base, label: 'Crew License', dbSource: 'crewLicense', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_crew3lc':
      return { ...base, label: 'Crew 3LC', dbSource: 'crew3lc', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_instructorTri':
      return { ...base, label: 'Instructor - TRI', dbSource: 'instructorTri', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_instructorSfi':
      return { ...base, label: 'Instructor - SFI', dbSource: 'instructorSfi', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_examinerTre':
      return { ...base, label: 'Examiner - TRE', dbSource: 'examinerTre', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_examinerSfe':
      return { ...base, label: 'Examiner - SFE', dbSource: 'examinerSfe', options: [{value:'', label:'-- Select from database --'}] };
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
    db_crewName: 'Crew Name', db_crewId: 'Crew ID', db_crewLicense: 'Crew License',
    db_crew3lc: 'Crew 3LC', db_instructorTri: 'Instructor - TRI',
    db_instructorSfi: 'Instructor - SFI', db_examinerTre: 'Examiner - TRE',
    db_examinerSfe: 'Examiner - SFE', db_location: 'Location',
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
    if (type) {
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
      </div>`);;

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
        <input type="text" value="${esc(row.label || row)}" placeholder="Row label" onchange="updateTableRowLabel(${i}, this.value)" style="min-width:150px;">
        <input type="text" value="${esc(row.name || ('row_' + (i+1)))}" placeholder="Field name" style="width:120px;min-width:120px;" onchange="updateTableRowName(${i}, this.value)">
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
  const formId = document.getElementById('formId').value || '';
  const formIssue = document.getElementById('formIssue').value || '';
  const formRevision = document.getElementById('formRevision').value || '';
  const formDate = document.getElementById('formDate').value || '';
  const title = formId || 'Draft Preview';
  const sectionNames = ['Session Details', 'Training Details', 'Comments & Signatures'];
  const sectionName = sectionNames[['session', 'training', 'comments'].indexOf(currentSection)] || currentSection;
  document.getElementById('previewSectionNum').textContent = ['session', 'training', 'comments'].indexOf(currentSection) + 1;
  const html = generateLivePreviewHtml(title, sectionName);
  frame.srcdoc = html;
}

function generateLivePreviewHtml(title, sectionName) {
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
  return `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<style>\n  * { box-sizing: border-box; }\n  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 12px; font-size: 14px; }\n  .preview-header { background: #1a365d; color: #fff; padding: 12px 16px; border-radius: 8px; margin-bottom: 12px; }\n  .preview-header h1 { margin: 0; font-size: 1rem; }\n  .preview-header p { margin: 4px 0 0; opacity: 0.8; font-size: 0.8rem; }\n  fieldset { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 12px; background: #fff; }\n  legend { font-weight: 700; color: #1a365d; padding: 0 6px; font-size: 0.85rem; }\n  .form-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; position: relative; z-index: 1; }\n  .form-group { flex: 1; min-width: 140px; }\n  .form-group.full { flex: 0 0 100%; max-width: 100%; }\n  label { display: block; font-size: 0.75rem; font-weight: 600; color: #475569; margin-bottom: 2px; }\n  input, select, textarea { width: 100%; padding: 6px 8px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.85rem; }\n  input[type="radio"], input[type="checkbox"] { width: auto; }\n  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-top: 4px; }\n  th { background: #1a365d; color: #fff; padding: 6px; text-align: left; font-size: 0.75rem; }\n  td { padding: 6px; border-bottom: 1px solid #e2e8f0; }\n  tr:nth-child(even) { background: #f8fafc; }\n  .radio-cell { text-align: center; width: 50px; }\n  .notes-input { width: 100%; padding: 4px 6px; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 0.75rem; }\n  canvas { background: #fff; border: 1px solid #e2e8f0; border-radius: 4px; width: 100%; max-width: 120px; height: 40px; }\n  h2, h3, h4 { margin: 8px 0; color: #1a365d; }\n  .preview-field-wrapper { position: relative; border: 1px dashed transparent; border-radius: 6px; padding: 4px; transition: all 0.2s; display: flex; flex: 1; min-width: 140px; }\n  .preview-field-wrapper:hover { border-color: #cbd5e1; background: #f8fafc; }\n  .preview-field-controls { position: absolute; right: 2px; top: 2px; display: none; gap: 2px; z-index: 10; }\n  .preview-field-wrapper:hover .preview-field-controls { display: flex; }\n  .preview-move-btn { background: #1a365d; color: #fff; border: none; border-radius: 4px; padding: 2px 6px; font-size: 11px; cursor: pointer; opacity: 0.8; }\n  .preview-move-btn:hover { opacity: 1; }\n  .preview-field-wrapper .form-group { flex: 1; }\n</style>\n</head>\n<body>\n  <div class="preview-header">\n    <h1 style="margin:0;font-size:1rem;">👁️ ${esc(formId || 'Draft Preview')}</h1>\n    ${formIssue || formRev || formDate ? `<div style="margin-top:4px;display:flex;gap:12px;font-size:0.8rem;opacity:0.85;">\n      ${formIssue ? `<span>Issue: ${esc(formIssue)}</span>` : ''}\n      ${formRev ? `<span>Rev: ${esc(formRev)}</span>` : ''}\n      ${formDate ? `<span>Date: ${esc(formDate)}</span>` : ''}\n    </div>` : ''}\n    <p style="margin:4px 0 0;opacity:0.8;font-size:0.8rem;">Live Preview - ${esc(sectionName)}</p>\n  </div>\n  ${bodyHtml || '<p style="color:#94a3b8;text-align:center;padding:40px;">Empty section. Add sub-sections and fields.</p>'}\n
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
    case 'db_instructorTri': case 'db_instructorSfi': case 'db_examinerTre':
    case 'db_examinerSfe': case 'db_location': case 'db_trainingType': case 'db_fstdId':
      {
        const dbOpts = field.options || [{value:'', label:'-- Select from database --'}];
        const dbName = field.dbSource || 'unknown';
        html += `        <select class="db-field" data-db="${esc(dbName)}" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px;">
`;
        dbOpts.forEach(opt => {
          html += `          <option value="${esc(opt.value)}" disabled>${esc(opt.label)}</option>
`;
        });
        html += `        </select>
`;
        html += `        <small style="color:#94a3b8;font-size:0.75rem;">🔗 ${esc(dbName)} - database linked</small>
`;
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
    const widthStyle = colWidth ? ` style="width:${esc(colWidth)}"` : '';
    html += `              <th${widthStyle}>${esc(col)}</th>
`;
  });
  html += `            </tr>\n          </thead>\n          <tbody>\n`;
  field.rows?.forEach((row, idx) => {
    const rowLabel = typeof row === 'object' ? row.label : row;
    html += `            <tr>\n              <td><strong>${esc(rowLabel)}</strong></td>\n`;
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

function closePreview() {
  document.getElementById('previewModal').classList.remove('active');
}

// ===== LOAD FORMS =====
async function loadForms() {
  try {
    const res = await fetch('/api/forms');
    const forms = await res.json();
    const grid = document.getElementById('formsList');
    if (!forms.length) {
      grid.innerHTML = '<p class="hint">No forms yet. Click "New Form" to create one.</p>';
      return;
    }
    grid.innerHTML = forms.map(f => `
      <div class="form-card" onclick="editForm(${f.id})">
        <h3>${esc(f.name)}</h3>
        <div class="meta">${f.form_type} · ${new Date(f.created_at).toLocaleDateString()}</div>
      </div>
    `).join('');
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