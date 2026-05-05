const express = require('express');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({dest: '/tmp/uploads/'});

// API: Get crew data
app.get("/api/crew", (req, res) => {
  const { source } = req.query;
  let query = "SELECT * FROM crew";
  let params = [];
  if (source === "instructorTri") {
    query += " WHERE is_tri = 1 OR is_sfi = 1";
  } else if (source === "examinerTre") {
    query += " WHERE is_tre = 1 OR is_sfe = 1";
  } else if (source === "examinerSfe") {
    query += " WHERE is_sfe = 1";
  } else if (source === "crewSfi") {
    query += " WHERE is_sfi = 1";
  } else if (source === "pilotPosition") {
    query = "SELECT DISTINCT position as name FROM crew WHERE position IS NOT NULL ORDER BY position";
    params = [];
  }
  if (source !== "pilotPosition") query += " ORDER BY name";
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (source === 'location') {
      db.all('SELECT DISTINCT name FROM locations ORDER BY name', [], (e, locs) => res.json(locs || []));
    } else if (source === 'fstdId') {
      const locParam = req.query.location;
      let q = 'SELECT DISTINCT fstd_id as name FROM fstd_ids';
      let p = [];
      if (locParam) { q += ' WHERE location_name = ?'; p = [locParam]; }
      db.all(q, p, (e, fstds) => res.json(fstds || []));
    } else {
      res.json(rows);
    }
  });
});

// API: Get locations
app.get('/api/locations', (req, res) => {
  db.all('SELECT DISTINCT name FROM locations ORDER BY name', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => r.name));
  });
});

// API: Get FSTD IDs by location
app.get('/api/fstd-ids', (req, res) => {
  const { location } = req.query;
  let query = 'SELECT DISTINCT fstd_id, location_name FROM fstd_ids';
  let params = [];
  if (location) {
    query += ' WHERE location_name = ?';
    params = [location];
  }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// API: List all forms
app.get('/api/forms', (req, res) => {
  db.all('SELECT id, name, form_type, description, config_json, created_at FROM forms ORDER BY updated_at DESC', [], (err, rows) => {
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
app.post('/api/forms', async (req, res) => {
  const { name, form_type, description, config } = req.body;
  const html = await generateHtml(config);
  db.run('INSERT INTO forms (name, form_type, description, config_json, html_template) VALUES (?, ?, ?, ?, ?)',
    [name, form_type, description || '', JSON.stringify(config), html],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

// API: Update form
app.put('/api/forms/:id', async (req, res) => {
  const { name, form_type, description, config } = req.body;
  const html = await generateHtml(config);
  db.run('UPDATE forms SET name = ?, form_type = ?, description = ?, config_json = ?, html_template = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [name, form_type, description || '', JSON.stringify(config), html, req.params.id],
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
app.post('/api/preview', async (req, res) => {
  const { config } = req.body;
  const html = await generateHtml(config, true);
  res.send(html);
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

// API: Saved Tables
app.get('/api/saved-tables', (req, res) => {
  db.all('SELECT id, name, description, created_at FROM saved_tables ORDER BY updated_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/saved-tables/:id', (req, res) => {
  db.get('SELECT * FROM saved_tables WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Table not found' });
    row.config = JSON.parse(row.config_json);
    res.json(row);
  });
});

app.post('/api/saved-tables', (req, res) => {
  const { name, description, config } = req.body;
  db.run('INSERT INTO saved_tables (name, description, config_json) VALUES (?, ?, ?)',
    [name, description || '', JSON.stringify(config)],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.patch('/api/saved-tables/:id', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  db.run('UPDATE saved_tables SET name = ?, updated_at = datetime("now") WHERE id = ?', [name, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

app.delete('/api/saved-tables/:id', (req, res) => {
  db.run('DELETE FROM saved_tables WHERE id = ?', [req.params.id], (err) => {
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

function formatFormDate(dateStr) {
  if (!dateStr) return '';
  if (/^\d{2}\/\w{3}\/\d{4}$/.test(dateStr)) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return parts[2] + '/' + months[parseInt(parts[1]) - 1] + '/' + parts[0];
}

async function generateHtml(config, isPreview = false) {
  const crewData = await new Promise((resolve) => {
    db.all('SELECT * FROM crew ORDER BY name', [], (err, rows) => resolve(rows || []));
  });
  const locationsData = await new Promise((resolve) => {
    db.all('SELECT DISTINCT name FROM locations ORDER BY name', [], (err, rows) => resolve(rows ? rows.map(r => r.name) : []));
  });
  const fstdData = await new Promise((resolve) => {
    db.all('SELECT fstd_id, location_name FROM fstd_ids', [], (err, rows) => resolve(rows || []));
  });
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>${esc(config.title || 'Training Form')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; margin: 0; padding: 10px; font-size: 16px; }
  .container { max-width: 1000px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); overflow: hidden; }
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
  .form-group { flex: 1; min-width: 120px; }
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
  canvas { background: #fff; border-radius: 6px; cursor: crosshair; touch-action: none; -webkit-user-select: none; user-select: none; }
  input[type="date"].has-date::-webkit-calendar-picker-indicator { display: none; }
  input[type="date"].has-date::-webkit-inner-spin-button,
  input[type="date"].has-date::-webkit-outer-spin-button { display: none; }
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
  <div class="header" style="display:flex;align-items:center;padding:16px 24px;gap:20px;">
      <img src="data:image/png;base64,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" alt="Texel Air" style="height:50px;width:auto;">
      <div style="flex:1;text-align:center;">
        <h1 style="margin:0;font-size:1.5rem;color:#fff;">${esc(config.title || config.formId || 'Training Form')}</h1>
        <div style="margin-top:6px;font-size:0.9rem;color:#fff;opacity:0.9;">
          ${config.subtitle || config.formIssue || config.formRevision || config.formDate ? `
            Form: ${esc(config.subtitle || '-')}${config.formIssue ? ` | Issue: ${esc(config.formIssue)}` : ''}${config.formRevision ? ` | Revision: ${esc(config.formRevision)}` : ''}${config.formDate ? ` | Date: ${formatFormDate(config.formDate)}` : ''}
          ` : ''}
        </div>
      </div>
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
  function submitForm() { console.log('Submit:', Object.fromEntries(new FormData(document.getElementById('trainingForm')))); alert('Submitted!'); }
  function downloadForm() { var html = document.documentElement.outerHTML; var blob = new Blob([html], {type: 'text/html;charset=utf-8'}); var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = (document.title || 'training-form') + '.html'; document.body.appendChild(a); a.click(); setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100); }
</script>
<script>
  var __crewData = ${JSON.stringify(crewData)};
  var __locationsData = ${JSON.stringify(locationsData)};
  var __fstdData = ${JSON.stringify(fstdData)};
  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.db-field').forEach(function(sel) {
      var source = sel.getAttribute('data-db');
      var data = __crewData;
      var filtered = [];
      if (source === 'instructorTri') filtered = data.filter(function(r){return r.is_tri || r.is_sfi;});
      else if (source === 'examinerTre') filtered = data.filter(function(r){return r.is_tre || r.is_sfe;});
      else if (source === 'examinerSfe') filtered = data.filter(function(r){return r.is_sfe;});
      else if (source === 'crewSfi') filtered = data.filter(function(r){return r.is_sfi;});
      else if (source === 'pilotPosition') {
        filtered = [{name: 'CAPT'}, {name: 'FO'}];
      }
      else filtered = data;
      if (source === 'location' || source === 'fstdId') return;
      filtered.forEach(function(r) {
        var opt = document.createElement('option');
        if (source === 'crewName') { opt.value = r.name; opt.textContent = r.name; }
        else if (source === 'crew3lc' || source === 'crewId') { opt.value = r.three_lc; opt.textContent = r.three_lc; }
        else if (source === 'crewLicense') { opt.value = r.license_number || ''; opt.textContent = r.license_number || 'N/A'; }
        else if (source === 'pilotPosition') { opt.value = r.name; opt.textContent = r.name; }
        else if (source === 'instructorTri') { var prefix = (r.name === 'GFO' || r.is_sfi) ? 'SFI' : 'TRI'; opt.value = r.name; opt.textContent = prefix + ' - ' + r.name; }
        else if (source === 'examinerTre') { var prefix = (r.name === 'GFO' || r.is_sfe) ? 'SFE' : 'TRE'; opt.value = r.name; opt.textContent = prefix + ' - ' + r.name; }
        else { opt.value = r.name; opt.textContent = r.name + (r.position ? ' (' + r.position + ')' : ''); }
        sel.appendChild(opt);
      });
    });
    // Auto-fill Pilot Position, License, 3LC when Crew Name changes
    document.querySelectorAll('select[data-db="crewName"]').forEach(function(crewSel) {
      crewSel.addEventListener('change', function() {
        var selected = crewSel.value;
        var pilot = __crewData.find(function(r) { return r.name === selected; });
        var row = crewSel.closest('.form-row') || crewSel.closest('fieldset');
        if (row && pilot) {
          var posSel = row.querySelector('select[data-db="pilotPosition"]');
          var licSel = row.querySelector('select[data-db="crewLicense"]');
          var tlcSel = row.querySelector('select[data-db="crew3lc"]');
          setTimeout(function(){
            if (posSel && pilot.position) posSel.value = pilot.position;
            if (licSel && pilot.license_number) licSel.value = pilot.license_number;
            if (tlcSel && pilot.three_lc) tlcSel.value = pilot.three_lc;
          }, 200);
        }
      });
    
    // Populate Location and FSTD ID dropdowns
    document.querySelectorAll('select[data-role="location"]').forEach(function(sel){
      (__locationsData || []).forEach(function(loc){
        var opt = document.createElement('option');
        opt.value = loc; opt.textContent = loc;
        sel.appendChild(opt);
      });
    });
    document.querySelectorAll('select[data-role="fstdId"]').forEach(function(sel){
      (__fstdData || []).forEach(function(f){
        var opt = document.createElement('option');
        opt.value = f.fstd_id; opt.textContent = f.fstd_id;
        sel.appendChild(opt);
      });
    });
    // When Location changes, filter FSTD ID dropdown
    function filterFstdForLoc(locSel, fstdSel) {
      var selectedLoc = locSel.value;
      fstdSel.innerHTML = '<option value="">-- Select --</option>';
      if (!__fstdData) return;
      var filtered = selectedLoc ? __fstdData.filter(function(f){return f.location_name === selectedLoc;}) : __fstdData;
      filtered.forEach(function(f){
        var opt = document.createElement('option');
        opt.value = f.fstd_id; opt.textContent = f.fstd_id;
        fstdSel.appendChild(opt);
      });
    }
    function initLocFstdFilter() {
      var allLocSels = Array.from(document.querySelectorAll('select[data-role="location"]'));
      var allFstdSels = Array.from(document.querySelectorAll('select[data-role="fstdId"]'));
      allLocSels.forEach(function(locSel, idx){
        var fstdSel = allFstdSels[idx];
        if (!fstdSel) return;
        locSel.addEventListener('change', function(){ filterFstdForLoc(locSel, fstdSel); });
        if (locSel.value) filterFstdForLoc(locSel, fstdSel);
      });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initLocFstdFilter);
    } else {
      initLocFstdFilter();
    }
    setTimeout(initLocFstdFilter, 300);
    setTimeout(initLocFstdFilter, 1000);

    // Signature canvas drawing
    function initCanvas(canvas) {
      if (canvas._sigInit) return;
      canvas._sigInit = true;
      var ctx = canvas.getContext('2d');
      var drawing = false;
      var lastX, lastY;

      
      function getPos(e) {
        var rect = canvas.getBoundingClientRect();
        var clientX, clientY;
        if (e.touches && e.touches.length) {
          clientX = e.touches[0].clientX;
          clientY = e.touches[0].clientY;
        } else {
          clientX = e.clientX;
          clientY = e.clientY;
        }
        return {
          x: (clientX - rect.left) * (canvas.width / rect.width),
          y: (clientY - rect.top) * (canvas.height / rect.height)
        };
      }
      
      function startDraw(e) {
        e.preventDefault();
        drawing = true;
        var p = getPos(e);
        lastX = p.x; lastY = p.y;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.strokeStyle = '#1a365d';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

      }
      
      function draw(e) {
        if (!drawing) return;
        e.preventDefault();
        var p = getPos(e);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = '#1a365d';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        lastX = p.x; lastY = p.y;
      }
      
      function stopDraw(e) {
        if (e) e.preventDefault();
        drawing = false;
      }
      
      canvas.addEventListener('mousedown', startDraw);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', stopDraw);
      canvas.addEventListener('mouseleave', stopDraw);
      canvas.addEventListener('touchstart', startDraw, {passive: false});
      canvas.addEventListener('touchmove', draw, {passive: false});
      canvas.addEventListener('touchend', stopDraw, {passive: false});
      canvas.addEventListener('touchcancel', stopDraw, {passive: false});
    }
    
    // Delay canvas init slightly to ensure layout is settled
    setTimeout(function() {
      document.querySelectorAll('canvas').forEach(initCanvas);
    }, 100);
    
    // Clear signature buttons
    document.querySelectorAll('.sig-clear-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var c = document.getElementById(btn.getAttribute('data-canvas'));
        if (c) { var ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height); }
  });
      });
    });
  });
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

function getFontStyle(field) {
  let style = '';
  if (field.fontStyle === 'bold') style += 'font-weight:bold;';
  else if (field.fontStyle === 'italic') style += 'font-style:italic;';
  else if (field.fontStyle === 'bold-italic') style += 'font-weight:bold;font-style:italic;';
  if (field.fontSize === 'small') style += 'font-size:0.85rem;';
  else if (field.fontSize === 'large') style += 'font-size:1.1rem;';
  else if (field.fontSize === 'xlarge') style += 'font-size:1.2rem;';
  return style;
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
    html += `        <div style="${ibStyle}">${ibContent}</div>\n`;
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
      html += `          <input type="${field.type}" name="${name}" placeholder="${esc(field.placeholder || '')}" ${field.required ? 'required' : ''} style="${getFontStyle(field)}">\n`;
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
    case 'db_crewName': case 'db_crewId': case 'db_crewLicense': case 'db_crew3lc':
    case 'db_instructorTri': case 'db_examinerTre': case 'db_pilotPosition':
    case 'db_location': case 'db_fstdId':
      {
        const dbName = field.dbSource || 'unknown';
        const isLocation = dbName === 'location';
        const isFstdId = dbName === 'fstdId';
        const extraAttr = isLocation ? ' data-role="location"' : (isFstdId ? ' data-role="fstdId"' : '');
        html += `          <select name="${name}" class="db-field" data-db="${esc(dbName)}"${extraAttr} style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px;width:100%;">\n`;
        html += `            <option value="">-- Select --</option>\n`;
        html += `          </select>\n`;
      }
      break;
  }

  html += `        </div>\n`;
  return html;
}

function renderTableHtml(field) {
  let html = `          <table>\n            <thead>\n              <tr>\n`;
  field.columns?.forEach((col, i) => {
    const colStyle = field.columnStyles?.[i] || {};
    let thStyle = '';
    if (colStyle.fontWeight === 'bold') thStyle += 'font-weight:bold;';
    if (colStyle.fontStyle === 'italic') thStyle += 'font-style:italic;';
    if (colStyle.fontSize === 'small') thStyle += 'font-size:0.8rem;';
    if (colStyle.fontSize === 'large') thStyle += 'font-size:1rem;';
    html += `                <th style="${thStyle}text-align:center;">${esc(col)}</th>\n`;
  });
  html += `              </tr>\n            </thead>\n            <tbody>\n`;

  field.rows?.forEach((row, idx) => {
    const rowLabel = typeof row === 'object' ? row.label : row;
    const rowName = typeof row === 'object' ? (row.name || row.id || ('row_' + idx)) : ('row_' + idx);
    const rowStyle = (typeof row === 'object' && row.rowStyles) ? row.rowStyles : {};
    let rowTdStyle = 'white-space:pre-line;';
    if (rowStyle.fontStyle === 'bold') rowTdStyle += 'font-weight:bold;';
    else if (rowStyle.fontStyle === 'italic') rowTdStyle += 'font-style:italic;';
    else if (rowStyle.fontStyle === 'bold-italic') rowTdStyle += 'font-weight:bold;font-style:italic;';
    if (rowStyle.fontSize === 'small') rowTdStyle += 'font-size:0.8rem;';
    else if (rowStyle.fontSize === 'large') rowTdStyle += 'font-size:1.05rem;';
    else if (rowStyle.fontSize === 'xlarge') rowTdStyle += 'font-size:1.15rem;';
    html += `              <tr>\n                <td style="${rowTdStyle}">${esc(rowLabel)}</td>\n`;
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
      } else if (colType === 'date') {
        html += `                <td><input type="date" name="${esc(fieldName)}_${i}" style="width:100%;padding:6px;border:1px solid #e2e8f0;border-radius:4px;" onchange="if(this.value){this.classList.add('has-date');}"></td>\n`;
      } else if (colType === 'db_crewName' || colType === 'db_crewId' || colType === 'db_crewLicense' || colType === 'db_crew3lc' || colType === 'db_instructorTri' || colType === 'db_examinerTre' || colType === 'db_pilotPosition' || colType === 'db_location' || colType === 'db_fstdId') {
        html += `                <td><select class="db-field" data-db="${colType.replace('db_','')}" name="${esc(fieldName)}_${i}" style="width:100%;padding:6px;border:1px solid #e2e8f0;border-radius:4px;"><option value="">-- Loading... --</option></select></td>\n`;
      } else if (colType === 'multiline') {
        const mlRows = field.columnRows?.[i] || 2;
        html += `                <td><textarea rows="${mlRows}" class="notes-input" name="${esc(fieldName)}_${i}" placeholder="..."></textarea></td>\n`;
      } else if (colType === 'signature') {
        const sigH = field.columnSigHeights?.[i] || '2row';
        const sigPx = { '1row': 40, '2row': 60, '3row': 100, '4row': 150, '5row': 200 }[sigH] || 60;
        const canvasId = `${esc(fieldName)}_${i}`;
        html += `                <td><div class="signature-box" style="position:relative;display:inline-block;width:100%;"><canvas id="${canvasId}" width="200" height="${sigPx}" style="border:1px solid #e2e8f0;border-radius:4px;cursor:crosshair;display:block;width:100%;"></canvas><button type="button" class="sig-clear-btn" data-canvas="${canvasId}" style="position:absolute;top:4px;right:4px;background:#ef4444;color:#fff;border:none;border-radius:3px;padding:2px 8px;font-size:0.7rem;cursor:pointer;pointer-events:auto;z-index:10;">Clear</button></div></td>\n`;
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

// HTML Cleaner route
app.get('/html-cleaner', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'converter.html'));
});

// API: Update database from Excel
app.post('/api/update-database', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.json({success: false, error: 'No file uploaded'});
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allRows = XLSX.utils.sheet_to_json(ws, {header: 1, defval: ''});
    // Skip first row (category headers) - row 1 has actual column names
    if (allRows.length < 2) return res.json({success: false, error: 'Invalid spreadsheet'});
    const headers = allRows[1];
    const rows = allRows.slice(2).filter(r => r.some(c => c !== '')).map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] || ''; });
      return obj;
    });
    if (!rows.length) return res.json({success: false, error: 'Empty spreadsheet'});

    // Map columns (flexible header matching)
    const colMap = {};
    var dataHeaders = Object.keys(rows[0]);
    dataHeaders.forEach(h => {
      const lower = h.toLowerCase().trim();
      if (lower.includes('3lc') || lower === 'code') colMap.three_lc = h;
      else if (lower.includes('name') || lower === 'nombre') colMap.name = h;
      else if (lower.includes('position') || lower.includes('puesto') || lower === 'pos') colMap.position = h;
      else if (lower.includes('license') || lower.includes('licencia')) colMap.license_number = h;
      else if (lower.includes('email') || lower === 'correo') colMap.email = h;
      else if (lower === 'sfi' || lower.includes('sfi')) colMap.is_sfi = h;
      else if (lower === 'tri' || lower.includes('tri')) colMap.is_tri = h;
      else if (lower === 'sfe' || lower.includes('sfe')) colMap.is_sfe = h;
      else if (lower === 'tre' || lower.includes('tre')) colMap.is_tre = h;
      else if (lower === 'location' || lower.includes('location')) colMap.location = h;
      else if (lower === 'fstd id' || lower.includes('fstd')) colMap.fstd_id = h;
    });

    let inserted = 0, updated = 0, skipped = 0;
    const processRow = (row) => {
      return new Promise((resolve) => {
        const name = row[colMap.name];
        const three_lc = row[colMap.three_lc] || '';
        if (!name) { skipped++; return resolve(); }

        db.get('SELECT id FROM crew WHERE name = ?', [name], (err, existing) => {
          if (existing) {
            db.run('UPDATE crew SET three_lc=?, position=?, license_number=?, email=?, is_sfi=?, is_tri=?, is_sfe=?, is_tre=? WHERE name=?',
              [three_lc, row[colMap.position] || '', row[colMap.license_number] || '', row[colMap.email] || '',
               row[colMap.is_sfi] ? 1 : 0, row[colMap.is_tri] ? 1 : 0, row[colMap.is_sfe] ? 1 : 0, row[colMap.is_tre] ? 1 : 0, name],
              () => { updated++; resolve(); });
          } else {
            db.run('INSERT INTO crew (three_lc, name, position, license_number, email, is_sfi, is_tri, is_sfe, is_tre) VALUES (?,?,?,?,?,?,?,?,?)',
              [three_lc, name, row[colMap.position] || '', row[colMap.license_number] || '', row[colMap.email] || '',
               row[colMap.is_sfi] ? 1 : 0, row[colMap.is_tri] ? 1 : 0, row[colMap.is_sfe] ? 1 : 0, row[colMap.is_tre] ? 1 : 0],
              () => { inserted++; resolve(); });
          }
        });
      });
    };

    Promise.all(rows.map(processRow)).then(() => {
      // Update locations and fstd_ids tables
      db.run('DELETE FROM locations', [], () => {
        db.run('DELETE FROM fstd_ids', [], () => {
          const locSet = {};
          rows.forEach(r => {
            const loc = r[colMap.location];
            const fstd = r[colMap.fstd_id];
            if (loc) {
              if (!locSet[loc]) locSet[loc] = new Set();
              if (fstd) locSet[loc].add(String(fstd));
            }
          });
          const locEntries = Object.keys(locSet);
          let locDone = 0;
          if (locEntries.length === 0) return finish();
          locEntries.forEach(loc => {
            db.run('INSERT OR IGNORE INTO locations (name) VALUES (?)', [loc], () => {
              locSet[loc].forEach(fstd => {
                db.run('INSERT INTO fstd_ids (fstd_id, location_name) VALUES (?, ?)', [fstd, loc], () => {});
              });
              locDone++;
              if (locDone === locEntries.length) finish();
            });
          });
        });
      });
      function finish() {
        db.get('SELECT COUNT(*) as cnt FROM crew', [], (err, r) => {
          res.json({success: true, inserted, updated, skipped, crewCount: r ? r.cnt : 0});
        });
      }
    });
  } catch(err) {
    res.json({success: false, error: err.message});
  }
});

const PORT = process.env.PORT || 8999;
app.listen(PORT, () => {
  console.log('Training Forms Builder running on port', PORT);
});
