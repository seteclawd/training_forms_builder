const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: List all forms
app.get('/api/forms', (req, res) => {
  db.all('SELECT id, name, form_type, description, created_at FROM forms ORDER BY updated_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API: Get single form
app.get('/api/forms/:id', (req, res) => {
  db.get('SELECT * FROM forms WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Form not found' });
    row.config = JSON.parse(row.config_json);
    res.json(row);
  });
});

// API: Create form
app.post('/api/forms', (req, res) => {
  const { name, form_type, description, config } = req.body;
  db.run('INSERT INTO forms (name, form_type, description, config_json, html_template) VALUES (?, ?, ?, ?, ?)',
    [name, form_type, description || '', JSON.stringify(config), generateHtml(config)],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

// API: Update form
app.put('/api/forms/:id', (req, res) => {
  const { name, form_type, description, config } = req.body;
  db.run('UPDATE forms SET name = ?, form_type = ?, description = ?, config_json = ?, html_template = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, form_type, description || '', JSON.stringify(config), generateHtml(config), req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    });
});

// API: Delete form
app.delete('/api/forms/:id', (req, res) => {
  db.run('DELETE FROM forms WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// API: Preview form HTML
app.post('/api/preview', (req, res) => {
  const { config } = req.body;
  res.send(generateHtml(config, true));
});

// API: Section Templates
app.get('/api/templates', (req, res) => {
  db.all('SELECT id, name, section_type, description, created_at FROM section_templates ORDER BY updated_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/templates/:id', (req, res) => {
  db.get('SELECT * FROM section_templates WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Template not found' });
    row.fields = JSON.parse(row.fields_json);
    res.json(row);
  });
});

app.post('/api/templates', (req, res) => {
  const { name, section_type, description, fields } = req.body;
  db.run('INSERT INTO section_templates (name, section_type, description, fields_json) VALUES (?, ?, ?, ?)',
    [name, section_type, description || '', JSON.stringify(fields)],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/templates/:id', (req, res) => {
  const { name, section_type, description, fields } = req.body;
  db.run('UPDATE section_templates SET name = ?, section_type = ?, description = ?, fields_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, section_type, description || '', JSON.stringify(fields), req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    });
});

app.delete('/api/templates/:id', (req, res) => {
  db.run('DELETE FROM section_templates WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

function generateHtml(config, isPreview = false) {
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${esc(config.title || 'Training Form')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; margin: 0; padding: 10px; font-size: 16px; }
  .container { max-width: 900px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); overflow: hidden; }
  .header { background: #1a365d; color: #fff; padding: 20px; text-align: center; }
  .header h1 { margin: 0; font-size: 1.3rem; }
  .tabs { display: flex; background: #e2e8f0; border-bottom: 3px solid #cbd5e1; }
  .tab-btn { flex: 1; padding: 14px 8px; border: none; background: none; font-size: 0.9rem; font-weight: 600; color: #64748b; cursor: pointer; }
  .tab-btn.active { background: #fff; color: #1a365d; border-bottom: 3px solid #1a365d; margin-bottom: -3px; }
  .tab-content { display: none; padding: 20px; }
  .tab-content.active { display: block; }
  fieldset { border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  legend { font-weight: 700; color: #1a365d; padding: 0 8px; font-size: 1rem; }
  .form-row { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; }
  .form-group { flex: 1; min-width: 200px; }
  .form-group.full { flex: 0 0 100%; max-width: 100%; }
  label { display: block; font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 4px; }
  input, select, textarea { width: 100%; padding: 10px 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 1rem; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: #3182ce; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 8px; }
  th { background: #1a365d; color: #fff; padding: 10px; text-align: left; font-weight: 600; }
  td { padding: 10px; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
  tr:nth-child(even) { background: #f8fafc; }
  .radio-cell { text-align: center; width: 70px; }
  input[type="radio"] { width: 22px; height: 22px; }
  .notes-input { width: 100%; padding: 6px 8px; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 0.85rem; }
  .signature-box { border: 2px dashed #cbd5e1; border-radius: 10px; background: #f8fafc; text-align: center; padding: 10px; }
  canvas { background: #fff; border-radius: 6px; cursor: crosshair; touch-action: none; width: 100%; max-width: 400px; height: 120px; }
  .form-footer { padding: 20px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; gap: 12px; justify-content: center; }
  .btn { padding: 14px 28px; border: none; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; }
  .btn-primary { background: #1a365d; color: #fff; }
  .btn-secondary { background: #e2e8f0; color: #475569; }
  .result-option { display: flex; align-items: center; gap: 8px; padding: 12px 24px; border: 2px solid #e2e8f0; border-radius: 10px; cursor: pointer; }
  .result-option.selected-pass { border-color: #22c55e; background: #f0fdf4; }
  .result-option.selected-fail { border-color: #ef4444; background: #fef2f2; }
  .result-tag { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
  .tag-pass { background: #dcfce7; color: #166534; }
  .tag-fail { background: #fee2e2; color: #991b1b; }
  @media (max-width: 600px) { .form-group { min-width: 100%; } th, td { font-size: 0.8rem; padding: 8px 4px; } }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>${esc(config.formId || config.title || 'Training Form')}</h1>
    <div style="margin-top:8px;display:flex;justify-content:center;gap:20px;font-size:0.85rem;opacity:0.9;">
      ${config.formIssue ? `<span>Issue: ${esc(config.formIssue)}</span>` : ''}
      ${config.formRevision ? `<span>Rev: ${esc(config.formRevision)}</span>` : ''}
      ${config.formDate ? `<span>Date: ${esc(config.formDate)}</span>` : ''}
    </div>
    <p style="margin:8px 0 0;opacity:0.7;">${esc(config.subtitle || '')}</p>
  </div>
  <div class="tabs">
    <button class="tab-btn active" onclick="showTab(0)">Session Details</button>
    <button class="tab-btn" onclick="showTab(1)">Training Details</button>
    <button class="tab-btn" onclick="showTab(2)">Comments & Signatures</button>
  </div>
  <form id="trainingForm" onsubmit="return false;">`;

  const sectionNames = ['session', 'training', 'comments'];
  const sectionTitles = ['Session Details', 'Training Details', 'Comments & Signatures'];

  sectionNames.forEach((sec, idx) => {
    html += `\n    <div class="tab-content${idx === 0 ? ' active' : ''}">`;
    const fieldsets = config.sections?.[sec] || [];
    fieldsets.forEach(fs => {
      html += renderFieldsetHtml(fs);
    });
    html += `    </div>`;
  });

  html += `
    <div class="form-footer">
      <button type="button" class="btn btn-secondary" onclick="saveDraft()">Save Draft</button>
      <button type="button" class="btn btn-primary" onclick="submitForm()">Submit</button>
    </div>
  </form>
</div>
<script>
  function showTab(n) {
    document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', i===n));
    document.querySelectorAll('.tab-content').forEach((c,i) => c.classList.toggle('active', i===n));
  }
  function saveDraft() { localStorage.setItem('form_draft', JSON.stringify(Object.fromEntries(new FormData(document.getElementById('trainingForm'))))); alert('Draft saved'); }
  function submitForm() { console.log('Submit:', Object.fromEntries(new FormData(document.getElementById('trainingForm'))))); alert('Submitted!'); }
</script>
</body>
</html>`;

  return html;
}

function renderFieldsetHtml(fs) {
  let html = `      <fieldset>\n        <legend>${esc(fs.title)}</legend>\n`;
  const fields = fs.fields || [];
  if (!fields.length) {
    html += `      </fieldset>\n`;
    return html;
  }
  // Group fields by rowGroup
  const rows = {};
  fields.forEach(field => {
    const rg = field.rowGroup || 1;
    if (!rows[rg]) rows[rg] = [];
    rows[rg].push(field);
  });
  const sortedKeys = Object.keys(rows).sort((a, b) => parseInt(a) - parseInt(b));
  sortedKeys.forEach(rg => {
    const rowFields = rows[rg];
    html += `        <div class="form-row">\n`;
    rowFields.forEach(field => {
      html += renderFieldHtml(field);
    });
    html += `        </div>\n`;
  });
  html += `      </fieldset>\n`;
  return html;
}

function getHeightStyle(field) {
  const heights = {
    small: 'min-height: 32px;',
    medium: 'min-height: 60px;',
    large: 'min-height: 120px;',
    xlarge: 'min-height: 200px;'
  };
  return field.height && heights[field.height] ? heights[field.height] : '';
}

function getTextareaRows(field) {
  const rows = { small: 2, medium: 4, large: 8, xlarge: 15 };
  return field.height && rows[field.height] ? rows[field.height] : (field.rows || 3);
}

function getSignatureHeight(field) {
  const heights = { small: 60, medium: 100, large: 150, xlarge: 200 };
  return field.height && heights[field.height] ? heights[field.height] : 120;
}

function renderFieldHtml(field) {
  const name = field.name || field.id;
  let html = '';

  if (field.type === 'heading') {
    html += `        <${field.level || 'h3'}>${esc(field.label)}</${field.level || 'h3'}>\n`;
    return html;
  }

  const widthStyle = field.width && field.width !== 'auto' ? `flex: 0 0 ${field.width}%; max-width: ${field.width}%;` : '';
  const heightStyle = getHeightStyle(field);
  const combinedStyle = widthStyle || heightStyle ? ` style="${widthStyle}${heightStyle ? (widthStyle ? ' ' : '') + heightStyle : ''}"` : '';
  html += `        <div class="form-group${field.width === '100' ? ' full' : ''}"${combinedStyle}>\n`;
  if (field.type !== 'radio' && field.type !== 'checkbox') {
    html += `          <label>${esc(field.label)}${field.required ? ' *' : ''}</label>\n`;
  }

  switch (field.type) {
    case 'text':
    case 'email':
    case 'number':
    case 'tel':
    case 'date':
      html += `          <input type="${field.type}" name="${name}" placeholder="${esc(field.placeholder || '')}" ${field.required ? 'required' : ''}>\n`;
      break;
    case 'select':
      html += `          <select name="${name}" ${field.required ? 'required' : ''}>\n            <option value="">Select...</option>\n`;
      field.options?.forEach(opt => {
        html += `            <option value="${esc(opt.value)}">${esc(opt.label)}</option>\n`;
      });
      html += `          </select>\n`;
      break;
    case 'radio':
      html += `          <label>${esc(field.label)}${field.required ? ' *' : ''}</label>\n`;
      field.options?.forEach(opt => {
        html += `          <label><input type="radio" name="${name}" value="${esc(opt.value)}"> ${esc(opt.label)}</label>\n`;
      });
      break;
    case 'checkbox':
      html += `          <label>${esc(field.label)}${field.required ? ' *' : ''}</label>\n`;
      field.options?.forEach(opt => {
        html += `          <label><input type="checkbox" name="${name}[]" value="${esc(opt.value)}"> ${esc(opt.label)}</label>\n`;
      });
      break;
    case 'textarea':
      html += `          <textarea name="${name}" rows="${getTextareaRows(field)}" placeholder="${esc(field.placeholder || '')}" ${field.required ? 'required' : ''}></textarea>\n`;
      break;
    case 'table':
      html += renderTableHtml(field);
      break;
    case 'signature':
      const sigH = getSignatureHeight(field);
      html += `          <div class="signature-box">\n            <p style="margin:0 0 8px;color:#64748b;font-size:0.85rem;">${esc(field.label)}</p>\n            <canvas id="${name}" width="400" height="${sigH}"></canvas>\n          </div>\n`;
      break;
  }

  html += `        </div>\n`;
  return html;
}

function renderTableHtml(field) {
  let html = `          <table>\n            <thead>\n              <tr>\n`;
  field.columns?.forEach(col => {
    html += `                <th>${esc(col)}</th>\n`;
  });
  html += `              </tr>\n            </thead>\n            <tbody>\n`;

  field.rows?.forEach((row, idx) => {
    const rowLabel = typeof row === 'object' ? row.label : row;
    const rowName = typeof row === 'object' ? (row.name || row.id || ('row_' + idx)) : ('row_' + idx);
    html += `              <tr>\n                <td><strong>${esc(rowLabel)}</strong></td>\n`;
    for (let i = 1; i < (field.columns?.length || 1); i++) {
      const colType = field.columnTypes?.[i] || 'text';
      const fieldName = `${field.name || field.id}_${rowName}`;
      if (colType === 'radio') {
        html += `                <td class="radio-cell"><input type="radio" name="${esc(fieldName)}" value="${esc(field.columns[i])}"></td>\n`;
      } else if (colType === 'checkbox') {
        html += `                <td class="radio-cell"><input type="checkbox" name="${esc(fieldName)}_${i}"></td>\n`;
      } else if (colType === 'number') {
        html += `                <td><input type="number" class="notes-input" name="${esc(fieldName)}_${i}" placeholder="..."></td>\n`;
      } else if (colType === 'select') {
        html += `                <td><select name="${esc(fieldName)}_${i}"><option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option></select></td>\n`;
      } else if (colType === 'multiline') {
        const mlRows = fs.columnRows?.[i] || 2;
        html += `                <td><textarea rows="${mlRows}" class="notes-input" name="${esc(fieldName)}_${i}" placeholder="..."></textarea></td>\n`;
      } else if (colType === 'signature') {
        const sigH = fs.columnSigHeights?.[i] || '2row';
        const sigPx = { '1row': 40, '2row': 60, '3row': 100, '4row': 150, '5row': 200 }[sigH] || 60;
        html += `                <td><canvas id="${esc(fieldName)}_${i}" width="200" height="${sigPx}" style="border:1px solid #e2e8f0;border-radius:4px;cursor:crosshair;"></canvas></td>\n`;
      } else {
        html += `                <td><input type="text" class="notes-input" name="${esc(fieldName)}_${i}" placeholder="..."></td>\n`;
      }
    }
    html += `              </tr>\n`;
  });

  html += `            </tbody>\n          </table>\n`;
  return html;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PORT = process.env.PORT || 8999;
app.listen(PORT, () => {
  console.log('Training Forms Builder running on port', PORT);
});
