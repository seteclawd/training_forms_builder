document.getElementById('deleteFormBtn').style.display = 'none';
  currentForm = {
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
    list.innerHTML = tables.map(t => {
      const safeName = t.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return '<div class="palette-item" draggable="true" data-type="saved_table" data-table-id="' + t.id + '" style="font-size:0.75rem;padding:6px 8px;margin-bottom:4px;display:flex;align-items:center;justify-content:space-between;">' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">📊 ' + esc(t.name) + '</span>' +
        '<span style="display:flex;gap:4px;margin-left:8px;flex-shrink:0;">' +
          '<button class="icon-btn" onclick="event.preventDefault();event.stopPropagation();renameSavedTable(' + t.id + ')" title="Rename" style="background:none;border:none;cursor:pointer;font-size:0.85rem;padding:2px 4px;opacity:0.7;">✏️</button>' +
          '<button class="icon-btn" onclick="event.preventDefault();event.stopPropagation();deleteSavedTable(' + t.id + ')" title="Delete" style="background:none;border:none;cursor:pointer;font-size:0.85rem;padding:2px 4px;opacity:0.7;">🗑️</button>' +
        '</span></div>';
    }).join('');
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

async function renameSavedTable(id) {
  const newName = prompt('New name for this table:');
  if (!newName) return;
  try {
    const res = await fetch('/api/saved-tables/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });
    if (res.ok) {
      loadSavedTables();
    } else {
      alert('Error renaming table');
    }
  } catch (err) {
    console.error(err);
    alert('Error renaming table');
  }
}

async function deleteSavedTable(id) {
  if (!confirm('Delete this table?')) return;
  try {
    const res = await fetch('/api/saved-tables/' + id, { method: 'DELETE' });
    if (res.ok) {
      loadSavedTables();
    } else {
      alert('Error deleting table');
    }
  } catch (err) {
    console.error(err);
    alert('Error deleting table');
  }
}

function showView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(view + 'View').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
}

function showDashboard() { showView('dashboard'); loadForms(); }
function showTemplates() { showView('templates'); loadTemplates(); }

function closeTemplateBuilder() {
  document.getElementById('templateBuilderModal').style.display = 'none';
  _editingTemplateId = null;
}

function createNewTemplate() {
  _editingTemplateId = null;
  document.getElementById('editingTemplateId').value = '';
  document.getElementById('templateModalTitle').textContent = 'Template Builder';
  document.getElementById('templateName').value = '';
  document.getElementById('templateDescription').value = '';
  const section = document.getElementById('templateSectionFilter')?.value || 'session';
  document.getElementById('templateSectionType').value = section;
  currentSection = section;
  
  // Initialize empty template structure
  currentForm = {
    name: 'New Template',
    form_type: 'simulator',
    description: '',
    config: {
      sections: { session: [], training: [], comments: [] }
    }
  };
  currentForm.config.sections[section] = [
    {
      id: 'fieldset_' + Date.now(),
      type: 'fieldset',
      title: 'New Sub-section',
      fields: []
    }
  ];
  
  // Render empty canvas
  renderTemplateBuilderCanvas();
  
  // Show modal
  document.getElementById('templateBuilderModal').style.display = 'flex';
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
    grid.innerHTML = '';
    
    // Group by section
    const sectionOrder = ['session', 'training', 'comments'];
    const sectionLabels = {
      session: '📋 Session Details',
      training: '📚 Training Details', 
      comments: '✍️ Comments & Signatures'
    };
    
    const grouped = {};
    templates.forEach(t => {
      const s = t.section_type || 'session';
      if (!grouped[s]) grouped[s] = [];
      grouped[s].push(t);
    });
    
    sectionOrder.forEach(section => {
      const items = grouped[section];
      if (!items || !items.length) return;
      
      const sectionDiv = document.createElement('div');
      sectionDiv.style.cssText = 'margin-bottom:24px;';
      sectionDiv.innerHTML = '<h3 style="font-size:1rem;color:#475569;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">' + (sectionLabels[section] || section) + '</h3>';
      
      const cardsGrid = document.createElement('div');
      cardsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;';
      
      items.forEach(t => {
        const card = document.createElement('div');
        card.className = 'template-card';
        card.innerHTML = '<h3>' + esc(t.name) + '</h3>' +
          '<div class="meta">' + t.section_type + ' · ' + new Date(t.created_at).toLocaleDateString() + '</div>' +
          '<p style="color:#64748b;font-size:0.8rem;margin:8px 0;">' + esc(t.description || '') + '</p>' +
          '<div class="template-actions">' +
            '<button class="btn-use" onclick="useTemplate(' + t.id + ')"><span>📋</span> Use</button>' +
            '<button class="btn-edit" onclick="editTemplate(' + t.id + ')"><span>✏️</span> Edit</button>' +
            '<button class="btn-delete" onclick="deleteTemplate(' + t.id + ')">🗑️</button>' +
          '</div>';
        cardsGrid.appendChild(card);
      });
      
      sectionDiv.appendChild(cardsGrid);
      grid.appendChild(sectionDiv);
    });} catch (err) {
    console.error(err);
  }
}

async function useTemplate(templateId) {
  try {
    const res = await fetch(`/api/templates/${templateId}`);
    const template = await res.json();
    // Initialize currentForm if not already
    if (!currentForm || !currentForm.config) {
      currentForm = {
        id: null,
        name: '',
        form_type: 'simulator',
        description: '',
        config: { title: '', subtitle: '', formId: '', formRevision: '', formDate: '', sections: { session: [], training: [], comments: [] } }
      };
    }
    // Ensure sections exist
    if (!currentForm.config.sections) {
      currentForm.config.sections = { session: [], training: [], comments: [] };
    }
    showBuilder();
    // Apply template fields ONLY to the target section
    const fields = JSON.parse(JSON.stringify(template.fields || []));
    currentForm.config.sections[template.section_type] = [{
      id: "fieldset_" + Date.now(),
      type: "fieldset",
      title: template.name,
      fields: fields
    }];
    // Switch to the section that has the template
    document.querySelectorAll('.section-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.section-tab[data-section="${template.section_type}"]`).classList.add('active');
    document.querySelectorAll('.builder-section').forEach(s => s.classList.remove('active'));
    document.getElementById('section-' + template.section_type).classList.add('active');
    currentSection = template.section_type;
    renderCurrentSection();
    updateLivePreview();
    // Notify user
    const sectionLabels = { session: 'Session Details', training: 'Training Details', comments: 'Comments & Signatures' };
    alert('Template "' + template.name + '" applied to ' + (sectionLabels[template.section_type] || template.section_type));
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
  // Make sure currentForm exists
  if (!currentForm || !currentForm.config || !currentForm.config.sections) {
    alert('Please create some fields first before saving as template.');
    return;
  }
  
  // Use currentSection or default to 'session'
  const section = currentSection || 'session';
  const fieldsets = currentForm.config.sections[section] || [];
  
  // Count all fields across all fieldsets
  let totalFields = 0;
  fieldsets.forEach(fs => { totalFields += (fs.fields || []).length; });
  
  if (totalFields === 0) {
    alert('Current section (' + section + ') has no fields. Add some fields first.');
    return;
  }

  _editingTemplateId = null;
  document.getElementById('editingTemplateId').value = '';
  document.getElementById('templateModalTitle').textContent = 'Save as Template';
  document.getElementById('templateName').value = '';
  document.getElementById('templateDescription').value = '';
  document.getElementById('templateSectionType').value = section;
  
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
      return { ...base, label: 'Instructor', dbSource: 'instructorTri', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_examinerTre':
      return { ...base, label: 'Examiner', dbSource: 'examinerTre', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_pilotPosition':
      return { ...base, label: 'Pilot Position', dbSource: 'pilotPosition', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_location':
      return { ...base, label: 'Location', dbSource: 'location', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_fstdId':
      return { ...base, label: 'FSTD ID', dbSource: 'fstdId', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_acReg':
      return { ...base, label: 'A/C Reg', dbSource: 'acReg', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_adIcao':
      return { ...base, label: 'AD ICAO', dbSource: 'adIcao', options: [{value:'', label:'-- Select from database --'}] };
    case 'db_acType':
      return { ...base, label: 'A/C Type', dbSource: 'acType', options: [{value:'', label:'-- Select from database --'}] };
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
    db_crew3lc: 'Crew 3LC', db_instructorTri: 'Instructor', db_pilotPosition: 'Pilot Position',
    db_acReg: 'A/C Reg', db_adIcao: 'AD ICAO', db_acType: 'A/C Type',
    db_fstdId: 'FSTD ID'
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
    html += `<div class="prop-group" style="background:#1a365d;padding:12px;border-radius:6px;margin-bottom:16px;">
      <label style="color:#fff;margin-bottom:8px;">🎨 Visual Table Designer</label>
      <p style="color:#93c5fd;font-size:0.8rem;margin-bottom:8px;">Open a visual editor with field picker to design your table</p>
      <button class="btn btn-primary" onclick="designTableField('${field.id}')" style="width:100%;">🎨 Open Table Designer</button>
    </div>`;
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
      const editorId = 'editorjs_' + field.id;
      html += `<div class="prop-group">
        <label>Content</label>
        <div id="${editorId}" style="min-height:120px;border:2px solid #e2e8f0;border-radius:6px;background:#fff;"></div>
        <textarea id="prop_content" style="display:none;">${esc(field.content || '')}</textarea>
      </div>`;
      // Init EditorJS after render
      setTimeout(() => initInfoBlockEditor(field.id, field.content || ''), 50);
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
      case 'paste':
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
      case 'changeTableStyle': tableAction('changeTableStyle'); break;
      case 'tableProp': tableAction('showTableProps'); break;
      case 'cellProp': tableAction('showCellProps'); break;
      case 'rowProp': tableAction('showRowProps'); break;
      case 'cutRow': tableAction('cutRow'); break;
      case 'copyRow': tableAction('copyRow'); break;
      case 'pasteRowAbove': tableAction('pasteRowAbove'); break;
      case 'pasteRowBelow': tableAction('pasteRowBelow'); break;
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
  const editor = document.getElementById(editorId);
  if (!editor) return;
  
  // Create modal overlay
  let existing = document.querySelector('.insert-table-modal');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.className = 'insert-table-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:99999';
  
  const modal = document.createElement('div');
  modal.style.cssText = 'background:#fff;border-radius:12px;padding:20px;width:300px;box-shadow:0 20px 60px rgba(0,0,0,0.3)';
  
  let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
  html += '<h3 style="margin:0;font-size:1rem;">Insert Table</h3>';
  html += '<button class="close-modal-btn" style="background:none;border:none;font-size:1.2rem;cursor:pointer;">✕</button>';
  html += '</div>';
  
  // Grid for size selection
  html += '<div style="margin-bottom:12px;">';
  html += '<div style="font-size:0.8rem;color:#64748b;margin-bottom:6px;">Select size: <span id="gridInfo">3 × 3</span></div>';
  html += '<div id="insertTableGrid" style="display:grid;grid-template-columns:repeat(10,20px);gap:1px;">';
  for (let i = 0; i < 100; i++) {
    const r = Math.floor(i / 10) + 1;
    const c = (i % 10) + 1;
    html += '<div data-row="' + r + '" data-col="' + c + '" style="width:20px;height:20px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;"></div>';
  }
  html += '</div></div>';
  
  // Style selector
  html += '<div style="margin-bottom:16px;">';
  html += '<div style="font-size:0.8rem;color:#64748b;margin-bottom:6px;">Style:</div>';
  html += '<select id="insertTableStyle" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:4px;">';
  Object.entries(TABLE_STYLES).forEach(([id, s]) => {
    html += '<option value="' + id + '">' + s.name + '</option>';
  });
  html += '</select></div>';
  
  html += '<button id="insertTableBtn" style="width:100%;padding:8px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Insert</button>';
  
  modal.innerHTML = html;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  let selectedRows = 3, selectedCols = 3;
  
  // Grid hover/click handlers
  const gridEl = document.getElementById('insertTableGrid');
  const gridInfo = document.getElementById('gridInfo');
  
  gridEl.addEventListener('mousemove', function(e) {
    const cell = e.target.closest('[data-row]');
    if (!cell) return;
    selectedRows = parseInt(cell.dataset.row);
    selectedCols = parseInt(cell.dataset.col);
    gridInfo.textContent = selectedRows + ' × ' + selectedCols;
    gridEl.querySelectorAll('[data-row]').forEach(c => {
      const r = parseInt(c.dataset.row);
      const co = parseInt(c.dataset.col);
      c.style.background = (r <= selectedRows && co <= selectedCols) ? '#3b82f6' : '#fff';
    });
  });
  
  gridEl.addEventListener('click', function(e) {
    const cell = e.target.closest('[data-row]');
    if (!cell) return;
    selectedRows = parseInt(cell.dataset.row);
    selectedCols = parseInt(cell.dataset.col);
    insertTableFromModal(editor, selectedRows, selectedCols, overlay);
  });
  
  document.getElementById('insertTableBtn').addEventListener('click', function() {
    const styleId = document.getElementById('insertTableStyle').value;
    insertTableFromModal(editor, selectedRows, selectedCols, overlay, styleId);
  });
  
  overlay.querySelector('.close-modal-btn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });
}

function insertTableFromModal(editor, rows, cols, overlay, styleId) {
  styleId = styleId || document.getElementById('insertTableStyle')?.value || 'simple';
  const style = TABLE_STYLES[styleId] || TABLE_STYLES['simple'];
  
  editor.focus();
  const tableHtml = '<table data-table-style="' + styleId + '" style="' + style.table + '">' +
    Array(rows).fill().map(() => '<tr>' + Array(cols).fill().map(() => '<td style="' + style.td + '">&nbsp;</td>').join('') + '</tr>').join('') +
    '</table><p></p>';
  
  document.execCommand('insertHTML', false, tableHtml);
  editor.dispatchEvent(new Event('input'));
  overlay.remove();
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
    case 'changeTableStyle':
      if (!table) return;
      showTableStylePicker(table, editor);
      break;
    case 'showTableProps':
      if (!table) return;
      showTableProperties(table, editor);
      break;
    case 'showCellProps':
      if (!cell) { alert('Place cursor in a table cell first'); return; }
      showCellProperties(cell, editor);
      break;
    case 'showRowProps':
      if (!row) { alert('Place cursor in a table row first'); return; }
      showRowProperties(row, editor);
      break;
    case 'cutRow':
      if (!row || !table) return;
      window._cutRow = row.cloneNode(true);
      row.remove();
      break;
    case 'copyRow':
      if (!row) return;
      window._copiedRow = row.cloneNode(true);
      alert('Row copied');
      break;
    case 'pasteRowAbove':
      if (!row || !table) return;
      const srcRowAbove = window._cutRow || window._copiedRow;
      if (!srcRowAbove) { alert('No row copied/cut'); return; }
      row.parentNode.insertBefore(srcRowAbove.cloneNode(true), row);
      if (window._cutRow) { window._cutRow = null; }
      break;
    case 'pasteRowBelow':
      if (!row || !table) return;
      const srcRowBelow = window._cutRow || window._copiedRow;
      if (!srcRowBelow) { alert('No row copied/cut'); return; }
      row.parentNode.insertBefore(srcRowBelow.cloneNode(true), row.nextSibling);
      if (window._cutRow) { window._cutRow = null; }
      break;
  }
  editor.dispatchEvent(new Event('input'));
};

function showCellProperties(cell, editor) {
  let existing = document.querySelector('.cell-props-modal');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.className = 'cell-props-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:99999';
  
  const modal = document.createElement('div');
  modal.style.cssText = 'background:#fff;border-radius:12px;padding:24px;width:320px;box-shadow:0 20px 60px rgba(0,0,0,0.3)';
  
  const currentBg = cell.style.backgroundColor || '#ffffff';
  const currentAlign = cell.style.textAlign || 'left';
  const currentWidth = cell.style.width || '';
  
  let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
  html += '<h3 style="margin:0;font-size:1rem;">Cell Properties</h3>';
  html += '<button class="close-cell-btn" style="background:none;border:none;font-size:1.2rem;cursor:pointer;">✕</button>';
  html += '</div>';
  html += '<div style="margin-bottom:12px;"><label style="font-size:0.85rem;display:block;margin-bottom:4px;">Background</label><input type="color" id="cellBg" value="' + currentBg + '" style="width:100%;height:32px;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;"></div>';
  html += '<div style="margin-bottom:12px;"><label style="font-size:0.85rem;display:block;margin-bottom:4px;">Align</label><select id="cellAlign" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:4px;"><option value="left"' + (currentAlign === 'left' ? ' selected' : '') + '>Left</option><option value="center"' + (currentAlign === 'center' ? ' selected' : '') + '>Center</option><option value="right"' + (currentAlign === 'right' ? ' selected' : '') + '>Right</option></select></div>';
  html += '<div style="margin-bottom:16px;"><label style="font-size:0.85rem;display:block;margin-bottom:4px;">Width</label><input type="text" id="cellWidth" value="' + currentWidth + '" placeholder="e.g. 100px or 20%" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:4px;"></div>';
  html += '<button id="applyCellProps" style="width:100%;padding:8px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Apply</button>';
  
  modal.innerHTML = html;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  overlay.querySelector('.close-cell-btn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#applyCellProps').addEventListener('click', () => {
    cell.style.backgroundColor = overlay.querySelector('#cellBg').value;
    cell.style.textAlign = overlay.querySelector('#cellAlign').value;
    cell.style.width = overlay.querySelector('#cellWidth').value;
    overlay.remove();
    editor.dispatchEvent(new Event('input'));
  });
}

function showRowProperties(row, editor) {
  let existing = document.querySelector('.row-props-modal');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.className = 'row-props-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:99999';
  
  const modal = document.createElement('div');
  modal.style.cssText = 'background:#fff;border-radius:12px;padding:24px;width:320px;box-shadow:0 20px 60px rgba(0,0,0,0.3)';
  
  let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
  html += '<h3 style="margin:0;font-size:1rem;">Row Properties</h3>';
  html += '<button class="close-row-btn" style="background:none;border:none;font-size:1.2rem;cursor:pointer;">✕</button>';
  html += '</div>';
  html += '<div style="margin-bottom:16px;"><label style="font-size:0.85rem;display:block;margin-bottom:4px;">Background</label><input type="color" id="rowBg" value="#ffffff" style="width:100%;height:32px;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;"></div>';
  html += '<button id="applyRowProps" style="width:100%;padding:8px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Apply</button>';
  
  modal.innerHTML = html;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  overlay.querySelector('.close-row-btn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#applyRowProps').addEventListener('click', () => {
    const bg = overlay.querySelector('#rowBg').value;
    row.querySelectorAll('td, th').forEach(td => td.style.backgroundColor = bg);
    overlay.remove();
    editor.dispatchEvent(new Event('input'));
  });
}

function showTableProperties(table, editor) {
  let existing = document.querySelector('.table-props-modal');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.className = 'table-props-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:99999';
  
  const modal = document.createElement('div');
  modal.style.cssText = 'background:#fff;border-radius:12px;padding:24px;width:350px;box-shadow:0 20px 60px rgba(0,0,0,0.3)';
  
  const currentBorder = table.style.borderColor || '#cbd5e1';
  const currentBg = table.style.backgroundColor || '#fff';
  const currentStyle = table.getAttribute('data-table-style') || 'simple';
  
  let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
  html += '<h3 style="margin:0;font-size:1rem;">Table Properties</h3>';
  html += '<button class="close-props-btn" style="background:none;border:none;font-size:1.2rem;cursor:pointer;">✕</button>';
  html += '</div>';
  
  html += '<div style="margin-bottom:12px;">';
  html += '<label style="font-size:0.85rem;display:block;margin-bottom:4px;">Table Style</label>';
  html += '<select id="propsTableStyle" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:4px;">';
  Object.entries(TABLE_STYLES).forEach(([id, s]) => {
    html += '<option value="' + id + '"' + (id === currentStyle ? ' selected' : '') + '>' + s.name + '</option>';
  });
  html += '</select></div>';
  
  html += '<div style="margin-bottom:12px;">';
  html += '<label style="font-size:0.85rem;display:block;margin-bottom:4px;">Background Color</label>';
  html += '<input type="color" id="propsTableBg" value="' + currentBg + '" style="width:100%;height:32px;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;">';
  html += '</div>';
  
  html += '<div style="margin-bottom:16px;">';
  html += '<label style="font-size:0.85rem;display:block;margin-bottom:4px;">Border Color</label>';
  html += '<input type="color" id="propsTableBorder" value="' + currentBorder + '" style="width:100%;height:32px;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;">';
  html += '</div>';
  
  html += '<div style="display:flex;gap:8px;">';
  html += '<button id="applyTableProps" style="flex:1;padding:8px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Apply</button>';
  html += '<button id="cancelTableProps" style="flex:1;padding:8px;background:#e2e8f0;border:none;border-radius:6px;cursor:pointer;">Cancel</button>';
  html += '</div>';
  
  modal.innerHTML = html;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  overlay.querySelector('.close-props-btn').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#cancelTableProps').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  
  overlay.querySelector('#applyTableProps').addEventListener('click', function() {
    const styleId = overlay.querySelector('#propsTableStyle').value;
    const bgColor = overlay.querySelector('#propsTableBg').value;
    const borderColor = overlay.querySelector('#propsTableBorder').value;
    
    applyTableStyle(table, styleId);
    table.style.backgroundColor = bgColor;
    table.querySelectorAll('th, td').forEach(cell => {
      if (!cell.style.backgroundColor || cell.style.backgroundColor === 'inherit') {
        cell.style.borderColor = borderColor;
      }
    });
    
    overlay.remove();
    editor.dispatchEvent(new Event('input'));
  });
}

// Table style definitions
const TABLE_STYLES = {
  'simple': {
    name: '📄 Simple',
    table: 'border-collapse:collapse;width:100%;margin:8px 0;font-size:0.85rem;',
    th: 'background:#f1f5f9;padding:8px 12px;border:1px solid #cbd5e1;text-align:left;font-weight:600;',
    td: 'padding:8px 12px;border:1px solid #cbd5e1;',
    headerBg: '#f1f5f9'
  },
  'minimal': {
    name: '✨ Minimal',
    table: 'border-collapse:collapse;width:100%;margin:8px 0;font-size:0.85rem;',
    th: 'padding:8px 12px;border-bottom:2px solid #334155;text-align:left;font-weight:600;',
    td: 'padding:8px 12px;border-bottom:1px solid #e2e8f0;',
    headerBg: 'transparent'
  },
  'dark': {
    name: '🌙 Dark',
    table: 'border-collapse:collapse;width:100%;margin:8px 0;font-size:0.85rem;color:#e2e8f0;',
    th: 'background:#1e293b;padding:8px 12px;border:1px solid #334155;text-align:left;font-weight:600;color:#f1f5f9;',
    td: 'padding:8px 12px;border:1px solid #334155;background:#1e293b;',
    headerBg: '#1e293b'
  },
  'blue': {
    name: '💙 Blue',
    table: 'border-collapse:collapse;width:100%;margin:8px 0;font-size:0.85rem;',
    th: 'background:#1e40af;color:#fff;padding:8px 12px;border:1px solid #1e40af;text-align:left;font-weight:600;',
    td: 'padding:8px 12px;border:1px solid #bfdbfe;',
    headerBg: '#1e40af'
  },
  'green': {
    name: '💚 Green',
    table: 'border-collapse:collapse;width:100%;margin:8px 0;font-size:0.85rem;',
    th: 'background:#166534;color:#fff;padding:8px 12px;border:1px solid #166534;text-align:left;font-weight:600;',
    td: 'padding:8px 12px;border:1px solid #bbf7d0;',
    headerBg: '#166534'
  },
  'borderless': {
    name: '🔲 Borderless',
    table: 'width:100%;margin:8px 0;font-size:0.85rem;',
    th: 'padding:8px 12px;text-align:left;font-weight:600;background:#f8fafc;',
    td: 'padding:8px 12px;',
    headerBg: '#f8fafc'
  },
  'striped': {
    name: '🦓 Striped',
    table: 'border-collapse:collapse;width:100%;margin:8px 0;font-size:0.85rem;',
    th: 'background:#f1f5f9;padding:8px 12px;border:1px solid #cbd5e1;text-align:left;font-weight:600;',
    td: 'padding:8px 12px;border:1px solid #cbd5e1;',
    headerBg: '#f1f5f9',
    stripe: '#f8fafc'
  }
};

function applyTableStyle(table, styleId) {
  const style = TABLE_STYLES[styleId] || TABLE_STYLES['simple'];
  table.style.cssText = style.table;
  table.setAttribute('data-table-style', styleId);
  table.querySelectorAll('th').forEach(th => th.style.cssText = style.th);
  table.querySelectorAll('td').forEach(td => td.style.cssText = style.td);
  if (style.stripe) {
    table.querySelectorAll('tr:nth-child(even) td').forEach(td => {
      td.style.cssText = style.td + 'background:' + style.stripe + ';';
    });
  }
}

function showTableStylePicker(table, editor) {
  let existing = document.querySelector('.table-style-picker-modal');
  if (existing) existing.remove();
  
  const currentStyle = table.getAttribute('data-table-style') || 'simple';
  
  const overlay = document.createElement('div');
  overlay.className = 'table-style-picker-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:99999';
  
  const modal = document.createElement('div');
  modal.style.cssText = 'background:#fff;border-radius:12px;padding:24px;width:400px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)';
  
  let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">';
  html += '<h3 style="margin:0;font-size:1.1rem;">Table Style</h3>';
  html += '<button onclick="this.closest(\'.table-style-picker-modal\').remove()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;">✕</button>';
  html += '</div>';
  
  Object.entries(TABLE_STYLES).forEach(([id, s]) => {
    const isActive = id === currentStyle;
    html += '<div class="table-style-option" data-style-id="' + id + '" style="padding:12px;margin-bottom:8px;border:2px solid ' + (isActive ? '#3b82f6' : '#e2e8f0') + ';border-radius:8px;cursor:pointer;background:' + (isActive ? '#eff6ff' : '#fff') + ';" onmouseover="this.style.borderColor=\'#3b82f6\'" onmouseout="this.style.borderColor=\'' + (isActive ? '#3b82f6' : '#e2e8f0') + '\'">';
    html += '<div style="font-weight:600;margin-bottom:4px;">' + s.name + '</div>';
    html += '<table style="' + s.table + '"><tr>';
    html += '<th style="' + s.th + '">Header 1</th>';
    html += '<th style="' + s.th + '">Header 2</th></tr>';
    html += '<tr><td style="' + s.td + '">Data</td><td style="' + s.td + '">Data</td></tr>';
    if (id === 'striped') {
      html += '<tr><td style="' + s.td + 'background:' + s.stripe + ';">Data</td><td style="' + s.td + 'background:' + s.stripe + ';">Data</td></tr>';
    }
    html += '</table></div>';
  });
  
  modal.innerHTML = html;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  overlay.addEventListener('click', function(e) {
    const option = e.target.closest('.table-style-option');
    if (option) {
      const styleId = option.getAttribute('data-style-id');
      applyTableStyle(table, styleId);
      overlay.remove();
      editor.dispatchEvent(new Event('input'));
    }
    if (e.target === overlay) overlay.remove();
  });
}

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

// ===== TABLE FIELD DESIGNER (Visual Editor) =====
function findField(id) {
  for (const key in currentForm.config.sections) {
    for (const fs of currentForm.config.sections[key]) {
      if (fs.type === 'fieldset' && fs.fields) {
        const f = fs.fields.find(f => f.id === id);
        if (f) return f;
      }
      if (fs.id === id) return fs;
    }
  }
  return null;
}
function designTableField(fieldId) {
  const field = findField(fieldId);
  if (!field) return;
  const modalId = 'designModal_' + fieldId;
  const editorId = 'designMCE_' + fieldId;

  // Build current HTML from columns/rows or use existing content
  let tableHtml = field.content || '';
  if (!tableHtml && field.columns && field.rows) {
    tableHtml = '<table style="border-collapse:collapse;width:100%;"><thead><tr>';
    field.columns.forEach(c => tableHtml += '<th style="border:1px solid #475569;padding:8px;background:#1e293b;color:#e2e8f0;">' + esc(c) + '</th>');
    tableHtml += '</tr></thead><tbody>';
    field.rows.forEach(r => {
      tableHtml += '<tr><td style="border:1px solid #475569;padding:8px;">' + esc(r.label || r) + '</td>';
      field.columns.slice(1).forEach(() => tableHtml += '<td style="border:1px solid #475569;padding:8px;"> </td>');
      tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table>';
  }
  if (!tableHtml) {
    tableHtml = '<table style="border-collapse:collapse;width:100%;"><thead><tr><th style="border:1px solid #475569;padding:8px;background:#1e293b;color:#e2e8f0;">Label</th><th style="border:1px solid #475569;padding:8px;background:#1e293b;color:#e2e8f0;">Value</th></tr></thead><tbody><tr><td style="border:1px solid #475569;padding:8px;">Field 1</td><td style="border:1px solid #475569;padding:8px;"> </td></tr><tr><td style="border:1px solid #475569;padding:8px;">Field 2</td><td style="border:1px solid #475569;padding:8px;"> </td></tr></tbody></table>';
  }

  // Create modal
  const overlay = document.createElement('div');
  overlay.id = modalId;
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10000;display:flex;align-items:center;justify-content:center;';
  // Cell property controls HTML
  const cellPropsHtml = `
    <div style="background:#0f172a;border-left:1px solid #334155;width:260px;padding:0;overflow-y:auto;font-size:0.8rem;">
      <div style="padding:12px;border-bottom:1px solid #334155;"><span style="color:#f59e0b;font-weight:700;font-size:0.9rem;">⚙️ Cell / Row / Column Properties</span></div>
      <div style="padding:10px 12px;border-bottom:1px solid #334155;">
        <div style="color:#93c5fd;font-weight:600;margin-bottom:8px;">📏 Size</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div><label style="color:#94a3b8;font-size:0.7rem;display:block;">Col Width</label><input id="cpColWidth" type="text" placeholder="e.g. 150px" style="width:100%;padding:4px 6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;"></div>
          <div><label style="color:#94a3b8;font-size:0.7rem;display:block;">Row Height</label><input id="cpRowHeight" type="text" placeholder="e.g. 40px" style="width:100%;padding:4px 6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;"></div>
          <div><label style="color:#94a3b8;font-size:0.7rem;display:block;">Cell Padding</label><input id="cpCellPad" type="text" placeholder="e.g. 8px" style="width:100%;padding:4px 6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;"></div>
          <div><label style="color:#94a3b8;font-size:0.7rem;display:block;">Min Width</label><input id="cpMinWidth" type="text" placeholder="e.g. 80px" style="width:100%;padding:4px 6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;"></div>
        </div>
      </div>
      <div style="padding:10px 12px;border-bottom:1px solid #334155;">
        <div style="color:#93c5fd;font-weight:600;margin-bottom:8px;">🎨 Colors</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div><label style="color:#94a3b8;font-size:0.7rem;display:block;">Background</label><input id="cpBgColor" type="color" value="#1e293b" style="width:100%;height:30px;border:1px solid #475569;border-radius:4px;background:#1e293b;cursor:pointer;"></div>
          <div><label style="color:#94a3b8;font-size:0.7rem;display:block;">Text Color</label><input id="cpTextColor" type="color" value="#e2e8f0" style="width:100%;height:30px;border:1px solid #475569;border-radius:4px;background:#1e293b;cursor:pointer;"></div>
        </div>
      </div>
      <div style="padding:10px 12px;border-bottom:1px solid #334155;">
        <div style="color:#93c5fd;font-weight:600;margin-bottom:8px;">🔲 Borders</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div><label style="color:#94a3b8;font-size:0.7rem;display:block;">Width</label><input id="cpBorderW" type="text" placeholder="e.g. 2px" style="width:100%;padding:4px 6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;"></div>
          <div><label style="color:#94a3b8;font-size:0.7rem;display:block;">Color</label><input id="cpBorderColor" type="color" value="#475569" style="width:100%;height:30px;border:1px solid #475569;border-radius:4px;background:#1e293b;cursor:pointer;"></div>
          <div><label style="color:#94a3b8;font-size:0.7rem;display:block;">Style</label><select id="cpBorderStyle" style="width:100%;padding:4px 6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;"><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="double">Double</option><option value="none">None</option></select></div>
          <div><label style="color:#94a3b8;font-size:0.7rem;display:block;">Radius</label><input id="cpBorderRadius" type="text" placeholder="e.g. 4px" style="width:100%;padding:4px 6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;"></div>
        </div>
      </div>
      <div style="padding:10px 12px;border-bottom:1px solid #334155;">
        <div style="color:#93c5fd;font-weight:600;margin-bottom:8px;">📝 Font</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
          <div><label style="color:#94a3b8;font-size:0.7rem;display:block;">Family</label><select id="cpFontFamily" style="width:100%;padding:4px 6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;"><option value="">Default</option><option value="Arial">Arial</option><option value="Calibri">Calibri</option><option value="Cambria">Cambria</option><option value="Georgia">Georgia</option><option value="Times New Roman">Times New Roman</option><option value="Verdana">Verdana</option><option value="Courier New">Courier New</option><option value="Consolas">Consolas</option></select></div>
          <div><label style="color:#94a3b8;font-size:0.7rem;display:block;">Size</label><select id="cpFontSize" style="width:100%;padding:4px 6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;"><option value="">Default</option><option value="8pt">8pt</option><option value="9pt">9pt</option><option value="10pt">10pt</option><option value="11pt">11pt</option><option value="12pt">12pt</option><option value="14pt">14pt</option><option value="16pt">16pt</option><option value="18pt">18pt</option><option value="20pt">20pt</option><option value="24pt">24pt</option><option value="28pt">28pt</option><option value="32pt">32pt</option><option value="36pt">36pt</option></select></div>
        </div>
        <div style="display:flex;gap:4px;margin-top:8px;">
          <button id="cpBold" style="flex:1;padding:6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;cursor:pointer;font-weight:bold;">B</button>
          <button id="cpItalic" style="flex:1;padding:6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;cursor:pointer;font-style:italic;">I</button>
          <button id="cpUnderline" style="flex:1;padding:6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;cursor:pointer;text-decoration:underline;">U</button>
        </div>
      </div>
      <div style="padding:10px 12px;border-bottom:1px solid #334155;">
        <div style="color:#93c5fd;font-weight:600;margin-bottom:8px;">📌 Alignment</div>
        <div style="display:flex;gap:4px;">
          <button id="cpAlignLeft" style="flex:1;padding:6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;cursor:pointer;">⬅</button>
          <button id="cpAlignCenter" style="flex:1;padding:6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;cursor:pointer;">⬛</button>
          <button id="cpAlignRight" style="flex:1;padding:6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;cursor:pointer;">➡</button>
          <button id="cpAlignJustify" style="flex:1;padding:6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;cursor:pointer;">◻</button>
        </div>
        <div style="display:flex;gap:4px;margin-top:6px;">
          <button id="cpVAlignTop" style="flex:1;padding:6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;cursor:pointer;font-size:0.7rem;">⬆ Top</button>
          <button id="cpVAlignMid" style="flex:1;padding:6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;cursor:pointer;font-size:0.7rem;">⬛ Mid</button>
          <button id="cpVAlignBot" style="flex:1;padding:6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;cursor:pointer;font-size:0.7rem;">⬇ Bot</button>
        </div>
      </div>
      <div style="padding:10px 12px;border-bottom:1px solid #334155;">
        <div style="color:#93c5fd;font-weight:600;margin-bottom:8px;">🔧 Actions</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
          <button id="cpInsRowAbove" style="padding:5px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;cursor:pointer;font-size:0.75rem;">↑ Row Above</button>
          <button id="cpInsRowBelow" style="padding:5px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;cursor:pointer;font-size:0.75rem;">↓ Row Below</button>
          <button id="cpInsColLeft" style="padding:5px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;cursor:pointer;font-size:0.75rem;">← Col Left</button>
          <button id="cpInsColRight" style="padding:5px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;cursor:pointer;font-size:0.75rem;">→ Col Right</button>
          <button id="cpDelRow" style="padding:5px;background:#7f1d1d;border:1px solid #475569;border-radius:4px;color:#fca5a5;cursor:pointer;font-size:0.75rem;">🗑 Delete Row</button>
          <button id="cpDelCol" style="padding:5px;background:#7f1d1d;border:1px solid #475569;border-radius:4px;color:#fca5a5;cursor:pointer;font-size:0.75rem;">🗑 Delete Col</button>
          <button id="cpMergeCells" style="padding:5px;background:#1e3a5f;border:1px solid #475569;border-radius:4px;color:#93c5fd;cursor:pointer;font-size:0.75rem;grid-column:span 2;">🔗 Merge Selected Cells</button>
        </div>
      </div>
      <div style="padding:10px 12px;">
        <div style="color:#93c5fd;font-weight:600;margin-bottom:8px;">📋 Assign Field Type</div>
        <select id="cpAssignSelect" style="width:100%;padding:6px;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#e2e8f0;margin-bottom:6px;">
          <option value="">— Select field type —</option>
          <optgroup label="Input Types">
            <option value="text">📝 Text</option><option value="date">📅 Date</option><option value="number">🔢 Number</option>
            <option value="signature">✍️ Signature</option><option value="textarea">📄 Multi-line</option><option value="select">🔽 Select</option>
            <option value="checkbox">☑️ Checkbox</option><option value="radio">🔘 Radio</option>
          </optgroup>
          <optgroup label="Database Fields">
            <option value="db_crewName">👤 Crew Name</option><option value="db_crew3lc">👤 Crew 3LC</option>
            <option value="db_crewLicense">🪪 License</option>
            <option value="db_pilotPosition">💺 Position</option>
            <option value="db_acType">✈️ A/C Type</option><option value="db_acReg">✈️ A/C Reg</option>
            <option value="db_instructorTri">🎓 Instructor</option><option value="db_examinerTre">📝 Examiner</option><option value="db_adIcao">🌍 AD/ICAO</option>
          </optgroup>
          <optgroup label="Trainer"><option value="trainer">🎓 TRI/TRE/SFI</option></optgroup>
        </select>
        <button id="cpAssignBtn" style="width:100%;padding:6px;background:#1d4ed8;border:none;border-radius:4px;color:#fff;cursor:pointer;">Assign to Cell</button>
      </div>
    </div>
  `;

  overlay.innerHTML = `
    <div style="background:#1e293b;border-radius:12px;width:98vw;max-width:1500px;height:90vh;display:flex;flex-direction:column;border:1px solid #334155;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;border-bottom:1px solid #334155;">
        <h3 style="color:#f1f5f9;margin:0;font-size:1.1rem;">🎨 Table Designer — ${esc(field.label || 'Table')}</h3>
        <button id="closeDesignBtn" style="background:none;border:none;color:#94a3b8;font-size:1.5rem;cursor:pointer;">&times;</button>
      </div>
      <div style="flex:1;overflow:hidden;display:flex;">
        <div style="flex:1;overflow:auto;position:relative;">
          <textarea id="${editorId}">${tableHtml}</textarea>
        </div>
        ${cellPropsHtml}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid #334155;">
        <button id="fdCancelBtn" style="padding:8px 20px;background:#334155;color:#e2e8f0;border:none;border-radius:6px;cursor:pointer;">Cancel</button>
        <button id="fdSaveBtn" style="padding:8px 20px;background:#1d4ed8;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;">💾 Save Design</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Init TinyMCE with full table editing (wait for modal to render)
  setTimeout(() => {
  tinymce.init({
    selector: '#' + editorId,
    height: 'calc(90vh - 160px)',
    width: '100%',
    skin: 'oxide-dark',
    content_css: 'dark',
    statusbar: true,
    branding: false,
    plugins: [
      'table', 'advtable', 'lists', 'link', 'code', 'preview', 'fullscreen',
      'searchreplace', 'visualblocks', 'visualchars', 'charmap', 'emoticons',
      'insertdatetime', 'hr', 'nonbreaking', 'save', 'pagebreak',
      'anchor', 'media', 'image', 'codesample', 'spellchecker'
    ],
    toolbar: 'undo redo | cut copy paste pastetext | formatselect fontselect fontsizeselect | bold italic underline strikethrough superscript subscript | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist | outdent indent | blockquote | removeformat | link image media | hr charmap emoticons codesample anchor | nonbreaking pagebreak | table tableprops deletetable | tableinsertrowbefore tableinsertrowafter tabledeleterow | tableinsertcolbefore tableinsertcolafter tabledeletecol | tablemergecells tablesplitcell | searchreplace code preview fullscreen save help',
    menubar: 'file edit insert view format table tools',
    menu: {
      file: { title: 'File', items: 'newdocument restoredraft | preview print' },
      edit: { title: 'Edit', items: 'undo redo | cut copy paste pastetext | selectall | searchreplace' },
      insert: { title: 'Insert', items: 'link image media table | charmap emoticons anchor hr pagebreak nonbreaking codesample' },
      view: { title: 'View', items: 'code visualaid | preview fullscreen' },
      format: { title: 'Format', items: 'bold italic underline strikethrough superscript subscript | forecolor backcolor | align | removeformat' },
      table: { title: 'Table', items: 'inserttable tableprops | deletetable | tableinsertrowbefore tableinsertrowafter tabledeleterow | tableinsertcolbefore tableinsertcolafter tabledeletecol | tablemergecells tablesplitcell' },
      tools: { title: 'Tools', items: 'code' }
    },
    font_formats: 'Arial=arial,helvetica,sans-serif; Calibri=calibri,arial,sans-serif; Courier New=courier new,courier; Georgia=georgia,palatino; Times New Roman=times new roman,times; Verdana=verdana,geneva; Cambria=cambria,serif; Consolas=consolas,monospace',
    fontsize_formats: '8pt 9pt 10pt 11pt 12pt 14pt 16pt 18pt 20pt 24pt 28pt 32pt 36pt 48pt',
    table_toolbar: 'tableprops tablecellprops | tableinsertrowbefore tableinsertrowafter tabledeleterow | tableinsertcolbefore tableinsertcolafter tabledeletecol | tablecellbackgroundcolor tablecellbordercolor tablecellborderstyle tablecellborderwidth tablecellwidth tablecellpadding tablecellvaligntoggle',
    table_default_styles: {
      'border-collapse': 'collapse',
      'width': '100%'
    },
    table_responsive_width: false,
    setup: function(editor) {
      editor.on('NodeChange', function(e) {
        // Track selected cell for field assignment
        window._fdSelectedCell = null;
        const td = e.element && e.element.closest ? e.element.closest('td,th') : null;
        if (td) window._fdSelectedCell = td;
      });
      editor.on('Click', function(e) {
        const td = e.target.closest ? e.target.closest('td,th') : null;
        if (td) window._fdSelectedCell = td;
      });
    },
    init_instance_callback: function(editor) {
      const body = editor.getBody();
      body.style.cursor = 'cell';

      // Track selected cell
      editor.on('Click NodeChange', function(e) {
        const td = (e.element || editor.selection.getNode()).closest ? (e.element || editor.selection.getNode()).closest('td,th') : null;
        if (td) {
          window._fdSelectedCell = td;
          // Update property panel inputs
          const cs = window.getComputedStyle(td);
          document.getElementById('cpBgColor').value = rgbToHex(cs.backgroundColor);
          document.getElementById('cpTextColor').value = rgbToHex(cs.color);
          document.getElementById('cpCellPad').value = (td.style.padding || '').replace('px','') || '';
          document.getElementById('cpColWidth').value = (td.style.width || '').replace('px','') || '';
          document.getElementById('cpMinWidth').value = (td.style.minWidth || '').replace('px','') || '';
          document.getElementById('cpRowHeight').value = (td.parentElement ? td.parentElement.style.height || '' : '').replace('px','') || '';
          const bw = td.style.borderWidth || '';
          document.getElementById('cpBorderW').value = bw;
          document.getElementById('cpBorderColor').value = rgbToHex(td.style.borderColor) || '#475569';
          document.getElementById('cpBorderStyle').value = td.style.borderStyle || 'solid';
          document.getElementById('cpBorderRadius').value = td.style.borderRadius || '';
          document.getElementById('cpFontFamily').value = (cs.fontFamily || '').replace(/["']/g,'').split(',')[0] || '';
          document.getElementById('cpFontSize').value = cs.fontSize || '';
        }
      });

      function getSelTd() { return window._fdSelectedCell; }

      // SIZE controls
      document.getElementById('cpColWidth').addEventListener('change', function() { const td = getSelTd(); if(td) td.style.width = this.value; });
      document.getElementById('cpMinWidth').addEventListener('change', function() { const td = getSelTd(); if(td) td.style.minWidth = this.value; });
      document.getElementById('cpRowHeight').addEventListener('change', function() { const td = getSelTd(); if(td && td.parentElement) td.parentElement.style.height = this.value; });
      document.getElementById('cpCellPad').addEventListener('change', function() { const td = getSelTd(); if(td) td.style.padding = this.value; });

      // COLOR controls
      document.getElementById('cpBgColor').addEventListener('input', function() { const td = getSelTd(); if(td) td.style.backgroundColor = this.value; });
      document.getElementById('cpTextColor').addEventListener('input', function() { const td = getSelTd(); if(td) td.style.color = this.value; });

      // BORDER controls
      document.getElementById('cpBorderW').addEventListener('change', function() { const td = getSelTd(); if(td) td.style.borderWidth = this.value; });
      document.getElementById('cpBorderColor').addEventListener('input', function() { const td = getSelTd(); if(td) { td.style.borderColor = this.value; td.style.borderStyle = td.style.borderStyle || 'solid'; } });
      document.getElementById('cpBorderStyle').addEventListener('change', function() { const td = getSelTd(); if(td) td.style.borderStyle = this.value; });
      document.getElementById('cpBorderRadius').addEventListener('change', function() { const td = getSelTd(); if(td) td.style.borderRadius = this.value; });

      // FONT controls
      document.getElementById('cpFontFamily').addEventListener('change', function() { const td = getSelTd(); if(td) td.style.fontFamily = this.value; });
      document.getElementById('cpFontSize').addEventListener('change', function() { const td = getSelTd(); if(td) td.style.fontSize = this.value; });
      document.getElementById('cpBold').addEventListener('click', function() { const td = getSelTd(); if(td) td.style.fontWeight = td.style.fontWeight === 'bold' ? 'normal' : 'bold'; this.style.background = td.style.fontWeight === 'bold' ? '#1d4ed8' : '#1e293b'; });
      document.getElementById('cpItalic').addEventListener('click', function() { const td = getSelTd(); if(td) td.style.fontStyle = td.style.fontStyle === 'italic' ? 'normal' : 'italic'; this.style.background = td.style.fontStyle === 'italic' ? '#1d4ed8' : '#1e293b'; });
      document.getElementById('cpUnderline').addEventListener('click', function() { const td = getSelTd(); if(td) td.style.textDecoration = td.style.textDecoration === 'underline' ? 'none' : 'underline'; this.style.background = td.style.textDecoration === 'underline' ? '#1d4ed8' : '#1e293b'; });

      // ALIGNMENT controls
      document.getElementById('cpAlignLeft').addEventListener('click', function() { const td = getSelTd(); if(td) td.style.textAlign = 'left'; });
      document.getElementById('cpAlignCenter').addEventListener('click', function() { const td = getSelTd(); if(td) td.style.textAlign = 'center'; });
      document.getElementById('cpAlignRight').addEventListener('click', function() { const td = getSelTd(); if(td) td.style.textAlign = 'right'; });
      document.getElementById('cpAlignJustify').addEventListener('click', function() { const td = getSelTd(); if(td) td.style.textAlign = 'justify'; });
      document.getElementById('cpVAlignTop').addEventListener('click', function() { const td = getSelTd(); if(td) td.style.verticalAlign = 'top'; });
      document.getElementById('cpVAlignMid').addEventListener('click', function() { const td = getSelTd(); if(td) td.style.verticalAlign = 'middle'; });
      document.getElementById('cpVAlignBot').addEventListener('click', function() { const td = getSelTd(); if(td) td.style.verticalAlign = 'bottom'; });

      // ROW/COLUMN actions
      document.getElementById('cpInsRowAbove').addEventListener('click', function() {
        const td = getSelTd(); if(!td || !td.parentElement) return;
        const tr = td.parentElement;
        const newRow = tr.cloneNode(true);
        newRow.querySelectorAll('td,th').forEach(c => { c.innerHTML = ''; c.removeAttribute('data-cell-type'); c.removeAttribute('data-db-name'); c.removeAttribute('data-field-label'); c.style.cssText = '';
        });
        tr.parentNode.insertBefore(newRow, tr);
      });
      document.getElementById('cpInsRowBelow').addEventListener('click', function() {
        const td = getSelTd(); if(!td || !td.parentElement) return;
        const tr = td.parentElement;
        const newRow = tr.cloneNode(true);
        newRow.querySelectorAll('td,th').forEach(c => { c.innerHTML = ''; c.removeAttribute('data-cell-type'); c.removeAttribute('data-db-name'); c.removeAttribute('data-field-label'); c.style.cssText = '';
        });
        tr.parentNode.insertBefore(newRow, tr.nextSibling);
      });
      document.getElementById('cpInsColLeft').addEventListener('click', function() {
        const td = getSelTd(); if(!td) return;
        const table = td.closest('table');
        const idx = Array.from(td.parentElement.children).indexOf(td);
        table.querySelectorAll('tr').forEach(tr => {
          const cell = tr.children[idx];
          const newCell = (cell.tagName === 'TH') ? document.createElement('th') : document.createElement('td');
          newCell.style.cssText = cell.style.cssText;
          newCell.innerHTML = '';
          tr.insertBefore(newCell, cell);
        });
      });
      document.getElementById('cpInsColRight').addEventListener('click', function() {
        const td = getSelTd(); if(!td) return;
        const table = td.closest('table');
        const idx = Array.from(td.parentElement.children).indexOf(td);
        table.querySelectorAll('tr').forEach(tr => {
          const cell = tr.children[idx];
          const newCell = (cell.tagName === 'TH') ? document.createElement('th') : document.createElement('td');
          newCell.style.cssText = cell.style.cssText;
          newCell.innerHTML = '';
          tr.insertBefore(newCell, cell.nextSibling);
        });
      });
      document.getElementById('cpDelRow').addEventListener('click', function() {
        const td = getSelTd(); if(!td || !td.parentElement) return;
        if(confirm('Delete this row?')) td.parentElement.remove();
      });
      document.getElementById('cpDelCol').addEventListener('click', function() {
        const td = getSelTd(); if(!td) return;
        if(!confirm('Delete this column?')) return;
        const table = td.closest('table');
        const idx = Array.from(td.parentElement.children).indexOf(td);
        table.querySelectorAll('tr').forEach(tr => { if(tr.children[idx]) tr.children[idx].remove(); });
      });
      document.getElementById('cpMergeCells').addEventListener('click', function() {
        alert('To merge: select cells with mouse (Ctrl+click), then use Table > Merge Cells from the menu bar.');
      });

      // FIELD ASSIGNMENT
      document.getElementById('cpAssignBtn').addEventListener('click', function() {
        const select = document.getElementById('cpAssignSelect');
        const type = select.value;
        if(!type) { alert('Select a field type'); return; }
        const td = getSelTd();
        if(!td) { alert('Select a cell first'); return; }
        const dbName = type.startsWith('db_') ? type.replace('db_','') : '';
        const label = select.options[select.selectedIndex].textContent.trim();
        td.setAttribute('data-cell-type', type);
        if(dbName) td.setAttribute('data-db-name', dbName);
        td.setAttribute('data-field-label', label);
        td.innerHTML = '<span style="color:#3b82f6;font-weight:bold;font-size:0.85rem;">' + label + '</span>';
        td.style.background = '#1e3a5f';
      });

      // Cancel
      document.getElementById('fdCancelBtn').addEventListener('click', () => {
        tinymce.get(editorId)?.remove();
        overlay.remove();
      });
      document.getElementById('closeDesignBtn').addEventListener('click', () => {
        tinymce.get(editorId)?.remove();
        overlay.remove();
      });

      // Save
      document.getElementById('fdSaveBtn').addEventListener('click', () => {
        const html = editor.getContent();
        field.content = html;
        field.generatedHtml = html;
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const table = tmp.querySelector('table');
        if(table) {
          const ths = table.querySelectorAll('thead th');
          const fieldColumns = [];
          ths.forEach(th => fieldColumns.push(th.textContent.trim()));
          field.columns = fieldColumns.length ? fieldColumns : ['Field', 'Value'];
          const trs = table.querySelectorAll('tbody tr');
          const fieldRows = [];
          trs.forEach(tr => {
            const firstTd = tr.querySelector('td');
            fieldRows.push({ label: firstTd ? firstTd.textContent.trim() : '', name: (firstTd ? firstTd.textContent.trim() : '').toLowerCase().replace(/[^a-z0-9]/g, '_'), rowStyles: {} });
          });
          if(fieldRows.length) field.rows = fieldRows;
          const cellConfigs = {};
          table.querySelectorAll('td[data-cell-type],th[data-cell-type]').forEach((td, i) => {
            cellConfigs['cell_design_' + i] = {
              type: td.getAttribute('data-cell-type'),
              dbName: td.getAttribute('data-db-name') || '',
              label: td.getAttribute('data-field-label') || td.textContent.trim(),
              options: [],
              trainerRole: td.getAttribute('data-trainer-role') || ''
            };
          });
          if(Object.keys(cellConfigs).length) field.cellConfigs = cellConfigs;
        }
        tinymce.get(editorId)?.remove();
        overlay.remove();
        selectField(field);
        updatePreview();
      });
    }
  });
  }, 100);

  function rgbToHex(rgb) {
    if(!rgb || rgb.startsWith('#')) return rgb || '#000000';
    const m = rgb.match(/\d+/g);
    if(!m || m.length < 3) return '#000000';
    return '#' + m.slice(0,3).map(x => parseInt(x).toString(16).padStart(2,'0')).join('');
  }
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

async function updateLivePreview() {
  if (document.getElementById('livePreviewPanel').classList.contains('hidden')) return;
  const frame = document.getElementById('livePreviewFrame');
  if (!frame) return;
  
  // Fetch crew data first if not already cached
  if (!window._previewCrewData) {
    try {
      const res = await fetch('/api/crew?source=crewName');
      window._previewCrewData = await res.json();
    } catch(e) {
      console.error('Failed to fetch crew data:', e);
      window._previewCrewData = [];
    }
  }
  
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
    let labelStyle = '';
    if (field.fontStyle === 'bold') labelStyle += 'font-weight:bold;';
    else if (field.fontStyle === 'italic') labelStyle += 'font-style:italic;';
    if (field.fontSize === 'small') labelStyle += 'font-size:0.85rem;';
    else if (field.fontSize === 'large') labelStyle += 'font-size:1.1rem;';
    else if (field.fontSize === 'xlarge') labelStyle += 'font-size:1.2rem;';
    html += `        <label style="${labelStyle}">${esc(field.label)}${field.required ? ' *' : ''}</label>\n`;
  }
  switch (field.type) {
    case 'text': case 'email': case 'number': case 'tel':
      html += `        <input type="${field.type}" name="${name}" placeholder="${esc(field.placeholder || '')}" ${field.required ? 'required' : ''}>
`;
      break;
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
      let taStyle = '';
      if (field.fontStyle === 'bold') taStyle += 'font-weight:bold;';
      else if (field.fontStyle === 'italic') taStyle += 'font-style:italic;';
      else if (field.fontStyle === 'bold-italic') taStyle += 'font-weight:bold;font-style:italic;';
      if (field.fontSize === 'small') taStyle += 'font-size:0.85rem;';
      else if (field.fontSize === 'large') taStyle += 'font-size:1.1rem;';
      else if (field.fontSize === 'xlarge') taStyle += 'font-size:1.2rem;';
      html += `        <textarea rows="${getTextareaRows(field)}" placeholder="${esc(field.placeholder || '')}" ${field.required ? 'required' : ''} style="${taStyle}"></textarea>\n`;
      break;
    case 'table':
      html += renderPreviewTable(field);
      break;
    case 'imported_html':
      html += '        <div class="imported-table-wrapper" style="margin:8px 0;overflow-x:auto;">\n';
      // Use content (from Visual Editor) if available, otherwise generatedHtml (from Table Importer)
      let tableHtml = field.content || field.generatedHtml || '<p>Empty imported table</p>';
      // Merge cellConfigs from saved data AND parse HTML for data-cell-type attributes
      const cellConfigs = { ...(field.cellConfigs || {}) };
      // Auto-detect cell types from HTML attributes (Visual Editor assignments)
      if (tableHtml.includes('data-cell-type') || tableHtml.includes('data-db-name')) {
        const tmpDiv = document.createElement('div');
        tmpDiv.innerHTML = tableHtml;
        tmpDiv.querySelectorAll('[data-cell-type], [data-db-name]').forEach(td => {
          const cellType = td.getAttribute('data-cell-type');
          const dbName = td.getAttribute('data-db-name');
          if (!cellType && !dbName) return;
          const cellId = td.getAttribute('data-cell-id') || ('ve_' + td.closest('table')?.querySelectorAll('[data-cell-type], [data-db-name]').indexOf(td));
          if (cellConfigs[cellId]) return;
          cellConfigs[cellId] = {
            type: cellType || (dbName ? 'db_' + dbName : 'text'),
            dbName: dbName || (cellType && cellType.startsWith('db_') ? cellType.replace('db_', '') : ''),
            label: td.getAttribute('data-field-label') || td.textContent.replace(/<[^>]+>/g, '').trim().substring(0, 50),
            options: [],
            trainerRole: td.getAttribute('data-trainer-role') || ''
          };
        });
      }
      if (Object.keys(cellConfigs).length) {
        // Parse and replace cells with inputs
        Object.entries(cellConfigs).forEach(([cellId, cfg]) => {
          const escapedId = cellId.replace(/[^a-zA-Z0-9_]/g, '');
          let inputHtml = '';
          const fieldName = cfg.dbName || escapedId;
          const label = cfg.label || '';
          
          switch(cfg.type) {
            case 'date':
              inputHtml = `<input type="text" name="${esc(fieldName)}" placeholder="dd/mmm/yyyy" pattern="[0-9]{2}/[A-Za-z]{3}/[0-9]{4}" onblur="formatDate(this)" onfocus="unformatDate(this)" style="width:100%;padding:4px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:0.85rem;">`;
              break;
            case 'signature':
              inputHtml = `<canvas class="signature-pad" data-field-name="${esc(fieldName)}" style="width:100%;max-width:100%;height:60px;border:1px solid #cbd5e1;border-radius:4px;cursor:crosshair;"></canvas><div style="text-align:right;"><button type="button" onclick="clearSignature(this)" style="font-size:0.7rem;color:#64748b;background:none;border:none;cursor:pointer;">Clear</button></div>`;
              break;
            case 'select':
              const opts = (cfg.options || ['Option 1','Option 2']).map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
              inputHtml = `<select name="${esc(fieldName)}" style="width:100%;padding:4px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:0.85rem;"><option value="">Select...</option>${opts}</select>`;
              break;
            case 'radio':
              const radios = (cfg.options || ['Yes','No']).map((o,i) => `<label style="font-size:0.8rem;margin-right:8px;"><input type="radio" name="${esc(fieldName)}" value="${esc(o)}"> ${esc(o)}</label>`).join('');
              inputHtml = radios;
              break;
            case 'checkbox':
              inputHtml = `<label style="font-size:0.8rem;"><input type="checkbox" name="${esc(fieldName)}"> ${esc(label || 'Yes')}</label>`;
              break;
            case 'textarea':
              inputHtml = `<textarea name="${esc(fieldName)}" rows="3" style="width:100%;padding:4px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:0.85rem;resize:vertical;" placeholder="..."></textarea>`;
              break;
            case 'number':
              inputHtml = `<input type="number" name="${esc(fieldName)}" style="width:100%;padding:4px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:0.85rem;" placeholder="...">`;
              break;
            case 'trainer':
              inputHtml = `<select class="trainer-field" name="${esc(fieldName)}" data-trainer-role="${esc(cfg.trainerRole || '')}" style="width:100%;padding:4px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:0.85rem;"><option value="">-- Trainer --</option><option value="TRI">TRI - Type Rating Instructor</option><option value="TRE">TRE - Type Rating Examiner</option><option value="SFI">SFI - Synthetic Flight Instructor</option><option value="CRMI">CRMI - CRM Instructor</option><option value="INSTR">Instructor</option></select>`;
              break;
            case 'remarks':
              inputHtml = `<textarea name="${esc(fieldName)}" rows="2" style="width:100%;padding:4px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:0.85rem;resize:vertical;" placeholder="Remarks..."></textarea>`;
              break;
            case 'static':
            case 'heading':
              inputHtml = `<span style="font-size:${cfg.type==='heading'?'1em':'0.9em'};font-weight:${cfg.type==='heading'?'bold':'normal'};">${esc(label)}</span>`;
              break;
            case 'text': default:
              if (cfg.type && cfg.type.startsWith('db_')) {
                const dbSource = cfg.type.replace('db_', '');
                const selId = 'db_' + escapedId + '_' + Math.random().toString(36).substr(2,5);
                inputHtml = `<select class="db-field" id="${selId}" data-db="${esc(dbSource)}" data-field-type="${esc(dbSource)}" style="width:100%;padding:4px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:0.85rem;"><option value="">-- Loading... --</option></select>`;
                inputHtml += `<script>setTimeout(function(){var s=document.getElementById('${selId}');if(!s)return;var rows=window.parent._previewCrewData||[];s.innerHTML='<option value="">-- Select --</option>';var seen={};rows.forEach(function(r){var v=r.${dbSource==='crewName'?'name':dbSource==='crew3lc'||dbSource==='crewId'?'three_lc':dbSource==='crewLicense'?'license_number':dbSource==='pilotPosition'?'position':dbSource==='acReg'?'ac_reg':dbSource==='adIcao'?'ad_icao':dbSource==='acType'?'ac_type':'name'}||'';var l=r.${dbSource==='crew3lc'||dbSource==='crewId'?'three_lc':dbSource==='crewLicense'?'license_number':dbSource==='pilotPosition'?'position':dbSource==='acReg'?'ac_reg':dbSource==='adIcao'?'ad_icao':dbSource==='acType'?'ac_type':'name'}||'';if(v&&!seen[v]){seen[v]=true;s.innerHTML+='<option value="'+v+'">'+l+'</option>';}});},100);</script>`;
              } else {
                inputHtml = `<input type="text" name="${esc(fieldName)}" style="width:100%;padding:4px 6px;border:1px solid #cbd5e1;border-radius:4px;font-size:0.85rem;" placeholder="...">`;
              }
          }
          
          // Replace cell content with input using data-cell-type or data-db-name
          const escapedContent = (cfg.label || cfg.dbName || cfg.type || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          let replaced = false;
          if (cfg.dbName) {
            const dbRegex = new RegExp('(<(?:td|th)[^>]*data-db-name=["\']' + cfg.dbName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\'][^>]*>)([\s\S]*?)(<\/td|th>)', 'i');
            const newHtml = tableHtml.replace(dbRegex, (m, open, content, close) => { replaced = true; return open + '<div style="margin-bottom:2px;"><small style="color:#64748b;font-size:0.7rem;">' + escapedContent + '</small></div>' + inputHtml + close; });
            if (replaced) tableHtml = newHtml;
          }
          if (!replaced && cfg.type) {
            const typeRegex = new RegExp('(<(?:td|th)[^>]*data-cell-type=["\']' + cfg.type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\'][^>]*>)([\s\S]*?)(<\/td|th>)', 'i');
            const newHtml = tableHtml.replace(typeRegex, (m, open, content, close) => { return open + '<div style="margin-bottom:2px;"><small style="color:#64748b;font-size:0.7rem;">' + escapedContent + '</small></div>' + inputHtml + close; });
            tableHtml = newHtml;
          }
        });
      }
      html += tableHtml;
      html += '        </div>\n';
      break;
    case 'signature':
      const sigH = getSignatureHeight(field);
      html += `        <canvas style="width:100%;max-width:200px;height:${sigH}px;border:1px solid #e2e8f0;border-radius:4px;"></canvas>
`;
      break;
    case 'db_crewName': case 'db_crewId': case 'db_crewLicense': case 'db_crew3lc':
    case 'db_instructorTri': case 'db_examinerTre': case 'db_pilotPosition':
    case 'db_acReg': case 'db_adIcao': case 'db_acType':
      {
        const dbName = field.dbSource || 'unknown';
        const selId = 'db_' + field.id + '_' + Math.random().toString(36).substr(2,5);
        html += `        <select class="db-field" id="${selId}" data-db="${esc(dbName)}" data-field-type="${esc(dbName)}" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px;">\n`;
        html += `          <option value="">-- Loading... --</option>\n`;
        html += `        </select>\n`;
        html += `<script>
setTimeout(function(){
  var rows = window.parent._previewCrewData || [];
  var s = document.getElementById('${selId}');
  if(!s) return;
  s.innerHTML = '<option value="">-- Select --</option>';
  var seen = {};
  rows.forEach(function(r){
    var v = '${dbName}'==='crewName'?r.name:'${dbName}'==='crew3lc'||'${dbName}'==='crewId'?r.three_lc:'${dbName}'==='crewLicense'?(r.license_number||''):'${dbName}'==='acReg'?(r.ac_reg||''):'${dbName}'==='adIcao'?(r.ad_icao||''):'${dbName}'==='acType'?(r.ac_type||''):r.name;
    var l = '${dbName}'==='crew3lc'||'${dbName}'==='crewId'?r.three_lc:'${dbName}'==='crewLicense'?(r.license_number||'N/A'):'${dbName}'==='instructorTri'?(r.name==='GFO'||r.is_sfi?'SFI':'TRI')+' - '+r.name:'${dbName}'==='examinerTre'?(r.name==='GFO'||r.is_sfe?'SFE':'TRE')+' - '+r.name:'${dbName}'==='acReg'?r.ac_reg:'${dbName}'==='adIcao'?r.ad_icao:'${dbName}'==='acType'?r.ac_type:r.name;
    if(v && !seen[v]) { seen[v]=true; s.innerHTML+='<option value="'+v+'">'+l+'</option>'; }
  });
  // Auto-fill crew data
  if('${dbName}'==='crewName'){
    s.addEventListener('change',function(){
      var sel=rows.find(x=>x.name===s.value);
      var form=s.closest('form')||s.closest('.builder-canvas')||document.body;
      var posSel=form.querySelector('select[data-field-type="pilotPosition"]');
      var licSel=form.querySelector('select[data-field-type="crewLicense"]');
      var tlcSel=form.querySelector('select[data-field-type="crew3lc"]');
      setTimeout(function(){
        if(posSel&&sel)posSel.value=sel.position||'';
        if(licSel&&sel)licSel.value=sel.license_number||'';
        if(tlcSel&&sel)tlcSel.value=sel.three_lc||'';
      },100);
    });
  }
  // Cascading filter for acType
  if('${dbName}'==='acType'){
    s.addEventListener('change',function(){
      var selectedType=s.value;
      var form=s.closest('form')||s.closest('.builder-canvas')||document.body;
      var regSel=form.querySelector('select[data-field-type="acReg"]');
      if(regSel){
        regSel.innerHTML='<option value="">-- Select --</option>';
        var filtered=selectedType?rows.filter(function(r){return r.ac_type===selectedType;}):rows;
        var seen2={};
        filtered.forEach(function(r){
          if(r.ac_reg&&!seen2[r.ac_reg]){seen2[r.ac_reg]=true;regSel.innerHTML+='<option value="'+r.ac_reg+'">'+r.ac_reg+'</option>';}
        });
      }
    });
  }
}, 50);
</script>
\n`;
      }
      break;
    case 'db_location': case 'db_fstdId':
      {
        const dbName = field.dbSource || 'unknown';
        const selId = 'db_' + field.id + '_' + Math.random().toString(36).substr(2,5);
        const roleAttr = dbName === 'location' ? 'location' : 'fstdId';
        html += `        <select class="db-field" id="${selId}" data-db="${esc(dbName)}" data-field-type="${esc(dbName)}" data-role="${roleAttr}" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px;">\n`;
        html += `          <option value="">-- Select --</option>\n`;
        html += `        </select>\n`;
        html += `<script>\n`;
        if (dbName === 'location') {
          html += `setTimeout(function(){fetch('/api/locations').then(r=>r.json()).then(locs=>{var s=document.getElementById('${selId}');if(!s)return;s.innerHTML='<option value="">-- Select --</option>';locs.forEach(loc=>{s.innerHTML+='<option value="'+loc+'">'+loc+'</option>';});s.addEventListener('change',function(){var fs=document.querySelector('select[data-role=fstdId]');if(!fs||!window._fstdData)return;fs.innerHTML='<option value="">-- Select --</option>';var v=s.value;var filt=v?window._fstdData.filter(function(f){return f.location_name===v;}):window._fstdData;filt.forEach(function(f){fs.innerHTML+='<option value="'+f.fstd_id+'">'+f.fstd_id+'</option>';});});});},100);\n`;
        } else if (dbName === 'fstdId') {
          html += `setTimeout(function(){fetch('/api/fstd-ids').then(r=>r.json()).then(fstds=>{window._fstdData=fstds;var s=document.getElementById('${selId}');if(!s)return;s.innerHTML='<option value="">-- Select --</option>';fstds.forEach(f=>{s.innerHTML+='<option value="'+f.fstd_id+'">'+f.fstd_id+'</option>';});});},100);\n`;
          html += `setTimeout(function(){fetch('/api/fstd-ids').then(r=>r.json()).then(fstds=>{var s=document.getElementById('${selId}');if(!s)return;s.innerHTML='<option value="">-- Select --</option>';fstds.forEach(f=>{s.innerHTML+='<option value="'+f.fstd_id+'">'+f.fstd_id+'</option>';});});},100);\n`;
        }
        html += `</script>\n`;
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

async function downloadPreviewForm() {
  try {
    currentForm.config.formId = document.getElementById('formId').value || '';
    currentForm.config.formIssue = document.getElementById('formIssue').value || '';
    currentForm.config.formRevision = document.getElementById('formRevision').value || '';
    currentForm.config.formDate = document.getElementById('formDate').value || '';
    currentForm.config.subtitle = document.getElementById('formSubtitle').value;
    const res = await fetch('/api/download-html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: currentForm.config })
    });
    const html = await res.text();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
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

async function deleteCurrentForm() {
  if (!currentForm.id) return;
  const name = document.getElementById('formId').value || currentForm.name || 'Untitled';
  if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;
  try {
    await fetch('/api/forms/' + currentForm.id, { method: 'DELETE' });
    showDashboard();
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
      const formId = cfg.formSubtitle || cfg.subtitle || '';  // Form ID (e.g. TA-TD-0001)
      const title = cfg.formId || cfg.title || f.name || '';  // Form Name
      const rev = cfg.formRevision || '';
      const date = formatDateString(cfg.formDate) || '';
      return `
        <tr onclick="editForm(${f.id})" style="cursor:pointer;">
          <td>${esc(formId)}</td>
          <td>${esc(title)}</td>
          <td>${esc(rev)}</td>
          <td>${esc(date)}</td>
          <td>Luis Rivas Robles</td>
          <td><div style="display:flex;gap:4px;"><button class="btn-action pdf" onclick="event.stopPropagation();downloadFormPdf(${f.id})" title="Download PDF">📄 PDF</button><button class="btn-action" onclick="event.stopPropagation();downloadFormHtml(${f.id})" title="Download HTML" style="background:#0ea5e9;color:#fff;border:none;padding:5px 10px;border-radius:4px;cursor:pointer;">🌐 HTML</button></div></td>
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
    const html = await fetch('/api/download-html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config })
    }).then(r => r.text());
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = function() {
      printWindow.print();
    };
  } catch (err) {
    console.error(err);
    alert('Error generating PDF');
  }
}

async function downloadFormHtml(formId) {
  try {
    const res = await fetch(`/api/forms/${formId}`);
    const form = await res.json();
    const config = typeof form.config_json === 'string' ? JSON.parse(form.config_json) : (form.config || {});
    const html = await fetch('/api/download-html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config })
    }).then(r => r.text());
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.formId || form.name || 'form'}.html`;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  } catch (err) {
    console.error(err);
    alert('Error downloading HTML');
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

    document.getElementById('deleteFormBtn').style.display = 'inline-flex';
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

function formatDateString(dateStr) {
  if (!dateStr) return '';
  if (/^\d{2}-\w{3}-\d{4}$/.test(dateStr)) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return parts[2] + '-' + months[parseInt(parts[1]) - 1] + '-' + parts[0];
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


// ===== SECTION IMPORT =====
let importTargetSection = 'session';

async function showSectionImport() {
  importTargetSection = currentSection || 'session';
  const sectionLabels = { session: 'Session Details', training: 'Training Details', comments: 'Comments & Signatures' };
  document.getElementById('sectionImportTitle').textContent = 'Import to ' + (sectionLabels[importTargetSection] || importTargetSection);
  document.getElementById('sectionImportHint').textContent = 'Select one or more templates to add to ' + (sectionLabels[importTargetSection] || importTargetSection) + ':';
  
  try {
    const res = await fetch('/api/templates');
    const allTemplates = await res.json();
    const templates = allTemplates.filter(t => t.section_type === importTargetSection);
    
    const list = document.getElementById('sectionImportList');
    if (!templates.length) {
      list.innerHTML = '<p style="color:#64748b;font-size:0.85rem;">No templates found for this section.</p>';
    } else {
      list.innerHTML = templates.map(t => {
        return '<label style="display:flex;align-items:flex-start;gap:10px;padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;cursor:pointer;">' +
          '<input type="checkbox" class="import-template-cb" value="' + t.id + '" style="margin-top:3px;">' +
          '<div><strong>' + esc(t.name) + '</strong>' +
          '<div style="color:#64748b;font-size:0.8rem;margin-top:2px;">' + esc(t.description || '') + '</div>' +
          '<div style="color:#94a3b8;font-size:0.75rem;margin-top:2px;">' + new Date(t.created_at).toLocaleDateString() + '</div></div></label>';
      }).join('');
    }
    
    document.getElementById('sectionImportModal').style.display = 'flex';
  } catch (err) {
    console.error(err);
    alert('Error loading templates');
  }
}

function closeSectionImport() {
  document.getElementById('sectionImportModal').style.display = 'none';
}

async function applyImportedTemplates() {
  const checkboxes = document.querySelectorAll('.import-template-cb:checked');
  if (!checkboxes.length) {
    alert('Please select at least one template');
    return;
  }
  
  const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));
  
  for (const id of ids) {
    try {
      const res = await fetch('/api/templates/' + id);
      const template = await res.json();
      const fields = JSON.parse(JSON.stringify(template.fields || []));
      
      currentForm.config.sections[importTargetSection] = currentForm.config.sections[importTargetSection] || [];
      currentForm.config.sections[importTargetSection].push({
        id: 'fieldset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        type: 'fieldset',
        title: template.name,
        fields: fields
      });
    } catch (err) {
      console.error('Error loading template ' + id, err);
    }
  }
  
  if (importTargetSection === currentSection) {
    renderCurrentSection();
  }
  updateLivePreview();
  closeSectionImport();
}

// ===== INIT =====
showDashboard();
loadTemplates();
loadSavedTables();

// ===== UPDATE DATABASE =====
var _dbFile = null;

function showUpdateDatabase() {
  document.getElementById('updateDbModal').style.display = 'flex';
  document.getElementById('dbFileInput').value = '';
  document.getElementById('dbFileName').style.display = 'none';
  document.getElementById('dbPreview').style.display = 'none';
  document.getElementById('dbStatus').style.display = 'none';
  document.getElementById('uploadDbBtn').disabled = true;
  _dbFile = null;
}

function closeUpdateDb() {
  document.getElementById('updateDbModal').style.display = 'none';
}

function handleDbFileSelect(input) {
  var file = input.files[0];
  if (!file) return;
  _dbFile = file;
  document.getElementById('dbFileName').textContent = file.name;
  document.getElementById('dbFileName').style.display = 'block';
  document.getElementById('uploadDbBtn').disabled = false;

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var rows;
      if (file.name.toLowerCase().endsWith('.csv')) {
        // Parse CSV
        var text = e.target.result;
        var lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
        rows = lines.map(function(line) {
          // Simple CSV parsing (handles quoted values)
          var result = [];
          var inQuote = false;
          var current = '';
          for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (ch === '"') { inQuote = !inQuote; }
            else if (ch === ',' && !inQuote) { result.push(current.trim()); current = ''; }
            else { current += ch; }
          }
          result.push(current.trim());
          return result;
        });
      } else {
        // Parse Excel
        var data = new Uint8Array(e.target.result);
        var wb = XLSX.read(data, {type: 'array'});
        var ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, {header: 1});
      }
      var preview = document.getElementById('dbPreviewContent');
      var html = '<table style="width:100%;border-collapse:collapse;">';
      var maxRows = Math.min(rows.length, 6);
      for (var i = 0; i < maxRows; i++) {
        html += '<tr>';
        rows[i].forEach(function(cell) {
          html += '<td style="padding:4px 8px;border:1px solid #e2e8f0;">' + (cell || '') + '</td>';
        });
        html += '</tr>';
      }
      html += '</table>';
      html += '<p style="color:#64748b;margin-top:8px;">' + rows.length + ' rows total</p>';
      preview.innerHTML = html;
      document.getElementById('dbPreview').style.display = 'block';
    } catch(err) {
      document.getElementById('dbStatus').style.display = 'block';
      document.getElementById('dbStatus').style.background = '#fef2f2';
      document.getElementById('dbStatus').style.color = '#dc2626';
      document.getElementById('dbStatus').textContent = 'Error reading file: ' + err.message;
    }
  };
  reader.readAsArrayBuffer(file);
}

function uploadDatabase() {
  if (!_dbFile) return;
  var status = document.getElementById('dbStatus');
  status.style.display = 'block';
  status.style.background = '#f0f9ff';
  status.style.color = '#0369a1';
  status.textContent = 'Uploading and processing...';
  document.getElementById('uploadDbBtn').disabled = true;

  var formData = new FormData();
  formData.append('file', _dbFile);
  fetch('/api/update-database', {method: 'POST', body: formData})
    .then(function(r) { return r.json(); })
    .then(function(result) {
      status.style.display = 'block';
      if (result.success) {
        status.style.background = '#f0fdf4';
        status.style.color = '#16a34a';
        status.innerHTML = '✅ Database updated successfully!<br>' +
          'Crew members: ' + result.crewCount + '<br>' +
          'Inserted: ' + result.inserted + ', Updated: ' + result.updated;
      } else {
        status.style.background = '#fef2f2';
        status.style.color = '#dc2626';
        status.textContent = '❌ ' + (result.error || 'Update failed');
      }
      document.getElementById('uploadDbBtn').disabled = false;
    })
    .catch(function(err) {
      status.style.background = '#fef2f2';
      status.style.color = '#dc2626';
      status.textContent = '❌ Network error: ' + err.message;
      document.getElementById('uploadDbBtn').disabled = false;
    });
}
// Initialize table grid cells
(function initTableGrid() {
  document.querySelectorAll('.table-grid').forEach(grid => {
    for (let i = 0; i < 100; i++) {
      const cell = document.createElement('div');
      cell.className = 'table-grid-cell';
      cell.dataset.row = Math.floor(i / 10) + 1;
      cell.dataset.col = (i % 10) + 1;
      grid.appendChild(cell);
    }
    
    const dropdown = grid.closest('.table-grid-dropdown');
    const info = dropdown?.querySelector('.table-grid-info');
    
    grid.addEventListener('mousemove', function(e) {
      const target = e.target.closest('.table-grid-cell');
      if (!target || !info) return;
      const row = parseInt(target.dataset.row);
      const col = parseInt(target.dataset.col);
      info.textContent = row + ' × ' + col;
      grid.querySelectorAll('.table-grid-cell').forEach(c => {
        const r = parseInt(c.dataset.row);
        const co = parseInt(c.dataset.col);
        c.classList.toggle('active', r <= row && co <= col);
      });
    });
    
    grid.addEventListener('click', function(e) {
      const target = e.target.closest('.table-grid-cell');
      if (!target) return;
      const rows = parseInt(target.dataset.row);
      const cols = parseInt(target.dataset.col);
      
      const editor = dropdown.closest('.prop-group')?.querySelector('[contenteditable]');
      if (!editor) return;
      editor.focus();
      
      const styleSelect = document.getElementById('newTableStyleSelect');
      const styleId = styleSelect?.value || 'simple';
      const style = TABLE_STYLES[styleId] || TABLE_STYLES['simple'];
      
      const tableHtml = '<table data-table-style="' + styleId + '" style="' + style.table + '">' +
        Array(rows).fill().map(() => '<tr>' + Array(cols).fill().map(() => '<td style="' + style.td + '">&nbsp;</td>').join('') + '</tr>').join('') +
        '</table><p></p>';
      
      document.execCommand('insertHTML', false, tableHtml);
      editor.dispatchEvent(new Event('input'));
      
      dropdown.style.display = 'none';
    });
    
    grid.addEventListener('mouseleave', function() {
      grid.querySelectorAll('.table-grid-cell').forEach(c => c.classList.remove('active'));
      if (info) info.textContent = '1 × 1';
    });
  });
})();

// ===== TinyMCE Integration =====
let tinyMCEInstances = {};

function initInfoBlockEditor(fieldId, initialContent) {
  const editorId = 'tinymce_' + fieldId;
  const holder = document.getElementById('editorjs_' + fieldId);
  if (!holder) return;
  
  // Replace holder with textarea for TinyMCE
  holder.innerHTML = '<textarea id="' + editorId + '">' + (initialContent || '') + '</textarea>';
  
  // Destroy existing instance
  if (tinyMCEInstances[fieldId]) {
    tinymce.get(editorId)?.remove();
    delete tinyMCEInstances[fieldId];
  }
  
  setTimeout(() => {
    tinymce.init({
      selector: '#' + editorId,
      height: 400,
      min_height: 300,
      resize: 'both',
      plugins: [
        'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
        'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
        'insertdatetime', 'media', 'table', 'help', 'wordcount',
        'emoticons', 'template', 'codesample', 'pagebreak',
        'save', 'directionality', 'nonbreaking', 'visualchars',
        'quickbars', 'autosave', 'imagetools', 'textpattern', 'autoresize'
      ],
      toolbar1: 'undo redo | formatselect fontselect fontsizeselect | bold italic underline strikethrough | forecolor backcolor | subscript superscript | removeformat',
      toolbar2: 'alignleft aligncenter alignright alignjustify | outdent indent | bullist numlist | table assignField | link image media anchor codesample | hr nonbreaking pagebreak',
      toolbar3: 'cut copy paste pastetext | searchreplace | code preview print save fullscreen | insertdatetime charmap emoticons | template | help wordcount',
      quickbars_selection_toolbar: 'bold italic | quicklink h2 h3 blockquote quickimage quicktable',
      quickbars_insert_toolbar: 'quickimage quicktable | hr',
      menubar: 'file edit insert view format table tools',
      menu: {
        file: { title: 'File', items: 'newdocument | preview | print' },
        edit: { title: 'Edit', items: 'undo redo | cut copy paste pastetext | selectall | searchreplace' },
        insert: { title: 'Insert', items: 'link image media insertdatetime table template codesample | charmap emoticons hr anchor pagebreak nonbreaking' },
        view: { title: 'View', items: 'code visualaid visualchars visualblocks | spellchecker | preview fullscreen' },
        format: { title: 'Format', items: 'bold italic underline strikethrough superscript subscript | formats | fontformats fontsizes align lineheight | forecolor backcolor | removeformat' },
        table: { title: 'Table', items: 'inserttable tableprops deletetable | cell row column | advtablesort tablecellvaligntoggle tablecellborderwidth tablecellborderstyle tablecellbackgroundcolor tablebordercolor' },
        tools: { title: 'Tools', items: 'spellchecker | code wordcount' }
      },
      style_formats: [
        { title: 'Headings', items: [
          { title: 'Heading 1', format: 'h1' },
          { title: 'Heading 2', format: 'h2' },
          { title: 'Heading 3', format: 'h3' },
          { title: 'Heading 4', format: 'h4' },
          { title: 'Heading 5', format: 'h5' },
          { title: 'Heading 6', format: 'h6' }
        ]},
        { title: 'Inline', items: [
          { title: 'Bold', format: 'bold', icon: 'bold' },
          { title: 'Italic', format: 'italic', icon: 'italic' },
          { title: 'Underline', format: 'underline', icon: 'underline' },
          { title: 'Strikethrough', format: 'strikethrough', icon: 'strikethrough' },
          { title: 'Superscript', format: 'superscript', icon: 'superscript' },
          { title: 'Subscript', format: 'subscript', icon: 'subscript' },
          { title: 'Code', format: 'code', icon: 'code' },
          { title: 'Highlight', inline: 'mark', classes: 'highlight', wrapper: true }
        ]},
        { title: 'Blocks', items: [
          { title: 'Paragraph', format: 'p' },
          { title: 'Blockquote', format: 'blockquote', wrapper: true },
          { title: 'Div', format: 'div', wrapper: true },
          { title: 'Pre', format: 'pre' }
        ]},
        { title: 'Alignment', items: [
          { title: 'Left', format: 'alignleft' },
          { title: 'Center', format: 'aligncenter' },
          { title: 'Right', format: 'alignright' },
          { title: 'Justify', format: 'alignjustify' }
        ]}
      ],
      font_formats: 'Arial=arial,helvetica,sans-serif; Arial Black=arial black,avant garde; Book Antiqua=book antiqua,palatino; Comic Sans MS=comic sans ms,sans-serif; Courier New=courier new,courier; Georgia=georgia,palatino; Helvetica=helvetica; Impact=impact,chicago; Symbol=symbol; Tahoma=tahoma,arial,helvetica,sans-serif; Terminal=terminal,monaco; Times New Roman=times new roman,times; Trebuchet MS=trebuchet ms,geneva; Verdana=verdana,geneva; Webdings=webdings; Wingdings=wingdings,zapf dingbats; Calibri=calibri,arial,sans-serif; Cambria=cambria,serif; Candara=candara,sans-serif; Consolas=consolas,monospace; Constantia=constantia,serif; Corbel=corbel,sans-serif',
      fontsize_formats: '8pt 9pt 10pt 11pt 12pt 13pt 14pt 15pt 16pt 18pt 20pt 22pt 24pt 26pt 28pt 32pt 36pt 40pt 44pt 48pt 54pt 60pt 72pt 96pt',
      lineheight_formats: '1 1.1 1.2 1.3 1.4 1.5 1.6 1.8 2 2.5 3',
      color_cols: 5,
      color_map: [
        '#000000', 'Black', '#1a1a1a', 'Dark Gray 1', '#333333', 'Dark Gray 2',
        '#4d4d4d', 'Dark Gray 3', '#666666', 'Medium Gray 1', '#808080', 'Medium Gray 2',
        '#999999', 'Medium Gray 3', '#b3b3b3', 'Light Gray 1', '#cccccc', 'Light Gray 2',
        '#e6e6e6', 'Light Gray 3', '#ffffff', 'White',
        '#ff0000', 'Red', '#ff3333', 'Light Red', '#cc0000', 'Dark Red',
        '#ff6600', 'Orange', '#ff9900', 'Light Orange', '#ffcc00', 'Yellow Orange',
        '#ffff00', 'Yellow', '#ffff33', 'Light Yellow', '#cccc00', 'Dark Yellow',
        '#00ff00', 'Green', '#33ff33', 'Light Green', '#00cc00', 'Dark Green',
        '#00ffcc', 'Cyan', '#00ffff', 'Light Cyan', '#009999', 'Dark Cyan',
        '#0000ff', 'Blue', '#3333ff', 'Light Blue', '#0000cc', 'Dark Blue',
        '#6600ff', 'Purple', '#9900ff', 'Light Purple', '#cc00ff', 'Magenta',
        '#ff00ff', 'Pink', '#ff33ff', 'Light Pink', '#ff66b3', 'Hot Pink',
        '#ff0066', 'Rose', '#cc0066', 'Dark Rose', '#99004d', 'Maroon'
      ],
      table_class_list: [
        { title: 'None', value: '' },
        { title: 'Simple', value: 'table-simple' },
        { title: 'Striped', value: 'table-striped' },
        { title: 'Bordered', value: 'table-bordered' },
        { title: 'Hover', value: 'table-hover' },
        { title: 'Compact', value: 'table-sm' },
        { title: 'Dark', value: 'table-dark' },
        { title: 'Light', value: 'table-light' }
      ],
      table_cell_class_list: [
        { title: 'None', value: '' },
        { title: 'Header', value: 'cell-header' },
        { title: 'Primary', value: 'cell-primary' },
        { title: 'Secondary', value: 'cell-secondary' },
        { title: 'Success', value: 'cell-success' },
        { title: 'Info', value: 'cell-info' },
        { title: 'Warning', value: 'cell-warning' },
        { title: 'Danger', value: 'cell-danger' },
        { title: 'Light', value: 'cell-light' },
        { title: 'Dark', value: 'cell-dark' }
      ],
      table_row_class_list: [
        { title: 'None', value: '' },
        { title: 'Header', value: 'row-header' },
        { title: 'Striped', value: 'row-striped' },
        { title: 'Success', value: 'row-success' },
        { title: 'Info', value: 'row-info' },
        { title: 'Warning', value: 'row-warning' },
        { title: 'Danger', value: 'row-danger' }
      ],
      table_advtab: true,
      table_cell_advtab: true,
      table_row_advtab: true,
      table_default_attributes: { border: '1' },
      table_default_styles: { 'border-collapse': 'collapse', width: '100%' },
      table_responsive_width: true,
      advtable_default_styles: {
        border: '1px solid #ccc',
        'border-collapse': 'collapse',
        width: '100%'
      },
      pagebreak_separator: '<!-- pagebreak -->',
      pagebreak_split_block: true,
      codesample_languages: [
        { text: 'HTML/XML', value: 'markup' },
        { text: 'JavaScript', value: 'javascript' },
        { text: 'CSS', value: 'css' },
        { text: 'PHP', value: 'php' },
        { text: 'Ruby', value: 'ruby' },
        { text: 'Python', value: 'python' },
        { text: 'Java', value: 'java' },
        { text: 'C', value: 'c' },
        { text: 'C#', value: 'csharp' },
        { text: 'C++', value: 'cpp' },
        { text: 'SQL', value: 'sql' },
        { text: 'Bash/Shell', value: 'bash' },
        { text: 'JSON', value: 'json' },
        { text: 'YAML', value: 'yaml' },
        { text: 'Markdown', value: 'markdown' }
      ],
      image_advtab: true,
      image_dimensions: true,
      image_class_list: [
        { title: 'None', value: '' },
        { title: 'Responsive', value: 'img-responsive' },
        { title: 'Rounded', value: 'img-rounded' },
        { title: 'Thumbnail', value: 'img-thumbnail' },
        { title: 'Circle', value: 'img-circle' },
        { title: 'Float Left', value: 'img-float-left' },
        { title: 'Float Right', value: 'img-float-right' }
      ],
      image_title: true,
      image_caption: true,
      link_context_toolbar: true,
      link_default_target: '_blank',
      link_title: true,
      target_list: [
        { title: 'None', value: '' },
        { title: 'Same page', value: '_self' },
        { title: 'New page', value: '_blank' },
        { title: 'Parent window', value: '_parent' }
      ],
      rel_list: [
        { title: 'No follow', value: 'nofollow' },
        { title: 'Sponsored', value: 'sponsored' },
        { title: 'UGC', value: 'ugc' }
      ],
      insertdatetime_formats: ['%H:%M:%S', '%Y-%m-%d', '%I:%M:%S %p', '%D', '%B %d, %Y', '%d/%m/%Y'],
      insertdatetime_element: true,
      template_replace_values: {
        username: 'User',
        staffid: '001'
      },
      templates: [
        { title: 'Basic Table', description: 'Simple bordered table', content: '<table style="border-collapse: collapse; width: 100%;" border="1"><tbody><tr><td style="width: 50%;">Cell 1</td><td style="width: 50%;">Cell 2</td></tr><tr><td style="width: 50%;">Cell 3</td><td style="width: 50%;">Cell 4</td></tr></tbody></table>' },
        { title: 'Two Columns', description: 'Two column layout', content: '<div style="display: flex; gap: 20px;"><div style="flex: 1;"><h3>Column 1</h3><p>Content here...</p></div><div style="flex: 1;"><h3>Column 2</h3><p>Content here...</p></div></div>' },
        { title: 'Callout Box', description: 'Highlighted info box', content: '<div style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 16px; margin: 16px 0;"><strong>Note:</strong> Important information here.</div>' },
        { title: 'Warning Box', description: 'Warning alert box', content: '<div style="background: #fff3e0; border-left: 4px solid #ff9800; padding: 16px; margin: 16px 0;"><strong>Warning:</strong> Be careful with this step.</div>' },
        { title: 'Danger Box', description: 'Danger alert box', content: '<div style="background: #ffebee; border-left: 4px solid #f44336; padding: 16px; margin: 16px 0;"><strong>Danger:</strong> Do not proceed without approval.</div>' }
      ],
      branding: false,
      promotion: false,
      elementpath: true,
      statusbar: true,
      paste_as_text: false,
      paste_enable_default_filters: true,
      paste_data_images: true,
      smart_paste: true,
      browser_spellcheck: true,
      contextmenu: 'link image table codesample assignField',
      textpattern_patterns: [
        { start: '*', end: '*', format: 'italic' },
        { start: '**', end: '**', format: 'bold' },
        { start: '#', format: 'h1' },
        { start: '##', format: 'h2' },
        { start: '###', format: 'h3' },
        { start: '1. ', cmd: 'InsertOrderedList' },
        { start: '* ', cmd: 'InsertUnorderedList' },
        { start: '- ', cmd: 'InsertUnorderedList' }
      ],
      autoresize_bottom_margin: 50,
      autosave_interval: '30s',
      autosave_prefix: 'tinymce-autosave-{path}{query}-{id}-',
      autosave_restore_when_empty: false,
      autosave_retention: '2m',
      setup: function(editor) {
        // Field picker dialog for table cells
        const fieldTypes = [
          { text: '📝 Text Input', value: 'text' },
          { text: '🔢 Number', value: 'number' },
          { text: '📅 Date', value: 'date' },
          { text: '🔽 Dropdown', value: 'select' },
          { text: '⭕ Radio', value: 'radio' },
          { text: '☑️ Checkbox', value: 'checkbox' },
          { text: '📄 Text Area', value: 'textarea' },
          { text: '✍️ Signature', value: 'signature' },
          { text: '🎓 Trainer Name', value: 'trainer' },
          { text: '📝 Remarks', value: 'remarks' },
          { text: '📌 Static Text', value: 'static' },
          { text: '📌 Heading', value: 'heading' },
          { text: '👤 Crew Name', value: 'db_crewName' },
          { text: '👤 Pilot Position', value: 'db_pilotPosition' },
          { text: '🪪 Crew ID', value: 'db_crewId' },
          { text: '📜 License Number', value: 'db_crewLicense' },
          { text: '🎓 Instructor (TRI)', value: 'db_instructorTri' },
          { text: '📝 Examiner (TRE)', value: 'db_examinerTre' },
          { text: '✈️ A/C Registration', value: 'db_acReg' },
          { text: '✈️ A/C Type', value: 'db_acType' },
          { text: '🌍 AD ICAO', value: 'db_adIcao' },
          { text: '👨‍✈️ Crew Role', value: 'db_crewRole' },
        ];

        editor.ui.registry.addButton('assignField', {
          icon: 'border-width',
          tooltip: 'Assign Field to Cell',
          onAction: function() { openFieldPicker(editor); }
        });

        // Shared function to open field picker
        function openFieldPicker(editor) {
          const selectedElm = editor.selection.getNode();
          const td = selectedElm.closest('td, th');
          if (!td) {
            editor.notificationManager.open({ text: 'Select a table cell first', type: 'warning', timeout: 2000 });
            return;
          }
          const currentType = td.getAttribute('data-cell-type') || 'text';
          editor.windowManager.open({
            title: 'Assign Field to Cell',
            body: {
              type: 'panel',
              items: [
                { type: 'htmlpanel', html: '<div style="padding:8px 0;font-size:13px;color:#94a3b8;">Cell: ' + (td.textContent.substring(0, 40) || '(empty)') + '...</div>' },
                { type: 'listbox', name: 'fieldType', label: 'Field Type', items: fieldTypes, value: currentType },
                { type: 'input', name: 'fieldName', label: 'Field Name (db column)', value: td.getAttribute('data-db-name') || '' },
                { type: 'input', name: 'fieldLabel', label: 'Field Label', value: td.getAttribute('data-field-label') || td.textContent.trim().substring(0, 50) }
              ]
            },
            buttons: [
              { type: 'cancel', text: 'Cancel' },
              { type: 'submit', text: 'Apply', primary: true }
            ],
            onSubmit: function(api) {
              const data = api.getData();
              const type = data.fieldType;
              const dbName = data.fieldName || (type.startsWith('db_') ? type.replace('db_', '') : '');
              const label = data.fieldLabel;

              if (type !== 'text') td.setAttribute('data-cell-type', type);
              else td.removeAttribute('data-cell-type');

              if (dbName) td.setAttribute('data-db-name', dbName);
              else td.removeAttribute('data-db-name');

              if (label) td.setAttribute('data-field-label', label);

              let badge = td.querySelector('.cell-field-badge');
              if (type !== 'text') {
                if (!badge) {
                  badge = editor.getDoc().createElement('span');
                  badge.className = 'cell-field-badge';
                  badge.style.cssText = 'display:inline-block;font-size:10px;padding:1px 5px;border-radius:3px;margin-left:4px;background:#1e40af;color:#93c5fd;font-weight:normal;';
                  td.appendChild(badge);
                }
                const typeNames = { text:'Text',number:'Number',date:'Date',select:'Dropdown',radio:'Radio',checkbox:'Checkbox',textarea:'Text Area',signature:'Signature',trainer:'Trainer',remarks:'Remarks',static:'Static',heading:'Heading',db_crewName:'Crew',db_pilotPosition:'Position',db_crewId:'ID',db_crewLicense:'License',db_instructorTri:'Instructor',db_examinerTre:'Examiner',db_acReg:'A/C Reg',db_acType:'A/C Type',db_adIcao:'AD ICAO',db_crewRole:'Role' };
                badge.textContent = typeNames[type] || type;
              } else if (badge) {
                badge.remove();
              }

              editor.fire('change');
              api.close();
            }
          });
        }

        editor.ui.registry.addMenuItem('assignField', {
          text: '🏷️ Assign Field Type',
          icon: 'border-width',
          onAction: function() { openFieldPicker(editor); }
        });

        editor.ui.registry.addButton('customSave', {
          icon: 'save',
          tooltip: 'Save Content',
          onAction: function() {
            const content = editor.getContent();
            const textarea = holder.closest('.prop-group')?.querySelector('#prop_content');
            if (textarea) {
              textarea.value = content;
              updateField('content', content);
            }
            editor.notificationManager.open({
              text: 'Content saved!',
              type: 'success',
              timeout: 2000
            });
          }
        });
        
        editor.on('change input blur ExecCommand', function() {
          const content = editor.getContent();
          const textarea = holder.closest('.prop-group')?.querySelector('#prop_content');
          if (textarea) {
            textarea.value = content;
            updateField('content', content);
          }
        });
        
        editor.on('init', function() {
          if (initialContent) {
            editor.setContent(initialContent);
          }
          editor.notificationManager.open({
            text: 'Editor ready! Use Format > Table for advanced table design.',
            type: 'info',
            timeout: 4000
          });
        });
      },
      init_instance_callback: function(editor) {
        tinyMCEInstances[fieldId] = editor;
      }
    });
  }, 200);
}

// Override showContentType for infoblock
const originalShowContentType = window.showContentType;
window.showContentType = function(fieldId, type) {
  if (type === 'text') {
    setTimeout(() => {
      const textarea = document.querySelector(`[id*="prop_content"]`);
      if (textarea) {
        initInfoBlockEditor(fieldId, textarea.value);
      }
    }, 150);
  }
  if (originalShowContentType) originalShowContentType(fieldId, type);
};

// Clean up on field change
const originalRenderProps = window.renderProperties;
window.renderProperties = function(field) {
  // Destroy all TinyMCE instances
  Object.keys(tinyMCEInstances).forEach(key => {
    const ed = tinyMCEInstances[key];
    if (ed && !ed.removed) {
      ed.remove();
    }
    delete tinyMCEInstances[key];
  });
  if (originalRenderProps) originalRenderProps(field);
};
