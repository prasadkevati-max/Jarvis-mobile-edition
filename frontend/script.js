'use strict';
// ===== J.A.R.V.I.S — script.js (clean rebuild) =====
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-2.5-flash'];
const SYSTEM_PROMPT = 'You are J.A.R.V.I.S, a friendly personal assistant for Prasshu. Reply naturally in a warm Telugu-English mix, using clear concise language. If you do not know, say so plainly.';
const $ = id => document.getElementById(id);

const chatEl = $('chat'), stage = $('conversation-stage'), welcome = $('welcome');
const input = $('msg'), sendBtn = $('send'), micBtn = $('mic-btn'), camBtn = $('cam-btn');
const imgInput = $('img-input'), clearBtn = $('clear-btn'), newChatBtn = $('new-chat');
const historyList = $('history-list'), historyCount = $('history-count');
const sidebar = $('sidebar'), backdrop = $('sidebar-backdrop');
const wakeBtn = $('wake-btn'), wakeStatus = $('wake-status');
const thinking = $('thinking-status'), thinkingLabel = $('thinking-label');

// ----- small style for message bubbles (works with any theme) -----
const st = document.createElement('style');
st.textContent = `
.jv-msg{display:flex;margin:10px 0;padding:0 4px}
.jv-msg.jv-user{justify-content:flex-end}
.jv-bubble{max-width:85%;padding:10px 14px;border-radius:16px;line-height:1.55;word-wrap:break-word;overflow-wrap:anywhere;background:rgba(128,128,128,.14)}
.jv-user .jv-bubble{background:rgba(124,92,255,.28)}
.jv-bubble code{background:rgba(128,128,128,.25);padding:1px 5px;border-radius:5px}
.jv-bubble img{max-width:100%;border-radius:10px;display:block;margin-bottom:6px}
.history-item{display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;text-align:left;background:none;border:0;color:inherit;padding:9px 10px;border-radius:10px;cursor:pointer;font:inherit;font-size:.85rem}
.history-item:hover,.history-item.active{background:rgba(128,128,128,.18)}
.history-item span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.history-del{opacity:.6;padding:0 6px}
`;
document.head.appendChild(st);

// ===== 1. API KEY =====
function getKey(force) {
  let k = localStorage.getItem('jarvis_key');
  if (!k || force) {
    k = (prompt('Enter your Gemini API Key:') || '').trim();
    if (k) localStorage.setItem('jarvis_key', k);
  }
  return k;
}

// ===== 2. GEMINI =====
async function callGemini(contents) {
  const key = getKey();
  if (!key) throw new Error('API key లేదు. Page reload చేసి Gemini API key ఇవ్వండి.');
  let lastErr = null;
  for (const model of GEMINI_MODELS) {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && !data.error) {
      const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
      if (text) return text;
      lastErr = new Error('Gemini empty response ఇచ్చింది.');
      continue;
    }
    const msg = data?.error?.message || ('Gemini error ' + res.status);
    if (res.status === 404) { lastErr = new Error(msg); continue; }
    if (res.status === 400 && /api key/i.test(msg) || res.status === 403) localStorage.removeItem('jarvis_key');
    throw new Error(msg);
  }
  throw lastErr || new Error('Gemini request failed.');
}

// ===== 3. CHAT STORAGE =====
let chats = [];
let currentId = null;
try {
  const saved = JSON.parse(localStorage.getItem('jarvis_chats') || '[]');
  if (Array.isArray(saved)) chats = saved.filter(c => c && Array.isArray(c.messages));
} catch (e) {}
function saveChats() {
  try { localStorage.setItem('jarvis_chats', JSON.stringify(chats.slice(0, 40))); } catch (e) {}
}
function currentChat() { return chats.find(c => c.id === currentId); }
function newChat() {
  const c = { id: 'c' + Date.now(), title: 'New chat', messages: [], ts: Date.now() };
  chats.unshift(c);
  currentId = c.id;
  saveChats(); renderHistory(); renderChat();
  return c;
}

// ===== 4. RENDER =====
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmt(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>');
}
function addBubble(role, text, imgSrc) {
  const row = document.createElement('div');
  row.className = 'jv-msg ' + (role === 'user' ? 'jv-user' : 'jv-ai');
  const b = document.createElement('div');
  b.className = 'jv-bubble';
  b.innerHTML = (imgSrc ? '<img src="' + imgSrc + '" alt="attached image">' : '') + fmt(text);
  row.appendChild(b);
  chatEl.appendChild(row);
  stage.scrollTop = stage.scrollHeight;
  return row;
}
function renderChat() {
  chatEl.innerHTML = '';
  const c = currentChat();
  const has = c && c.messages.length > 0;
  welcome.style.display = has ? 'none' : '';
  if (has) c.messages.forEach(m => addBubble(m.role === 'user' ? 'user' : 'ai', m.text));
  stage.scrollTop = stage.scrollHeight;
}
function renderHistory() {
  historyList.innerHTML = '';
  const list = chats.filter(c => c.messages.length > 0);
  historyCount.textContent = list.length ? String(list.length) : '';
  list.forEach(c => {
    const item = document.createElement('div');
    item.className = 'history-item' + (c.id === currentId ? ' active' : '');
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    const t = document.createElement('span'); t.textContent = c.title;
    const del = document.createElement('span'); del.className = 'history-del'; del.textContent = '×'; del.title = 'Delete';
    del.onclick = e => {
      e.stopPropagation();
      chats = chats.filter(x => x.id !== c.id);
      if (currentId === c.id) { currentId = null; chats.length ? currentId = chats[0].id : newChat(); }
      saveChats(); renderHistory(); renderChat();
    };
    item.onclick = () => { currentId = c.id; renderHistory(); renderChat(); setSidebar(false); };
    item.append(t, del);
    historyList.appendChild(item);
  });
}
function setThinking(on, label) {
  thinking.hidden = !on;
  if (label) thinkingLabel.textContent = label;
  document.body.classList.toggle('is-thinking', on);
}

// ===== 5. TOOLS (no AI needed) =====
async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function handleTools(text) {
  const t = text.toLowerCase();
  if (/\b(what time|current time|time now|what is the time|today'?s date|what is the date|what day)\b/.test(t)) {
    return 'ఇప్పుడు ' + new Date().toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' }) + ', Boss.';
  }
  if (/\b(roll (a )?dice|dice)\b/.test(t)) return 'You rolled ' + (Math.floor(Math.random() * 6) + 1) + ', Boss.';
  if (/\b(flip (a )?coin|coin toss|toss (a )?coin)\b/.test(t)) return Math.random() < 0.5 ? 'Heads, Boss.' : 'Tails, Boss.';
  if (/\b(bitcoin|btc)\b/.test(t)) {
    try {
      const d = await getJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,inr');
      return 'Bitcoin ఇప్పుడు $' + Number(d.bitcoin.usd).toLocaleString('en-US') + ' (₹' + Number(d.bitcoin.inr).toLocaleString('en-IN') + '), Boss.';
    } catch (e) { return 'Crypto service error, Boss. కొంచెం తర్వాత try చేయండి.'; }
  }
  if (/\b(weather|forecast|temperature)\b/.test(t)) {
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 }));
      const { latitude, longitude } = pos.coords;
      const d = await getJson('https://api.open-meteo.com/v1/forecast?latitude=' + latitude + '&longitude=' + longitude + '&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=auto');
      const c = d.current;
      return 'ఇప్పుడు temperature ' + c.temperature_2m + '°C, humidity ' + c.relative_humidity_2m + '%, wind ' + c.wind_speed_10m + ' km/h, Boss.';
    } catch (e) { return 'Weather కోసం location permission ఇవ్వండి, Boss.'; }
  }
  if (/\bpassword\b/.test(t) && /\b(generate|strong|make|new)\b/.test(t)) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    const arr = new Uint32Array(16); crypto.getRandomValues(arr);
    return 'Your strong password: ' + Array.from(arr, n => chars[n % chars.length]).join('');
  }
  return null;
}

// ===== 6. SEND =====
let busy = false;
let pendingImage = null; // { data, mime, preview }

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const url = fr.result;
      resolve({ data: String(url).split(',')[1], mime: file.type || 'image/jpeg', preview: url });
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

async function send(speakReply) {
  if (busy) return;
  const text = input.value.trim();
  if (!text && !pendingImage) return;
  busy = true;
  const chatObj = currentChat() || newChat();
  const img = pendingImage; pendingImage = null;
  camBtn.style.opacity = '';
  input.value = ''; autosize();
  welcome.style.display = 'none';

  const shown = text || 'Analyze this image';
  addBubble('user', shown, img && img.preview);
  chatObj.messages.push({ role: 'user', text: shown + (img ? ' [image]' : '') });
  if (chatObj.title === 'New chat') chatObj.title = shown.slice(0, 40);
  renderHistory();

  setThinking(true, 'J.A.R.V.I.S is thinking');
  let reply;
  try {
    const tool = img ? null : await handleTools(text);
    if (tool) {
      reply = tool;
    } else {
      const history = chatObj.messages.slice(-21, -1).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
      const parts = [{ text: shown }];
      if (img) parts.push({ inline_data: { mime_type: img.mime, data: img.data } });
      reply = await callGemini([...history, { role: 'user', parts }]);
    }
  } catch (e) {
    reply = 'SYSTEM: ' + (e.message || 'Something went wrong.');
    chatObj.messages.push({ role: 'model', text: reply });
    addBubble('ai', reply);
    setThinking(false); busy = false; saveChats(); resumeWake();
    return;
  }
  chatObj.messages.push({ role: 'model', text: reply });
  addBubble('ai', reply);
  saveChats();
  setThinking(false);
  busy = false;
  if (speakReply || wakeOn) speakText(reply); else resumeWake();
}

sendBtn.onclick = () => send(false);
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(false); }
});
function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 160) + 'px';
}
input.addEventListener('input', autosize);

document.querySelectorAll('.prompt-card').forEach(card => {
  card.onclick = () => { input.value = card.dataset.prompt || ''; send(false); };
});

// ===== 7. IMAGE =====
camBtn.onclick = () => imgInput.click();
imgInput.onchange = async () => {
  const f = imgInput.files && imgInput.files[0];
  if (!f) return;
  try {
    pendingImage = await fileToImage(f);
    camBtn.style.opacity = '.5';
    input.placeholder = 'Image attached — type a question or press send';
    input.focus();
  } catch (e) { addBubble('ai', 'SYSTEM: Image load కాలేదు.'); }
  imgInput.value = '';
};

// ===== 8. VOICE + WAKE WORD =====
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const WAKE = /\b(?:hey|hi|ok|okay)?\s*(?:jarvis|jarvis|jarwis|service)\b/i;
let rec = null, recActive = false, recMode = 'manual', wakeOn = false, awaiting = false, speaking = false;

function updateWake() {
  wakeStatus.textContent = wakeOn ? (recActive ? 'WAKE: LISTENING' : 'WAKE: ON') : 'WAKE: OFF';
  wakeBtn.classList.toggle('active', wakeOn);
}
function startRec(mode) {
  if (!rec || recActive) return;
  recMode = mode;
  try { rec.start(); recActive = true; } catch (e) {}
  micBtn.classList.toggle('listening', mode === 'manual');
  updateWake();
}
function stopRec() { try { rec && rec.stop(); } catch (e) {} }
function resumeWake() { if (wakeOn && !speaking && !busy) setTimeout(() => startRec('wake'), 400); }
function handleVoice(cmd) { input.value = cmd; send(true); }

function onHeard(t) {
  if (recMode === 'manual') { stopRec(); handleVoice(t); return; }
  const m = t.match(WAKE);
  if (awaiting) {
    const cmd = m ? t.slice(m.index + m[0].length).replace(/^[\s,.:;!?-]+/, '') : t;
    if (cmd) { awaiting = false; stopRec(); handleVoice(cmd); }
    return;
  }
  if (!m) return;
  const cmd = t.slice(m.index + m[0].length).replace(/^[\s,.:;!?-]+/, '').trim();
  stopRec();
  if (cmd) handleVoice(cmd);
  else { awaiting = true; addBubble('ai', 'చెప్పు, వింటున్నాను.'); speakText('చెప్పు, వింటున్నాను.'); }
}

if (SR) {
  rec = new SR();
  rec.lang = 'en-IN';
  rec.continuous = true;
  rec.interimResults = false;
  rec.onresult = e => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (!e.results[i].isFinal) continue;
      const t = (e.results[i][0].transcript || '').trim();
      if (t) onHeard(t);
    }
  };
  rec.onerror = e => {
    recActive = false; micBtn.classList.remove('listening');
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      wakeOn = false;
      addBubble('ai', 'SYSTEM: Microphone permission block అయింది. Browser settings లో allow చేయండి.');
    }
    updateWake();
  };
  rec.onend = () => {
    recActive = false; micBtn.classList.remove('listening');
    updateWake();
    resumeWake();
  };
} else {
  wakeBtn.disabled = true;
  wakeStatus.textContent = 'VOICE UNAVAILABLE';
}

micBtn.onclick = () => {
  if (!rec) { addBubble('ai', 'SYSTEM: ఈ browser లో voice input support లేదు. Chrome వాడండి.'); return; }
  if (recActive) { stopRec(); return; }
  startRec('manual');
};
wakeBtn.onclick = () => {
  if (!rec) { addBubble('ai', 'SYSTEM: ఈ browser లో wake word support లేదు.'); return; }
  wakeOn = !wakeOn; awaiting = false;
  if (wakeOn) { if (recActive) stopRec(); setTimeout(() => startRec('wake'), 300); }
  else stopRec();
  updateWake();
};

function speakText(text) {
  if (!('speechSynthesis' in window)) { resumeWake(); return; }
  window.speechSynthesis.cancel();
  const clean = String(text).replace(/[*`#]/g, '');
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = /[\u0C00-\u0C7F]/.test(clean) ? 'te-IN' : 'en-IN';
  speaking = true;
  const done = () => { speaking = false; resumeWake(); };
  u.onend = done; u.onerror = done;
  window.speechSynthesis.speak(u);
}

// ===== 9. SIDEBAR, SETTINGS, THEME =====
function setSidebar(open) {
  sidebar.classList.toggle('open', open);
  document.body.classList.toggle('sidebar-open', open);
  backdrop.hidden = !open;
}
$('menu-btn').onclick = () => setSidebar(true);
backdrop.onclick = () => setSidebar(false);
$('sidebar-toggle').onclick = () => {
  if (window.innerWidth <= 900) setSidebar(false);
  else document.querySelector('.app-shell').classList.toggle('sidebar-collapsed');
};

function openSettings(open) {
  $('settings-panel').hidden = !open;
  $('settings-scrim').hidden = !open;
}
$('settings-open').onclick = () => openSettings(true);
$('settings-close').onclick = () => openSettings(false);
$('settings-scrim').onclick = () => openSettings(false);

const themeSelect = $('theme-select');
const savedTheme = localStorage.getItem('jarvis_theme');
if (savedTheme) { document.documentElement.dataset.theme = savedTheme; themeSelect.value = savedTheme; }
themeSelect.onchange = () => {
  document.documentElement.dataset.theme = themeSelect.value;
  localStorage.setItem('jarvis_theme', themeSelect.value);
};

function clearCurrent() {
  const c = currentChat();
  if (c) { c.messages = []; c.title = 'New chat'; }
  saveChats(); renderHistory(); renderChat();
  openSettings(false);
}
clearBtn.onclick = clearCurrent;
$('clear-memory-setting').onclick = clearCurrent;
newChatBtn.onclick = () => { newChat(); setSidebar(false); input.focus(); };

// ===== 10. START =====
if (chats.length) currentId = chats[0].id; else newChat();
renderHistory();
renderChat();
updateWake();
