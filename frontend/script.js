'use strict';
// ===== J.A.R.V.I.S — script.js (browser + Android-app native control) =====
const GEMINI_MODELS = ['gemini-3.8-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const SYSTEM_PROMPT = 'You are J.A.R.V.I.S, a friendly personal assistant for Prasshu. Reply in a warm Telugu-English mix. Keep answers short: 1-3 sentences unless asked for more. If you do not know, say so plainly.';
const $ = id => document.getElementById(id);

const chatEl = $('chat');
const input = $('msg'), sendBtn = $('send'), micBtn = $('mic-btn'), camBtn = $('cam-btn');
const imgInput = $('img-input'), clearBtn = $('clear-btn'), newChatBtn = $('new-chat');
const historyList = $('history-list'), historyCount = $('history-count');
const sidebar = $('sidebar'), backdrop = $('sidebar-backdrop');
const wakeBtn = $('wake-btn'), wakeStatus = $('wake-status');
const thinking = $('thinking-status'), thinkingLabel = $('thinking-label');
// Present only inside the Android app (JarvisNative bridge); null in a normal browser
const NATIVE = window.JarvisNative || null;

// ===== 1. API KEY =====
function getKey(force) {
  let k = localStorage.getItem('jarvis_key');
  if (!k || force) {
    k = (prompt('Enter your Gemini API Key:') || '').trim();
    if (k) localStorage.setItem('jarvis_key', k);
  }
  return k;
}

// ===== 2. GEMINI (streaming, auto model pick) =====
let MODEL_CACHE = null;
async function pickModels(key) {
  if (MODEL_CACHE) return MODEL_CACHE;
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', { headers: { 'x-goog-api-key': key } });
    if (r.ok) {
      const d = await r.json();
      const live = (d.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace('models/', ''));
      const flash = live
        .filter(n => /flash/.test(n) && !/(image|tts|live|audio|thinking|exp|embedding|robotics|computer)/.test(n))
        .sort((a, b) => (/lite/.test(b) ? 1 : 0) - (/lite/.test(a) ? 1 : 0));
      const extra = GEMINI_MODELS.filter(n => live.includes(n) && !flash.includes(n));
      const ordered = [...flash, ...extra];
      if (ordered.length) { MODEL_CACHE = ordered.slice(0, 5); return MODEL_CACHE; }
    }
  } catch (e) {}
  return GEMINI_MODELS;
}

async function callGemini(contents, onChunk) {
  const key = getKey();
  if (!key) throw new Error('API key లేదు. Page reload చేసి Gemini API key ఇవ్వండి.');
  const models = await pickModels(key);
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: { maxOutputTokens: 500, temperature: 0.7 }
  });
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
  const base = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const RETRY = [404, 429, 500, 502, 503, 504];
  let lastMsg = '';

  for (let round = 0; round < 2; round++) {
    for (const model of models) {
      try {
        const res = await fetch(base + model + ':streamGenerateContent?alt=sse', { method: 'POST', headers, body });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg = (Array.isArray(data) ? data[0]?.error?.message : data?.error?.message) || 'error';
          lastMsg = model + ' → ' + res.status + ': ' + msg;
          if (RETRY.includes(res.status)) continue;
          if ((res.status === 400 && /api key/i.test(msg)) || res.status === 403) {
            localStorage.removeItem('jarvis_key');
            MODEL_CACHE = null;
          }
          const fatal = new Error(lastMsg); fatal.fatal = true; throw fatal;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '', full = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const j = line.slice(5).trim();
            if (!j || j === '[DONE]') continue;
            try {
              const d = JSON.parse(j);
              const p = (d.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('');
              if (p) { full += p; if (onChunk) onChunk(full); }
            } catch (e) {}
          }
        }
        if (full.trim()) return full.trim();
        lastMsg = model + ' → empty response';
      } catch (e) {
        if (e.fatal) throw e;
        lastMsg = model + ' → network: ' + (e.message || 'failed');
        try {
          const r2 = await fetch(base + model + ':generateContent', { method: 'POST', headers, body });
          const d2 = await r2.json().catch(() => ({}));
          if (r2.ok) {
            const t2 = (d2.candidates?.[0]?.content?.parts || []).map(x => x.text || '').join('').trim();
            if (t2) { if (onChunk) onChunk(t2); return t2; }
          } else {
            lastMsg = model + ' → ' + r2.status + ': ' + (d2?.error?.message || 'error');
          }
        } catch (e2) { lastMsg = model + ' → network: ' + (e2.message || 'failed'); }
      }
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error('Gemini అందుబాటులో లేదు. కారణం: ' + lastMsg);
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
  const existing = chats.find(c => c.messages.length === 0);
  if (existing) { currentId = existing.id; }
  else {
    const c = { id: 'c' + Date.now(), title: 'New chat', messages: [], ts: Date.now() };
    chats.unshift(c);
    currentId = c.id;
  }
  saveChats(); renderHistory(); renderChat();
  return currentChat();
}
function updateConvClass() {
  const c = currentChat();
  document.body.classList.toggle('has-conversation', !!(c && c.messages.length));
}

// ===== 4. RENDER =====
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmt(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
}
function scrollDown() { chatEl.scrollTop = chatEl.scrollHeight; }
function addBubble(role, text, imgSrc) {
  const row = document.createElement('div');
  row.className = 'msg ' + (role === 'user' ? 'user' : 'ai');
  row.innerHTML = (imgSrc ? '<img src="' + imgSrc + '" alt="attached image">' : '') + fmt(text);
  chatEl.appendChild(row);
  document.body.classList.add('has-conversation');
  scrollDown();
  return row;
}
function renderChat() {
  chatEl.innerHTML = '';
  const c = currentChat();
  if (c) c.messages.forEach(m => addBubble(m.role === 'user' ? 'user' : 'ai', m.text));
  updateConvClass();
  scrollDown();
}
const CHAT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>';
function renderHistory() {
  historyList.innerHTML = '';
  const list = chats.filter(c => c.messages.length > 0);
  historyCount.textContent = list.length ? String(list.length) : '';
  if (!list.length) {
    const e = document.createElement('div');
    e.className = 'history-empty';
    e.textContent = 'No chats yet';
    historyList.appendChild(e);
    return;
  }
  list.forEach(c => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'history-item';
    if (c.id === currentId) item.setAttribute('aria-current', 'true');
    item.innerHTML = CHAT_ICON + '<span class="history-item-label"></span><span class="history-del" title="Delete">×</span>';
    item.querySelector('.history-item-label').textContent = c.title;
    item.querySelector('.history-del').onclick = e => {
      e.stopPropagation();
      chats = chats.filter(x => x.id !== c.id);
      if (currentId === c.id) { currentId = null; chats.length ? (currentId = chats[0].id) : newChat(); }
      saveChats(); renderHistory(); renderChat();
    };
    item.onclick = () => { currentId = c.id; renderHistory(); renderChat(); setSidebar(false); };
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
      let latitude, longitude;
      const nl = NATIVE ? NATIVE.location() : '';
      if (nl) { [latitude, longitude] = nl.split(',').map(Number); }
      else {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 }));
        latitude = pos.coords.latitude; longitude = pos.coords.longitude;
      }
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

// ===== 5.5 PHONE ACTIONS =====
const enc = encodeURIComponent;
function intentUrl(action, extras) {
  return 'intent:#Intent;action=' + action + ';' + (extras || '') + 'end';
}
function waNumber(n) {
  let d = String(n).replace(/[^\d]/g, '');
  if (d.length === 10) d = '91' + d; // India default
  return d;
}
function getContacts() {
  try { return JSON.parse(localStorage.getItem('jarvis_contacts') || '{}'); } catch (e) { return {}; }
}
const SITES = {
  whatsapp: 'intent://send/#Intent;scheme=whatsapp;package=com.whatsapp;end',
  instagram: 'instagram://app', facebook: 'fb://', telegram: 'tg://', spotify: 'spotify://',
  twitter: 'twitter://', x: 'twitter://', snapchat: 'snapchat://', linkedin: 'linkedin://',
  reddit: 'reddit://', pinterest: 'pinterest://', discord: 'discord://', netflix: 'nflx://',
  hotstar: 'hotstar://', zomato: 'zomato://', swiggy: 'swiggy://', uber: 'uber://',
  ola: 'olacabs://', phonepe: 'phonepe://', paytm: 'paytmmp://',
  youtube: 'https://www.youtube.com', gmail: 'mailto:', email: 'mailto:',
  maps: 'geo:0,0?q=', dialer: 'tel:', phone: 'tel:', messages: 'sms:', sms: 'sms:',
  'play store': 'market://search?q=', playstore: 'market://search?q=',
  amazon: 'https://www.amazon.in', flipkart: 'https://www.flipkart.com',
  google: 'https://www.google.com', chrome: 'https://www.google.com',
  'google pay': 'tez://', gpay: 'tez://'
};
const MUSIC_APPS = {
  'youtube music': q => 'https://music.youtube.com/search?q=' + enc(q),
  'spotify': q => 'spotify:search:' + enc(q),
  'jiosaavn': q => 'https://www.jiosaavn.com/search/' + enc(q),
  'gaana': q => 'https://gaana.com/search/' + enc(q)
};
function getMusicApp() {
  const a = localStorage.getItem('jarvis_music');
  return MUSIC_APPS[a] ? a : 'youtube music';
}

function parsePhoneAction(text) {
  const t = text.trim().toLowerCase();
  let m;

  // Alarm
  if ((m = t.match(/\bset (?:an? )?alarm (?:for |at )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/))) {
    let h = +m[1]; const min = +(m[2] || 0);
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    const hh = String(h).padStart(2, '0'), mm = String(min).padStart(2, '0');
    return {
      reply: 'సరే Boss, ' + hh + ':' + mm + ' కి alarm. కింద బటన్ నొక్కండి.',
      label: 'Set alarm ' + hh + ':' + mm,
      url: intentUrl('android.intent.action.SET_ALARM', 'i.android.intent.extra.alarm.HOUR=' + h + ';i.android.intent.extra.alarm.MINUTES=' + min + ';S.android.intent.extra.alarm.MESSAGE=JARVIS;')
    };
  }
  // Timer
  if ((m = t.match(/\bset (?:a )?timer (?:for )?(\d+)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)/))) {
    const n = +m[1], u = m[2][0];
    const secs = u === 'h' ? n * 3600 : u === 'm' ? n * 60 : n;
    return {
      reply: 'సరే Boss, ' + n + ' ' + m[2] + ' timer. కింద బటన్ నొక్కండి.',
      label: 'Start timer',
      url: intentUrl('android.intent.action.SET_TIMER', 'i.android.intent.extra.alarm.LENGTH=' + secs + ';S.android.intent.extra.alarm.MESSAGE=JARVIS;')
    };
  }

  // Save contact
  if ((m = t.match(/^\s*save contact\s+([a-z ]{2,20}?)\s+(\+?\d[\d-]{5,})\s*$/))) {
    const c = getContacts();
    c[m[1].trim()] = m[2].replace(/[^\d+]/g, '');
    localStorage.setItem('jarvis_contacts', JSON.stringify(c));
    return { reply: m[1].trim() + ' contact సేవ్ అయింది Boss.' };
  }
  // WhatsApp by name
  if ((m = t.match(/^\s*whatsapp\s+([a-z]{2,20})\s+(?:saying\s+|that\s+)?(.+)$/))) {
    const num = getContacts()[m[1]];
    if (num) return {
      reply: m[1] + ' కి WhatsApp message సిద్ధం Boss. Send మీరే నొక్కండి.',
      label: 'Open WhatsApp chat',
      url: 'https://wa.me/' + waNumber(num) + '?text=' + enc(m[2])
    };
  }
  // WhatsApp by number
  if ((m = t.match(/whatsapp\s+(?:to\s+)?(\+?\d[\d-]{5,})\s*(?:saying\s+|that\s+)?(.*)$/))) {
    const body = m[2] ? '?text=' + enc(m[2]) : '';
    return {
      reply: 'WhatsApp chat సిద్ధం Boss. Send మీరే నొక్కండి.',
      label: 'Open WhatsApp chat',
      url: 'https://wa.me/' + waNumber(m[1]) + body
    };
  }
  // WhatsApp share (you pick contact)
  if ((m = t.match(/^\s*whatsapp\s+(?:say\s+|send\s+)(.+)$/))) {
    return {
      reply: 'WhatsApp message సిద్ధం Boss. Contact ని మీరే ఎంచుకోండి.',
      label: 'Share on WhatsApp',
      url: 'https://wa.me/?text=' + enc(m[1])
    };
  }
  // SMS
  if ((m = t.match(/\b(?:sms|text)\s+(\+?\d[\d-]{5,})\s+(?:saying\s+|that\s+)?(.+)$/))) {
    return {
      reply: 'SMS draft సిద్ధం Boss. Send మీరే నొక్కండి.',
      label: 'Open SMS',
      url: 'sms:' + m[1].replace(/[^\d+]/g, '') + '?body=' + enc(m[2])
    };
  }
  // Call by number
  if ((m = t.match(/\bcall\s+(\+?\d[\d\s-]{5,})/))) {
    return {
      reply: 'Dial చేస్తున్నాను Boss. Call button మీరే నొక్కండి.',
      label: 'Call ' + m[1].trim(),
      url: 'tel:' + m[1].replace(/[^\d+]/g, '')
    };
  }
  // Call by name
  if ((m = t.match(/^\s*call\s+([a-z ]{2,20})$/)) && getContacts()[m[1].trim()]) {
    return { reply: m[1].trim() + ' కి dial చేస్తున్నాను Boss.', label: 'Call ' + m[1].trim(), url: 'tel:' + getContacts()[m[1].trim()] };
  }

  // Choose online music app
  if ((m = t.match(/^\s*set music app\s+(.+?)\s*$/))) {
    const name = m[1] === 'youtube' ? 'youtube music' : m[1];
    if (!MUSIC_APPS[name]) return { reply: 'ఈ apps లో ఒకటి చెప్పండి Boss: ' + Object.keys(MUSIC_APPS).join(', ') + '.' };
    localStorage.setItem('jarvis_music', name);
    return { reply: 'Music app ' + name + ' గా సెట్ అయింది Boss.' };
  }
  // Play a song online
  if (!/\bon youtube\b/.test(t) && (m = t.match(/^\s*play\s+(?:the\s+)?(?:song\s+)?(.+)$/))) {
    const app = getMusicApp();
    return {
      reply: '"' + m[1] + '" ' + app + ' లో వెతుకుతున్నాను Boss. కింద బటన్ నొక్కండి.',
      label: 'Play in ' + app,
      url: MUSIC_APPS[app](m[1])
    };
  }

  // YouTube
  if ((m = t.match(/(?:search|play)\s+(.+?)\s+(?:on|in)\s+youtube/) || t.match(/youtube\s+(?:search|play)\s+(.+)/))) {
    return {
      reply: 'YouTube లో "' + m[1] + '" వెతుకుతున్నాను Boss.',
      label: 'Open YouTube results',
      url: 'https://www.youtube.com/results?search_query=' + enc(m[1])
    };
  }
  // Maps
  if ((m = t.match(/\b(?:navigate|directions?|route)\s+to\s+(.+)/))) {
    return {
      reply: m[1] + ' కి దారి చూపిస్తున్నాను Boss.',
      label: 'Open Maps',
      url: 'https://www.google.com/maps/dir/?api=1&destination=' + enc(m[1])
    };
  }
  if ((m = t.match(/\b(?:show|find|search)\s+(.+?)\s+(?:on|in)\s+maps?/))) {
    return {
      reply: 'Maps లో "' + m[1] + '" వెతుకుతున్నాను Boss.',
      label: 'Open Maps',
      url: 'https://www.google.com/maps/search/?api=1&query=' + enc(m[1])
    };
  }

  // Phone apps / settings
  if (/\bopen (?:the )?camera\b/.test(t))
    return { reply: 'Camera తెరుస్తున్నాను Boss.', label: 'Open camera', url: intentUrl('android.media.action.STILL_IMAGE_CAMERA') };
  if (/\bopen (?:the )?wi-?fi\b/.test(t))
    return { reply: 'WiFi settings తెరుస్తున్నాను Boss.', label: 'WiFi settings', url: intentUrl('android.settings.WIFI_SETTINGS') };
  if (/\bopen (?:the )?bluetooth\b/.test(t))
    return { reply: 'Bluetooth settings తెరుస్తున్నాను Boss.', label: 'Bluetooth settings', url: intentUrl('android.settings.BLUETOOTH_SETTINGS') };
  if (/\bopen (?:the )?(?:phone )?settings\b/.test(t))
    return { reply: 'Settings తెరుస్తున్నాను Boss.', label: 'Open settings', url: intentUrl('android.settings.SETTINGS') };

  // Google search
  if ((m = t.match(/^\s*(?:google|search(?: google)?(?: for)?)\s+(.+)/))) {
    return {
      reply: 'Google లో "' + m[1] + '" వెతుకుతున్నాను Boss.',
      label: 'Open Google search',
      url: 'https://www.google.com/search?q=' + enc(m[1])
    };
  }
  // Open an app or site
  if ((m = t.match(/^\s*open\s+(.+?)\s*$/)) && SITES[m[1]]) {
    return { reply: m[1] + ' తెరుస్తున్నాను Boss. కింద బటన్ నొక్కండి.', label: 'Open ' + m[1], url: SITES[m[1]] };
  }
  return null;
}

function addActionLink(action) {
  const row = chatEl.lastElementChild;
  if (!row) return;
  const a = document.createElement('a');
  a.className = 'action-link';
  a.href = action.url;
  if (/^https?:/.test(action.url)) { a.target = '_blank'; a.rel = 'noopener'; }
  a.textContent = action.label + ' ↗';
  row.appendChild(document.createElement('br'));
  row.appendChild(a);
  scrollDown();
}
function addActionButton(label, fn) {
  const row = chatEl.lastElementChild;
  if (!row) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'action-link'; b.textContent = label;
  b.onclick = fn;
  row.appendChild(document.createElement('br'));
  row.appendChild(b);
  scrollDown();
}
function openAction(url) {
  try {
    if (/^https?:/.test(url)) window.open(url, '_blank', 'noopener');
    else window.location.href = url;
  } catch (e) {}
}

// ===== 5.7 LOCAL MUSIC (songs stored on your phone) =====
const localInput = document.createElement('input');
localInput.type = 'file'; localInput.accept = 'audio/*'; localInput.multiple = true; localInput.hidden = true;
document.body.appendChild(localInput);
const player = new Audio();
let tracks = [], trackIdx = -1;
const trackName = f => f.name.replace(/\.[^.]+$/, '');

const barStyle = document.createElement('style');
barStyle.textContent = '#music-bar{display:none;align-items:center;gap:8px;width:min(100%,820px);margin:0 auto 8px;padding:6px 12px;border:1px solid var(--border-strong);border-radius:999px;background:var(--panel);font-size:12px}#music-bar.on{display:flex}#music-bar span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#music-bar button{border:0;background:transparent;color:var(--accent);font-size:18px;padding:2px 6px}';
document.head.appendChild(barStyle);
const bar = document.createElement('div');
bar.id = 'music-bar';
bar.innerHTML = '<span id="music-title"></span><button id="mb-prev">⏮</button><button id="mb-play">⏯</button><button id="mb-next">⏭</button>';
document.querySelector('.composer-dock').prepend(bar);

function updateBar() {
  bar.classList.toggle('on', trackIdx >= 0);
  $('music-title').textContent = trackIdx >= 0 ? '♪ ' + trackName(tracks[trackIdx]) : '';
}
function playTrack(i) {
  if (!tracks.length) return;
  trackIdx = (i + tracks.length) % tracks.length;
  if (player.src) URL.revokeObjectURL(player.src);
  player.src = URL.createObjectURL(tracks[trackIdx]);
  player.play().catch(() => {});
  updateBar();
}
function togglePlay() { if (player.paused) player.play().catch(() => {}); else player.pause(); }
player.onended = () => playTrack(trackIdx + 1);
$('mb-prev').onclick = () => playTrack(trackIdx - 1);
$('mb-next').onclick = () => playTrack(trackIdx + 1);
$('mb-play').onclick = togglePlay;
localInput.onchange = () => {
  const files = Array.from(localInput.files || []).filter(f => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(f.name));
  if (!files.length) return;
  tracks = files;
  playTrack(0);
  addBubble('ai', files.length + ' పాటలు లోడ్ అయ్యాయి Boss. "play song <పేరు>", "next song", "pause music" అని చెప్పండి.');
  localInput.value = '';
};

function parseLocalMusic(text) {
  const t = text.trim().toLowerCase();
  let m;
  if (/^\s*(?:local music|my songs|phone songs|play local(?: music)?|play my songs)\s*$/.test(t)) {
    if (tracks.length && /^\s*play/.test(t)) return { reply: 'మీ పాటలు ప్లే చేస్తున్నాను Boss.', run: () => playTrack(trackIdx < 0 ? 0 : trackIdx) };
    return { reply: 'కింద బటన్ నొక్కి మీ phone లోని పాటలను ఎంచుకోండి Boss.', button: { label: 'Choose songs', fn: () => localInput.click() } };
  }
  if (!tracks.length) return null;
  if (/^\s*(?:pause|stop)\s+(?:the\s+)?(?:music|song)\s*$/.test(t)) return { reply: 'ఆపేశాను Boss.', run: () => player.pause() };
  if (/^\s*(?:resume|continue)\s+(?:the\s+)?(?:music|song)\s*$/.test(t)) return { reply: 'కొనసాగిస్తున్నాను Boss.', run: () => player.play().catch(() => {}) };
  if (/^\s*next\s+(?:song|track)\s*$/.test(t)) return { reply: 'తర్వాతి పాట Boss.', run: () => playTrack(trackIdx + 1) };
  if (/^\s*(?:previous|last)\s+(?:song|track)\s*$/.test(t)) return { reply: 'ముందు పాట Boss.', run: () => playTrack(trackIdx - 1) };
  if (/^\s*shuffle\s*$/.test(t)) return { reply: 'Shuffle చేస్తున్నాను Boss.', run: () => playTrack(Math.floor(Math.random() * tracks.length)) };
  if ((m = t.match(/^\s*play\s+(?:song\s+)?(.+)$/))) {
    const i = tracks.findIndex(f => trackName(f).toLowerCase().includes(m[1]));
    if (i >= 0) return { reply: '"' + trackName(tracks[i]) + '" ప్లే చేస్తున్నాను Boss.', run: () => playTrack(i) };
  }
  return null;
}

// ===== 5.8 NATIVE ANDROID CONTROL (works only inside the Android app) =====
const recLang = () => localStorage.getItem('jarvis_lang') || 'en-IN';
function parseNativeAction(text) {
  if (!NATIVE) return null;
  const t = text.trim().toLowerCase().replace(/[.!?]+$/, '');
  let m;
  const A = (reply, exec) => ({ reply, exec });
  const NOACC = 'Accessibility ఆన్ లేదు Boss. "enable accessibility" అని చెప్పి, JARVIS ని ఆన్ చేయండి.';

  if (/^(?:grant|give)\s+(?:all\s+)?(?:permissions?|access)$/.test(t))
    return A('', () => { NATIVE.grantAll(); return 'Permissions అడుగుతున్నాను Boss. అన్నిటికీ Allow నొక్కండి.'; });
  if (/^(?:enable|open)\s+accessibility$/.test(t))
    return A('', () => { NATIVE.openAccessibility(); return 'Accessibility settings తెరిచాను Boss. అక్కడ J.A.R.V.I.S ని ఆన్ చేయండి.'; });
  if ((m = t.match(/^voice\s+(telugu|english|hindi)$/))) {
    const code = { telugu: 'te-IN', english: 'en-IN', hindi: 'hi-IN' }[m[1]];
    return A('', () => { localStorage.setItem('jarvis_lang', code); return 'Voice భాష ' + m[1] + ' గా సెట్ అయింది Boss.'; });
  }
  if (/^scan files$/.test(t)) return A('', () => 'మొత్తం ' + NATIVE.reindex() + ' files దొరికాయి Boss.');
  if (/\bbattery\b/.test(t)) return A('', () => 'Battery ' + NATIVE.battery() + '% ఉంది Boss.');

  // Whole-phone gestures (need Accessibility)
  const G = { home: 'home', 'go home': 'home', back: 'back', 'go back': 'back', 'recent apps': 'recents', recents: 'recents',
    notifications: 'notifications', lock: 'lock', 'lock screen': 'lock', screenshot: 'screenshot', 'take screenshot': 'screenshot' };
  if (G[t]) return A('', () => { const r = NATIVE.global(G[t]); return r === 'NOACCESS' ? NOACC : r === 'OK' ? 'సరే Boss.' : 'ఈ పని ఈ phone లో కుదరలేదు Boss.'; });
  if ((m = t.match(/^(?:click|tap|press)\s+(.+)$/)))
    return A('', () => { const r = NATIVE.clickText(m[1]); return r === 'NOACCESS' ? NOACC : r === 'OK' ? '"' + m[1] + '" నొక్కాను Boss.' : 'screen పై "' + m[1] + '" కనిపించలేదు Boss.'; });

  // Torch, volume
  if (/\b(torch|flashlight)\b/.test(t) && /\b(on|off)\b/.test(t)) {
    const on = /\bon\b/.test(t);
    return A('', () => { const r = NATIVE.torch(on); return r === 'OK' ? 'Torch ' + (on ? 'ఆన్' : 'ఆఫ్') + ' చేశాను Boss.' : 'ఈ phone లో torch కుదరలేదు Boss.'; });
  }
  if ((m = t.match(/^(?:volume\s+(up|down|max|mute|\d{1,3})|(increase|decrease)\s+volume)$/))) {
    const v = m[1] || (m[2] === 'increase' ? 'up' : 'down');
    return A('', () => { NATIVE.volume(v); return 'Volume ' + v + ' Boss.'; });
  }

  // Alarm, timer
  if ((m = t.match(/\bset (?:an? )?alarm (?:for |at )?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/))) {
    let h = +m[1]; const mi = +(m[2] || 0);
    if (m[3] === 'pm' && h < 12) h += 12;
    if (m[3] === 'am' && h === 12) h = 0;
    if (h > 23 || mi > 59) return null;
    return A('', () => NATIVE.alarm(h, mi) === 'OK' ? 'Alarm ' + String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0') + ' కి సెట్ చేశాను Boss.' : 'Alarm కుదరలేదు Boss.');
  }
  if ((m = t.match(/\bset (?:a )?timer (?:for )?(\d+)\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)/))) {
    const n = +m[1], u = m[2][0], secs = u === 'h' ? n * 3600 : u === 'm' ? n * 60 : n;
    return A('', () => NATIVE.timer(secs) === 'OK' ? 'Timer ' + n + ' ' + m[2] + ' సెట్ చేశాను Boss.' : 'Timer కుదరలేదు Boss.');
  }

  // Calls and messages (names come from your phone contacts)
  if ((m = t.match(/^(?:sms|text)\s+(\+?[\d-]{6,}|[a-z]+)\s+(.+)$/)))
    return A('', () => { const r = NATIVE.sendSms(m[1], m[2]); return r === 'NOCONTACT' ? '"' + m[1] + '" contact దొరకలేదు Boss.' : r === 'DRAFT' ? 'SMS draft సిద్ధం Boss, Send నొక్కండి.' : r === 'OK' ? 'SMS పంపాను Boss.' : 'SMS కుదరలేదు Boss.'; });
  if ((m = t.match(/^whatsapp\s+(\+?[\d-]{6,}|[a-z]+)\s+(.+)$/)))
    return A('', () => { const r = NATIVE.whatsapp(m[1], m[2]); return r === 'NOCONTACT' ? '"' + m[1] + '" contact దొరకలేదు Boss.' : r === 'SENT' ? 'WhatsApp message పంపుతున్నాను Boss.' : r === 'OPENED' ? 'WhatsApp లో message సిద్ధం Boss. Send నొక్కండి (auto-send కోసం "enable accessibility" అనండి).' : 'WhatsApp కుదరలేదు Boss.'; });
  if ((m = t.match(/^call\s+(.+)$/)))
    return A('', () => { const r = NATIVE.call(m[1]); return r === 'NOCONTACT' ? '"' + m[1] + '" contact దొరకలేదు Boss.' : r === 'OK' ? m[1] + ' కి call చేస్తున్నాను Boss.' : r === 'DIAL' ? 'Dialer తెరిచాను Boss, Call నొక్కండి.' : 'Call కుదరలేదు Boss.'; });

  // Songs on the phone
  if (/^(?:play\s+(?:some\s+|my\s+)?(?:music|songs)|my songs|shuffle)$/.test(t))
    return A('', () => { const r = NATIVE.playSong(''); return r ? 'ప్లే చేస్తున్నాను: ' + r : 'Phone లో పాటలు దొరకలేదు Boss. "grant permissions" అనండి.'; });
  if (/^(pause|stop)\s+(?:the\s+)?(?:music|song)$/.test(t)) return A('', () => { NATIVE.music(t.startsWith('stop') ? 'stop' : 'pause'); return 'ఆపేశాను Boss.'; });
  if (/^(resume|continue)\s+(?:the\s+)?(?:music|song)$/.test(t)) return A('', () => { NATIVE.music('resume'); return 'కొనసాగిస్తున్నాను Boss.'; });
  if (/^next\s+(?:song|track)$/.test(t)) return A('', () => 'తర్వాతి పాట: ' + NATIVE.music('next'));
  if (/^(?:previous|last)\s+(?:song|track)$/.test(t)) return A('', () => 'ముందు పాట: ' + NATIVE.music('prev'));
  if ((m = t.match(/^(?:list|show|find)\s+(?:my\s+)?(songs|music|photos|pictures|videos|files|documents)(?:\s+(.+))?$/))) {
    const kind = { songs: 'audio', music: 'audio', photos: 'image', pictures: 'image', videos: 'video', files: 'any', documents: 'doc' }[m[1]];
    return A('', () => NATIVE.findFiles(kind, m[2] || '') || 'ఏమీ దొరకలేదు Boss.');
  }
  if ((m = t.match(/^play\s+(?:song\s+)?(.+)$/)) && NATIVE.findFiles('audio', m[1]))
    return A('', () => { const r = NATIVE.playSong(m[1]); return r ? 'ప్లే చేస్తున్నాను: ' + r : 'ఆ పాట ప్లే కాలేదు Boss.'; });

  // Photos, videos, documents from internal storage
  if ((m = t.match(/^open\s+(?:the\s+)?(?:(?:last|latest)\s+)?(photo|picture|image|video|file|document|doc|pdf)s?(?:\s+(.+))?$/))) {
    const kind = { photo: 'image', picture: 'image', image: 'image', video: 'video', file: 'any', document: 'doc', doc: 'doc', pdf: 'doc' }[m[1]];
    const q = (m[2] || '').replace(/^named\s+/, '');
    return A('', () => { const r = NATIVE.openFile(kind, q); return !r ? 'ఏమీ దొరకలేదు Boss. "grant permissions" అని storage access ఇవ్వండి.' : r === 'ERR' ? 'ఆ file తెరవడానికి app లేదు Boss.' : r + ' తెరుస్తున్నాను Boss.'; });
  }

  // Phone settings screens
  if ((m = t.match(/^(?:open\s+)?(wi-?fi|bluetooth|location|display|sound|battery|storage|apps|airplane|data)\s+settings?$/)))
    return A('', () => { NATIVE.settings(m[1].replace('-', '')); return m[1] + ' settings తెరిచాను Boss.'; });

  // Any installed app by name
  if ((m = t.match(/^(?:open|launch|start)\s+(.+)$/)))
    return A('', () => { const r = NATIVE.openApp(m[1]); return r === 'NOTFOUND' ? '"' + m[1] + '" app phone లో దొరకలేదు Boss.' : r + ' తెరుస్తున్నాను Boss.'; });
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
  input.placeholder = 'Message J.A.R.V.I.S...';
  input.value = ''; autosize();

  const shown = text || 'Analyze this image';
  addBubble('user', shown, img && img.preview);
  chatObj.messages.push({ role: 'user', text: shown + (img ? ' [image]' : '') });
  if (chatObj.title === 'New chat') chatObj.title = shown.slice(0, 40);
  renderHistory();

  setThinking(true, 'J.A.R.V.I.S is thinking');
  let reply, action = null, live = null;
  try {
    const cmd = text.replace(/^\s*(?:(?:hey|hi|ok|okay)\s+)?(?:jarvis|prasshu)\b[\s,.:;!?-]*/i, '').trim();
    action = img ? null : (parseNativeAction(cmd) || parseLocalMusic(cmd) || parsePhoneAction(cmd));
    const tool = (!img && text && !cmd) ? 'చెప్పండి Boss, వింటున్నాను.' : action ? (action.exec ? action.exec() : action.reply) : (img ? null : await handleTools(cmd));
    if (tool) {
      reply = tool;
    } else {
      const history = chatObj.messages.slice(-7, -1).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
      const parts = [{ text: shown }];
      if (img) parts.push({ inline_data: { mime_type: img.mime, data: img.data } });
      reply = await callGemini([...history, { role: 'user', parts }], t => {
        if (!live) { setThinking(false); live = addBubble('ai', t); }
        else { live.innerHTML = fmt(t); scrollDown(); }
      });
    }
  } catch (e) {
    reply = 'SYSTEM: ' + (!navigator.onLine ? 'Internet లేదు Boss. Offline లో phone commands (apps, songs, photos, files, call, alarm) మాత్రమే పని చేస్తాయి.' : (e.message || 'Something went wrong.'));
    chatObj.messages.push({ role: 'model', text: reply });
    addBubble('ai', reply);
    setThinking(false); busy = false; saveChats(); resumeWake();
    return;
  }
  chatObj.messages.push({ role: 'model', text: reply });
  if (live) { live.innerHTML = fmt(reply); scrollDown(); }
  else addBubble('ai', reply);
  saveChats();
  setThinking(false);
  busy = false;
  if (action && action.run) action.run();
  else if (action && action.button) addActionButton(action.button.label, action.button.fn);
  else if (action && action.url) { addActionLink(action); if (!speakReply) openAction(action.url); }
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

// ===== 8. VOICE + WAKE WORD (fast) =====
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const WAKE = /\b(?:hey|hi|ok|okay)?\s*(?:jarvis|jarwis|service|prasshu)\b/i;
let rec = null, recActive = false, recMode = 'manual', wakeOn = false, awaiting = false, speaking = false;

function updateWake() {
  wakeStatus.textContent = wakeOn ? (recActive ? 'WAKE: LISTENING' : 'WAKE: ON') : 'WAKE: OFF';
  wakeBtn.classList.toggle('active', wakeOn);
}
function startRec(mode) {
  if (!rec || recActive) return;
  recMode = mode;
  rec.continuous = (mode === 'wake');
  rec.interimResults = (mode === 'manual');
  try { rec.start(); recActive = true; } catch (e) {}
  micBtn.classList.toggle('listening', mode === 'manual');
  updateWake();
}
function stopRec() { try { rec && rec.stop(); } catch (e) {} }
function resumeWake() { if (wakeOn && !speaking && !busy) setTimeout(() => startRec('wake'), 150); }
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
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = (e.results[i][0].transcript || '').trim();
      if (!e.results[i].isFinal) { interim += t + ' '; continue; }
      if (t) onHeard(t);
    }
    if (interim && recMode === 'manual') input.value = interim.trim();
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

// Native (Android app) speech: works offline if the offline language pack is installed
if (NATIVE) {
  rec = {
    continuous: false, interimResults: false,
    start() { NATIVE.startListening(recLang()); },
    stop() { NATIVE.stopListening(); }
  };
  wakeBtn.disabled = false;
  window.onNativeSpeech = (text, isFinal) => {
    if (!isFinal) { if (recMode === 'manual' && text) input.value = text; return; }
    if (text) onHeard(text.trim());
  };
  window.onNativeSpeechEnd = err => {
    recActive = false; micBtn.classList.remove('listening');
    if (err === 'perm' || err === 'noengine') {
      wakeOn = false;
      addBubble('ai', err === 'perm' ? 'SYSTEM: Microphone permission ఇవ్వండి Boss ("grant permissions" అనండి).' : 'SYSTEM: ఈ phone లో speech engine లేదు.');
    }
    updateWake();
    if (err !== 'perm' && err !== 'noengine') resumeWake();
  };
  window.onNativeSpeakDone = () => { speaking = false; resumeWake(); };
  updateWake();
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
  if (NATIVE) {
    const c = String(text).replace(/[*`#]/g, '');
    speaking = true;
    NATIVE.speak(c, /[\u0C00-\u0C7F]/.test(c) ? 'te-IN' : 'en-IN');
    return;
  }
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
$('settings-open').onclick = () => { openSettings(true); setSidebar(false); };
$('settings-close').onclick = () => openSettings(false);
$('settings-scrim').onclick = () => openSettings(false);

const themeSelect = $('theme-select');
const savedTheme = localStorage.getItem('jarvis_theme');
if (savedTheme === 'dark' || savedTheme === 'light') {
  document.documentElement.dataset.theme = savedTheme;
  themeSelect.value = savedTheme;
}
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
// PRASSHU ONLINE / OFFLINE STATUS

function updateNetworkStatus() {
  const online = navigator.onLine;

  console.log(
    online ? '🟢 PRASSHU ONLINE' : '🔴 PRASSHU OFFLINE'
  );
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

updateNetworkStatus();

// Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('PRASSHU OFFLINE READY'))
      .catch(console.error);
  });
}
