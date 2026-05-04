// ===== STATE =====
let undoText = '';
let encodingEnabled = true;
const options = { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true };

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
  // Option toggles
  document.querySelectorAll('.htmlCo').forEach(el => {
    el.addEventListener('click', function() {
      const opt = parseInt(this.dataset.option);
      options[opt] = !options[opt];
      this.classList.toggle('active', options[opt]);
    });
  });

  // Individual clean buttons
  document.querySelectorAll('.doOptionNow').forEach(el => {
    el.addEventListener('click', function() {
      const opt = parseInt(this.dataset.option);
      doOneClean(opt);
    });
  });

  // Character counter
  document.getElementById('textEditor').addEventListener('input', updateCount);
  document.getElementById('sourceEditor').addEventListener('input', updateCount);
});

// ===== OPTIONS TOGGLE =====
function toggleOption(num) {
  options[num] = !options[num];
  document.getElementById('Clean00' + num).classList.toggle('active', options[num]);
}

// ===== CLEAN ALL CHECKED =====
function cleanAll() {
  undoText = document.getElementById('textEditor').value;
  let text = document.getElementById('textEditor').value;

  if (options[1]) text = removeInlineStyles(text);
  if (options[2]) text = removeClassesIds(text);
  if (options[3]) text = removeEmptyTags(text);
  if (options[4]) text = removeTagsWithOneSpace(text);
  if (options[5]) text = removeSuccessiveSpaces(text);
  if (options[6]) text = removeComments(text);
  if (options[7]) text = removeTagAttributes(text);
  if (options[8]) text = removeAllTags(text);

  document.getElementById('textEditor').value = text;
  document.getElementById('sourceEditor').value = text;
  updateCount();
  showHourglass();
}

// ===== INDIVIDUAL CLEAN =====
function doOneClean(opt) {
  undoText = document.getElementById('textEditor').value;
  let text = document.getElementById('textEditor').value;

  switch(opt) {
    case 1: text = removeInlineStyles(text); break;
    case 2: text = removeClassesIds(text); break;
    case 3: text = removeEmptyTags(text); break;
    case 4: text = removeTagsWithOneSpace(text); break;
    case 5: text = removeSuccessiveSpaces(text); break;
    case 6: text = removeComments(text); break;
    case 7: text = removeTagAttributes(text); break;
    case 8: text = removeAllTags(text); break;
  }

  document.getElementById('textEditor').value = text;
  document.getElementById('sourceEditor').value = text;
  updateCount();
}

// ===== CLEAN FUNCTIONS =====
function removeInlineStyles(text) {
  return text.replace(/\s*style\s*=\s*["'][^"']*["']/gi, '');
}

function removeClassesIds(text) {
  return text.replace(/\s*(class|id)\s*=\s*["'][^"']*["']/gi, '');
}

function removeEmptyTags(text) {
  return text.replace(/\s*<\w+[^>]*>\s*<\/\w+>/gi, '');
}

function removeTagsWithOneSpace(text) {
  return text.replace(/<\w+>\s<\/\w+>/gi, ' ');
}

function removeSuccessiveSpaces(text) {
  return text.replace(/\s{2,}/g, ' ');
}

function removeComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

function removeTagAttributes(text) {
  return text.replace(/<\w+\s+[^>]*>/g, function(match) {
    return match.replace(/\s+\w+\s*=\s*["'][^"']*["']/g, '').replace(/\s+\w+\s*=/g, '');
  });
}

function removeAllTags(text) {
  return text.replace(/<[^>]+>/g, '');
}

// ===== OTHER ACTIONS =====
function undoText() {
  if (undoText) {
    const temp = document.getElementById('textEditor').value;
    document.getElementById('textEditor').value = undoText;
    document.getElementById('sourceEditor').value = undoText;
    undoText = temp;
    updateCount();
  }
}

function clearPage() {
  undoText = document.getElementById('textEditor').value;
  document.getElementById('textEditor').value = '';
  document.getElementById('sourceEditor').value = '';
  updateCount();
}

function formatHtml() {
  let text = document.getElementById('textEditor').value;
  text = text.replace(/>\s*</g, '>\n<');
  text = text.replace(/\n\s*\n/g, '\n');
  document.getElementById('textEditor').value = text;
  document.getElementById('sourceEditor').value = text;
  updateCount();
}

function compressHtml() {
  let text = document.getElementById('textEditor').value;
  text = text.replace(/>\s+</g, '><').replace(/\n/g, '').replace(/\s{2,}/g, ' ');
  document.getElementById('textEditor').value = text;
  document.getElementById('sourceEditor').value = text;
  updateCount();
}

function toggleEncoding() {
  encodingEnabled = !encodingEnabled;
  let text = document.getElementById('textEditor').value;
  if (encodingEnabled) {
    text = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  } else {
    text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
  document.getElementById('textEditor').value = text;
  document.getElementById('sourceEditor').value = text;
}

// ===== DEMO CONTENT =====
function loadDemo() {
  undoText = document.getElementById('textEditor').value;
  const demo = `<p class="demoTitle">\u00a0\u00a0\u00a0\u00a0\u00a0 <span style="background: #16643d; color: #fff;"> \u00a0Text \u00a0</span>\u00a0-\u00a0HTML\u00a0.\u00a0com</p>
<p class="intro">Convert your visual text documents to HTML code instantly. Edit and clean your markup with a couple of clicks.</p>
<p style="text-align: center;"><a href="https://text-html.com/" target="_blank" rel="nofollow"><img style="width: 90%; max-width: 400px;" src="https://text-html.com/pics/paste-text-here-convert-html.jpg" alt="screenshot" /></a></p>
<h2>How to use the Text to HTML converter?</h2>
<ul>
\t<li>Paste a visual document to the left to convert it to HTML</li>
\t<li>Paste your HTML code it the right to preview the document</li>
</ul>
<p><strong>Press the <span style="display: inline-block; background: #16643d; color: #fff; padding: 5px 15px; border-radius: 8px;">Clean</span> button to execute the checked HTML cleaning options.</strong></p>`;
  document.getElementById('textEditor').value = demo;
  document.getElementById('sourceEditor').value = demo;
  updateCount();
}

function loadLorem() {
  undoText = document.getElementById('textEditor').value;
  const lorem = `<p>Lorem ipsum dolor sit amet, nonumes voluptatum mel ea, cu case ceteros cum. Novum commodo malorum vix ut. Dolores consequuntur in ius, sale electram dissentiunt quo te.</p>
<p>Eum facete intellegat ei, ut mazim melius usu. Has elit simul primis ne, regione minimum id cum.</p>
<p>Quo debet vivendo ex. Qui ut admodum senserit partiendo.</p>
<p>Te has amet modo perfecto, te eum mucius conclusionemque, mel te erat deterruisset.</p>`;
  document.getElementById('textEditor').value = lorem;
  document.getElementById('sourceEditor').value = lorem;
  updateCount();
}

// ===== UTILS =====
function updateCount() {
  const len = document.getElementById('textEditor').value.length;
  document.getElementById('inputLength').textContent = 'Characters: ' + len;
}

function showHourglass() {
  const h = document.getElementById('hourglassAnimation');
  h.style.display = 'block';
  h.textContent = '\u23f3';
  setTimeout(() => { h.style.display = 'none'; }, 800);
}

// Keep source editor in sync
document.getElementById('textEditor').addEventListener('input', function() {
  document.getElementById('sourceEditor').value = this.value;
});

document.getElementById('sourceEditor').addEventListener('input', function() {
  document.getElementById('textEditor').value = this.value;
});
