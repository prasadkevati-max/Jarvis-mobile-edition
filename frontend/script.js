// ===== 1. API KEY =====
let API_KEY = localStorage.getItem('jarvis_key');
if (!API_KEY) {
  API_KEY = prompt('Enter your Gemini API Key:');
  if (API_KEY) localStorage.setItem('jarvis_key', API_KEY);
}
const MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"];

// ===== 2. ELEMENTS + MEMORY =====
const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const sendBtn = document.getElementById('send');
const micBtn = document.getElementById('mic-btn');
const camBtn = document.getElementById('cam-btn');
const clearBtn = document.getElementById('clear-btn');
const imgInput = document.getElementById('img-input');
const preview = document.getElementById('preview');
const coreText = document.getElementById('core-text');

let MEMORY = [];
try {
  const stored = JSON.parse(localStorage.getItem('jarvis_memory') || '[]');
  if (Array.isArray(stored)) {
    MEMORY = stored.filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string');
  }
} catch (e) {
  localStorage.removeItem('jarvis_memory');
}
function saveMemory() {
  localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY.slice(-40)));
}

function add(text, cls) {
  const d = document.createElement('div');
  d.className = 'msg' + (cls === 'user' ? ' user' : '');
  d.textContent = text;
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
}
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = /[\u0C00-\u0C7F]/.test(text) ? 'te-IN' : 'en-IN';
  speechSynthesis.speak(u);
}
function setStatus(t) { if (coreText) coreText.textContent = t; }

MEMORY.forEach(m => add((m.role === 'user' ? 'YOU: ' : 'J.A.R.V.I.S: ') + m.text, m.role === 'user' ? 'user' : 'ai'));

// ===== 3. TOOLS =====
async function fetchToolJson(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('No geolocation'));
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 });
  });
}

async function handleTools(text) {
  const t = text.toLowerCase();
  const open = u => window.open(u, '_blank', 'noopener,noreferrer');

  if (/^\s*(?:please\s+)?(?:open\s+youtube|youtube\s+open|youtube)\s*[.!?]*\s*$/i.test(text)) {
    open('https://www.youtube.com');
    return 'Opening YouTube, Boss.';
  }
  if (/^\s*(?:please\s+)?(?:open\s+google|google\s+open|google)\s*[.!?]*\s*$/i.test(text)) {
    open('https://www.google.com');
    return 'Opening Google, Boss.';
  }

  const urlCmd = text.match(/^\s*(?:open|visit|go to)\s+(https?:\/\/\S+)\s*$/i);
  if (urlCmd) {
    try {
      const dest = new URL(urlCmd[1]);
      open(dest.href);
      return 'Opening ' + dest.hostname + ', Boss.';
    } catch (e) { return 'That link does not look valid.'; }
  }

  const g = text.match(/^\s*(?:google\s+search|search\s+(?:on\s+)?google)(?:\s+for)?\s+(.+?)\s*$/i);
  if (g) {
    open('https://www.google.com/search?q=' + encodeURIComponent(g[1]));
    return 'Searching Google for ' + g[1] + ', Boss.';
  }

  const yt = text.match(/^\s*play\s+(.+?)\s*$/i)
    || text.match(/^\s*youtube(?:\s+search)?(?:\s+for)?\s+(.+?)\s*$/i)
    || text.match(/^\s*search\s+(?:on\s+)?youtube(?:\s+for)?\s+(.+?)\s*$/i);
  if (yt) {
    open('https://www.youtube.com/results?search_query=' + encodeURIComponent(yt[1]));
    return 'Searching YouTube for ' + yt[1] + ', Boss.';
  }

  if (/\b(?:current\s+time|what.*time|time\s+enti|samayam)\b/i.test(t) || t.trim() === 'time')
    return 'Ippudu ' + new Date().toLocaleTimeString() + ', ' + new Date().toLocaleDateString();
  if (t.trim() === 'date' || /\b(?:today.?s?\s+date|what.*date)\b/i.test(t))
    return 'Ee roju ' + new Date().toLocaleDateString();

  if (/\bweather\b/i.test(t)) {
    try {
      const p = await getPosition();
      const { latitude: la, longitude: lo } = p.coords;
      const d = await fetchToolJson('https://api.open-meteo.com/v1/forecast?latitude=' + la + '&longitude=' + lo + '&current=temperature_2m,wind_speed_10m');
      return 'Current temperature ' + d.current.temperature_2m + '°C, wind ' + d.current.wind_speed_10m + ' km/h.';
    } catch (e) { return 'Weather teeyaleka poyanu. Location permission ivvandi.'; }
  }

  if (/\b(?:bitcoin|btc|crypto)\b/i.test(t)) {
    try {
      const d = await fetchToolJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,inr');
      return 'Bitcoin: $' + d.bitcoin.usd + ' / Rs ' + d.bitcoin.inr;
    } catch (e) { return 'Crypto price teeyaleka poyanu.'; }
  }

  if (/\bnews\b/i.test(t)) {
    try {
      const ids = await fetchToolJson('https://hacker-news.firebaseio.com/v0/topstories.json');
      const items = await Promise.all(ids.slice(0, 3).map(i => fetchToolJson('https://hacker-news.firebaseio.com/v0/item/' + i + '.json')));
      return 'Top tech news: ' + items.map((x, i) => (i + 1) + '. ' + x.title).join(' ');
    } catch (e) { return 'News teeyaleka poyanu.'; }
  }

  const s = text.match(/^\s*(?:search|look up)\s+(?:for\s+)?(.+?)\s*$/i);
  if (s) {
    try {
      const url = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' + encodeURIComponent(s[1]) + '&format=json&origin=*';
      const data = await fetchToolJson(url);
      const r = data && data.query && data.query.search && data.query.search[0];
      if (!r) return 'I could not find that, Boss.';
      const snippet = String(r.snippet || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&');
      return 'Wikipedia: ' + r.title + '. ' + snippet;
    } catch (e) { return 'Search error, Boss.'; }
  }

  return null;
}

// ===== 4. GEMINI BRAIN =====
async function callGeminiRaw(prompt, imagePart) {
  if (!API_KEY) throw new Error('Gemini API key is missing.');
  const parts = [{ text: prompt }];
  if (imagePart) parts.push(imagePart);
  const body = JSON.stringify({ contents: [{ role: 'user', parts }] });
  let lastErr = 'Unknown error';
  for (const m of MODELS) {
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + encodeURIComponent(API_KEY), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body
      });
      const data = await res.json();
      if (!res.ok) { lastErr = (data.error && data.error.message) || ('HTTP ' + res.status); continue; }
      const txt = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
        ? data.candidates[0].content.parts.map(p => p.text || '').join('') : '';
      if (txt) return txt;
    } catch (e) { lastErr = e.message; }
  }
  throw new Error(lastErr);
}

async function callGemini(prompt, imagePart) {
  if (!API_KEY) throw new Error('Gemini API key is missing.');
  const contents = MEMORY.slice(-12).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
  const parts = [{ text: prompt }];
  if (imagePart) parts.push(imagePart);
  contents.push({ role: 'user', parts });
  let lastErr = 'Unknown error';
  for (const m of MODELS) {
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + encodeURIComponent(API_KEY), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      });
      const data = await res.json();
      if (!res.ok) { lastErr = (data.error && data.error.message) || ('HTTP ' + res.status); continue; }
      const txt = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
        ? data.candidates[0].content.parts.map(p => p.text || '').join('') : '';
      if (txt) return txt;
    } catch (e) { lastErr = e.message; }
  }
  throw new Error(lastErr);
}

// ===== 5. AGENT MODE =====
const AGENT_TOOLS = Object.freeze({
  time: () => handleTools('current time'),
  weather: () => handleTools('weather'),
  news: () => handleTools('news'),
  crypto: () => handleTools('bitcoin')
});

function isAgentModeRequest(text = '') {
  const v = String(text);
  if (/\b(?:agent(?:\s+mode)?|run\s+(?:the\s+)?agent|use\s+(?:the\s+)?agent)\b/i.test(v)) return true;
  if (/\b(?:briefing|research|analy[sz]e|analysis)\b/i.test(v)) return true;
  return /\bplan\b/i.test(v) && /\b(?:time|weather|news|crypto|bitcoin|btc)\b/i.test(v);
}

function fallbackAgentToolPlan(goal) {
  const g = String(goal).toLowerCase();
  const plan = [];
  if (/time|date/.test(g)) plan.push('time');
  if (/weather/.test(g)) plan.push('weather');
  if (/news/.test(g)) plan.push('news');
  if (/crypto|bitcoin|btc/.test(g)) plan.push('crypto');
  return plan.length ? plan : ['time', 'weather', 'news', 'crypto'];
}

function parseAgentToolPlan(responseText) {
  const text = String(responseText || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('['), end = text.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('Agent plan format incorrect.');
  const parsed = JSON.parse(text.slice(start, end + 1));
  const allowed = new Set(Object.keys(AGENT_TOOLS));
  return [...new Set(parsed.filter(i => typeof i === 'string').map(i => i.trim().toLowerCase()).filter(i => allowed.has(i)))];
}

async function runAgent(goal) {
  add('J.A.R.V.I.S: Agent mode active.', 'ai');
  add('J.A.R.V.I.S: Goal analyze chesthunna...', 'ai');
  let tools;
  try {
    tools = parseAgentToolPlan(await callGeminiRaw('Select tools from ["time","weather","news","crypto"]. Reply with a JSON array only. Goal: ' + JSON.stringify(String(goal))));
    if (!tools.length) tools = fallbackAgentToolPlan(goal);
  } catch (e) {
    tools = fallbackAgentToolPlan(goal);
  }
  const results = {};
  for (let i = 0; i < tools.length; i++) {
    add('J.A.R.V.I.S: [' + (i + 1) + '/' + tools.length + '] ' + tools[i] + ' tool run chesthunna...', 'ai');
    try { results[tools[i]] = await AGENT_TOOLS[tools[i]](); } catch (e) { results[tools[i]] = 'Tool error'; }
  }
  add('J.A.R.V.I.S: Results combine chesthunna...', 'ai');
  return await callGemini('Goal: ' + JSON.stringify(String(goal)) + '. Tool results: ' + JSON.stringify(results) + '. Give concise Telugu/English summary.');
}

// ===== 6. MAIN RUN =====
async function reply(text) {
  add('J.A.R.V.I.S: ' + text, 'ai');
  speak(text);
}

async function run(text, imagePart) {
  text = (text || '').trim();
  if (!text && !imagePart) return;
  if (!text) text = 'Ee image lo emundo Telugu lo cheppu.';
  add('YOU: ' + text, 'user');
  input.value = '';
  setStatus('THINKING...');
  let answer;
  try {
    if (imagePart) {
      answer = await callGemini(text, imagePart);
    } else {
      const tool = await handleTools(text);
      if (tool) answer = tool;
      else if (isAgentModeRequest(text)) answer = await runAgent(text);
      else answer = await callGemini(text);
    }
    MEMORY.push({ role: 'user', text });
    MEMORY.push({ role: 'model', text: answer });
    saveMemory();
    await reply(answer);
  } catch (e) {
    await reply('Error: ' + e.message);
  }
  setStatus('SYSTEM READY');
}

// ===== 7. BUTTONS =====
sendBtn.onclick = () => run(input.value);
input.addEventListener('keydown', e => { if (e.key === 'Enter') run(input.value); });

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
micBtn.onclick = () => {
  if (!SR) return reply('Ee browser lo mic support ledu. Chrome vaadandi.');
  const rec = new SR();
  rec.lang = 'te-IN'; // English kosam 'en-IN'
  rec.onstart = () => setStatus('LISTENING...');
  rec.onresult = e => run(e.results[0][0].transcript);
  rec.onerror = e => reply('Mic error: ' + e.error);
  rec.onend = () => setStatus('SYSTEM READY');
  rec.start();
};

camBtn.onclick = () => imgInput.click();
imgInput.onchange = () => {
  const f = imgInput.files[0];
  if (!f) return;
  preview.src = URL.createObjectURL(f);
  preview.style.display = 'block';
  const reader = new FileReader();
  reader.onload = () => {
    const part = { inline_data: { mime_type: f.type || 'image/jpeg', data: String(reader.result).split(',')[1] } };
    run(input.value, part);
  };
  reader.readAsDataURL(f);
  imgInput.value = '';
};

clearBtn.onclick = () => {
  MEMORY = [];
  localStorage.removeItem('jarvis_memory');
  chat.innerHTML = '';
  preview.style.display = 'none';
  add('J.A.R.V.I.S: Memory clear ayyindi.', 'ai');
};
