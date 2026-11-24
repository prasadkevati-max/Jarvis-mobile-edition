// ===== 1. API KEY =====
let API_KEY = localStorage.getItem('jarvis_key');
if (!API_KEY) {
  API_KEY = prompt('Enter your Gemini API Key:');
  if (API_KEY) localStorage.setItem('jarvis_key', API_KEY);
}

function extractInteractionText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const steps = Array.isArray(data?.steps) ? data.steps : Array.isArray(data?.outputs) ? data.outputs : [];
  return steps
    .filter(step => step && (step.type === 'model_output' || step.type === 'text' || !step.type))
    .flatMap(step => Array.isArray(step.content) ? step.content : typeof step.text === 'string' ? [{ type: 'text', text: step.text }] : [])
    .filter(part => part && (part.type === 'text' || typeof part.text === 'string') && typeof part.text === 'string')
    .map(part => part.text)
    .join('\n')
    .trim();
}

async function requestGeminiInteraction(input, systemInstruction = GEMINI_SYSTEM_INSTRUCTION) {
  if (!API_KEY) throw new Error('Gemini API key is missing. Reload the page and enter it again.');
  const payload = { model: GEMINI_MODEL, input, store: false };
  if (systemInstruction) payload.system_instruction = systemInstruction;
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY,
      'Api-Revision': '2026-05-20'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || 'Gemini request failed (' + response.status + ').');
  }
  const reply = extractInteractionText(data);
  if (!reply) throw new Error(data?.status === 'failed' ? 'Gemini could not complete this request.' : 'Gemini returned an empty response.');
  return reply;
}
const GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_SYSTEM_INSTRUCTION = 'You are J.A.R.V.I.S, a friendly personal assistant for Vamshi. Reply naturally in a warm Telugu-English mix, using clear concise language. If you do not know, say so plainly.';

// ===== 2. MEMORY =====
let MEMORY = [];
try {
  const storedMemory = JSON.parse(localStorage.getItem('jarvis_memory') || '[]');
  if (Array.isArray(storedMemory)) {
    MEMORY = storedMemory.filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && !(m.role === 'model' && /^(?:Your strong password:|ఇదిగో strong password:)/i.test(m.text)));
    if (MEMORY.length !== storedMemory.length) localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY));
  } else {
    localStorage.removeItem('jarvis_memory');
  }
} catch (e) {
  localStorage.removeItem('jarvis_memory');
}

const chat = document.getElementById('chat');
const conversationStage = document.getElementById('conversation-stage');
const input = document.getElementById('msg');
const micBtn = document.getElementById('mic-btn');
const clearBtn = document.getElementById('clear-btn');
const camBtn = document.getElementById('cam-btn');
const imgInput = document.getElementById('img-input');
const historyList = document.getElementById('history-list');
const historyCount = document.getElementById('history-count');
const menuButton = document.getElementById('menu-btn');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const settingsOpen = document.getElementById('settings-open');
const settingsClose = document.getElementById('settings-close');
const settingsPanel = document.getElementById('settings-panel');
const settingsScrim = document.getElementById('settings-scrim');
const themeSelect = document.getElementById('theme-select');
const clearMemorySetting = document.getElementById('clear-memory-setting');

  if (/\bdice\b/.test(t)) return 'You rolled ' + (Math.floor(Math.random() * 6) + 1) + ', Boss.';
  if (/\bcoin\b/.test(t)) return Math.random() < 0.5 ? 'Heads, Boss.' : 'Tails, Boss.';

  if (/\bjoke\b/.test(t)) {
    try {
      const data = await fetchToolJson('https://official-joke-api.appspot.com/random_joke');
      if (typeof data?.setup !== 'string' || typeof data?.punchline !== 'string') throw new Error('Invalid joke response.');
      return data.setup + ' ... ' + data.punchline;
    } catch (e) {
      try {
        const backup = await fetchToolJson('https://v2.jokeapi.dev/joke/Any?type=twopart&safe-mode');
        if (!backup?.error && backup?.type === 'twopart' && typeof backup.setup === 'string' && typeof backup.delivery === 'string') return backup.setup + ' ... ' + backup.delivery;
      } catch (x) {}
      const fallback = [['Why did the computer go to the doctor?', 'It had a virus.'], ['Why was the math book sad?', 'It had too many problems.']];
      const joke = fallback[Math.floor(Math.random() * fallback.length)];
      return joke[0] + ' ... ' + joke[1];
    }
  }

  if (t.includes('quote') || t.includes('motivate')) {
    try {
      const data = await fetchToolJson('https://dummyjson.com/quotes/random');
      if (typeof data?.quote !== 'string' || typeof data?.author !== 'string') throw new Error('Invalid quote response.');
      return data.quote + ' — by ' + data.author;
    } catch (e) {
      return 'A small step today is still progress. — by J.A.R.V.I.S';
    }
  }

  if (/\bnews\b/.test(t)) {
    try {
      const ids = await fetchToolJson('https://hacker-news.firebaseio.com/v0/topstories.json');
      if (!Array.isArray(ids) || !ids.length) throw new Error('No news stories available.');
      const stories = await Promise.all(ids.slice(0, 9).map(id => fetchToolJson('https://hacker-news.firebaseio.com/v0/item/' + id + '.json').catch(() => null)));
      const titles = stories.filter(item => typeof item?.title === 'string').slice(0, 3);
      if (!titles.length) throw new Error('No news stories available.');
      return 'Top tech news: ' + titles.map((item, index) => (index + 1) + '. ' + item.title + '.').join(' ');
    } catch (e) {
      return 'News service error, Boss.';
    }
  }

  if (/^\s*translate\b/i.test(text)) {
    const query = text.replace(/^\s*translate(?:\s+this)?\b/i, '').trim();
    if (!query) return 'Translate format: say “translate <text>” for Telugu.';
    try {
      const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(query) + '&langpair=en|te';
      const data = await fetchToolJson(url);
      const translated = data?.responseData?.translatedText;
      if ((data?.responseStatus !== undefined && Number(data.responseStatus) !== 200) || typeof translated !== 'string' || !translated.trim()) throw new Error('Translation unavailable.');
      return 'In Telugu: ' + translated;
    } catch (e) {
      return 'Translate error, Boss.';
    }
  }

  if (t.includes('dollar') || t.includes('usd') || t.includes('exchange')) {
    const amountMatch = t.match(/[-+]?\d+(?:\.\d+)?/);
    const amount = amountMatch ? Number(amountMatch[0]) : 1;
    if (!Number.isFinite(amount) || amount <= 0) return 'Enter a dollar amount greater than zero.';
    let rate;
    try {
      const data = await fetchToolJson('https://open.er-api.com/v6/latest/USD');
      rate = Number(data?.rates?.INR);
      if (!Number.isFinite(rate) || rate <= 0) rate = undefined;
    } catch (e) {}
    if (!Number.isFinite(rate)) {
      try {
        const backup = await fetchToolJson('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR');
        rate = Number(backup?.rates?.INR);
        if (!Number.isFinite(rate) || rate <= 0) rate = undefined;
      } catch (e) {}
    }
    if (!Number.isFinite(rate) || rate <= 0) return 'Currency service error, Boss.';
    return amount + ' US dollars is about ' + Math.round(amount * rate) + ' Indian rupees, Boss.';
  }

  if (t.includes('meaning')) {
    const match = text.match(/\bmeaning(?:\s+of)?\s+(.+)$/i);
    const word = match?.[1]?.trim().replace(/[?.!]+$/, '');
    if (!word) return 'Meaning format: say “meaning of <word>”.';
    try {
      const data = await fetchToolJson('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(word), {}, 7000);
      const definition = data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
      if (typeof definition === 'string' && definition.trim()) return word + ' means: ' + definition;
    } catch (e) {}
    try {
      const data = await fetchToolJson('https://api.datamuse.com/words?sp=' + encodeURIComponent(word) + '&md=d&max=1', {}, 7000);
      const definition = data?.[0]?.defs?.[0]?.replace(/^[a-z]{1,5}\s+/i, '').trim();
      if (definition) return word + ' means: ' + definition;
    } catch (e) {}
    return 'Could not retrieve the word meaning right now. Try again later.';
  }

  if (t.includes('password')) {
    const secureCrypto = globalThis.crypto;
    if (!secureCrypto || typeof secureCrypto.getRandomValues !== 'function') return 'Secure password generation is unavailable in this browser.';
    const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!@#$%'];
    const all = groups.join('');
    const secureIndex = max => {
      const limit = 0x100000000 - (0x100000000 % max);
      const values = new Uint32Array(1);
      do { secureCrypto.getRandomValues(values); } while (values[0] >= limit);
      return values[0] % max;
    };
    let password = groups.map(group => group[secureIndex(group.length)]).join('');
    while (password.length < 16) password += all[secureIndex(all.length)];
    password = password.split('');
    for (let i = password.length - 1; i > 0; i--) {
      const j = secureIndex(i + 1);
      [password[i], password[j]] = [password[j], password[i]];
    }
    return 'Your strong password: ' + password.join('');
  }

  if (t.includes('bitcoin') || t.includes('crypto')) {
    try {
      const data = await fetchToolJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,inr');
      const usdValue = data?.bitcoin?.usd, inrValue = data?.bitcoin?.inr;
      const usd = Number(usdValue), inr = Number(inrValue);
      if (usdValue === null || usdValue === undefined || inrValue === null || inrValue === undefined || !Number.isFinite(usd) || !Number.isFinite(inr) || usd <= 0 || inr <= 0) throw new Error('Crypto price unavailable.');
      return 'Bitcoin is ' + usd + ' dollars, ' + inr + ' rupees, Boss.';
    } catch (e) {
      return 'Crypto service error, Boss.';
    }
  }

  return null;
}

// ===== 3.5. AGENT MODE =====
const AGENT_TOOLS = Object.freeze({
  time: async () => handleTools('current time'),
  weather: async () => handleTools('weather'),
  news: async () => handleTools('news'),
  crypto: async () => handleTools('bitcoin')
});
const AGENT_TOOL_NAMES = Object.freeze({
  time: 'time', weather: 'weather', news: 'news', crypto: 'crypto'
});

function isAgentModeRequest(text = '') {
  const value = String(text || '');
  if (/\b(?:agent(?:\s+mode)?|run\s+(?:the\s+)?agent|use\s+(?:the\s+)?agent)\b/i.test(value)) return true;
  if (/\b(?:briefing|research|analy[sz]e|analysis)\b/i.test(value)) return true;
  return /\bplan\b/i.test(value) && /\b(?:time|weather|news|crypto|bitcoin|btc)\b/i.test(value);
  }
    Personal-ai-assistant/frontend
/script.js

Code

Blame
1239 lines (1136 loc) · 51.8 KB
function toggleWakeWord() {
// ===== 1. API KEY =====
let API_KEY = localStorage.getItem('jarvis_key');
if (!API_KEY) {
  API_KEY = prompt('Enter your Gemini API Key:');
  if (API_KEY) localStorage.setItem('jarvis_key', API_KEY);
}

function extractInteractionText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const steps = Array.isArray(data?.steps) ? data.steps : Array.isArray(data?.outputs) ? data.outputs : [];
  return steps
    .filter(step => step && (step.type === 'model_output' || step.type === 'text' || !step.type))
    .flatMap(step => Array.isArray(step.content) ? step.content : typeof step.text === 'string' ? [{ type: 'text', text: step.text }] : [])
    .filter(part => part && (part.type === 'text' || typeof part.text === 'string') && typeof part.text === 'string')
    .map(part => part.text)
    .join('\n')
    .trim();
}

async function requestGeminiInteraction(input, systemInstruction = GEMINI_SYSTEM_INSTRUCTION) {
  if (!API_KEY) throw new Error('Gemini API key is missing. Reload the page and enter it again.');
  const payload = { model: GEMINI_MODEL, input, store: false };
  if (systemInstruction) payload.system_instruction = systemInstruction;
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY,
      'Api-Revision': '2026-05-20'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || 'Gemini request failed (' + response.status + ').');
  }
  const reply = extractInteractionText(data);
  if (!reply) throw new Error(data?.status === 'failed' ? 'Gemini could not complete this request.' : 'Gemini returned an empty response.');
  return reply;
}
const GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_SYSTEM_INSTRUCTION = 'You are J.A.R.V.I.S, a friendly personal assistant for Vamshi. Reply naturally in a warm Telugu-English mix, using clear concise language. If you do not know, say so plainly.';

// ===== 2. MEMORY =====
let MEMORY = [];
try {
  const storedMemory = JSON.parse(localStorage.getItem('jarvis_memory') || '[]');
  if (Array.isArray(storedMemory)) {
    MEMORY = storedMemory.filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && !(m.role === 'model' && /^(?:Your strong password:|ఇదిగో strong password:)/i.test(m.text)));
    if (MEMORY.length !== storedMemory.length) localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY));
  } else {
    localStorage.removeItem('jarvis_memory');
  }
} catch (e) {
  localStorage.removeItem('jarvis_memory');
}

const chat = document.getElementById('chat');
const conversationStage = document.getElementById('conversation-stage');
const input = document.getElementById('msg');
const micBtn = document.getElementById('mic-btn');
const clearBtn = document.getElementById('clear-btn');
const camBtn = document.getElementById('cam-btn');
const imgInput = document.getElementById('img-input');
const historyList = document.getElementById('history-list');
const historyCount = document.getElementById('history-count');
const menuButton = document.getElementById('menu-btn');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const settingsOpen = document.getElementById('settings-open');
const settingsClose = document.getElementById('settings-close');
const settingsPanel = document.getElementById('settings-panel');
const settingsScrim = document.getElementById('settings-scrim');
const themeSelect = document.getElementById('theme-select');
const clearMemorySetting = document.getElementById('clear-memory-setting');

  rec.onresult = event => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result.isFinal) continue;
      const transcript = result[0]?.transcript?.trim();
      if (!transcript) continue;

      if (!wakeWordEnabled) {
        if (recognitionMode === 'manual') processVoiceCommand(transcript);
        continue;
      }

      const wakeMatch = transcript.match(WAKE_WORD_PATTERN);
      if (wakeAwaitingCommand) {
        const command = wakeMatch
          ? transcript.slice(wakeMatch.index + wakeMatch[0].length).replace(/^[\s,.:;!?-]+/, '').trim()
          : transcript;
        if (command) {
          wakeAwaitingCommand = false;
          wakeCommandPending = true;
          updateWakeUI('PROCESSING...');
          stopRecognition();
          processVoiceCommand(command);
          return;
        }
        if (wakeMatch) { promptForWakeCommand(); return; }
        continue;
      }

      if (!wakeMatch) continue;
      const command = transcript.slice(wakeMatch.index + wakeMatch[0].length).replace(/^[\s,.:;!?-]+/, '').trim();
      if (command) {
        wakeCommandPending = true;
        updateWakeUI('PROCESSING...');
        stopRecognition();
        processVoiceCommand(command);
        return;
      }
      promptForWakeCommand();
      return;
    }
  };

  rec.onerror = event => {
    recognitionActive = false;
    micBtn.classList.remove('listening');
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      wakeWordEnabled = false;
      wakeAwaitingCommand = false;
      add('SYSTEM: Microphone access was blocked. Allow microphone permission to use voice.', 'ai');
    } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
      add('SYSTEM: Voice input failed. Please try again.', 'ai');
    }
    updateWakeUI();
  };

  rec.onend = () => {
    recognitionActive = false;
    micBtn.classList.remove('listening');
    if (wakeWordEnabled && document.hidden) {
      updateWakeUI('RETURN TO J.A.R.V.I.S');
    } else if (wakeWordEnabled && !wakeCommandPending && !wakePromptPending && !wakeReplyPending) {
      updateWakeUI('RECONNECTING...');
      scheduleWakeRestart();
    } else {
      updateWakeUI();
      if (!document.body.classList.contains('is-thinking')) setJarvisVisualState('IDLE');
    }
  };
} else {
  if (wakeBtn) wakeBtn.disabled = true;
  if (wakeStatus) wakeStatus.textContent = 'VOICE UNAVAILABLE';
}

function toggleWakeWord() {
  if (!rec) {
    add('SYSTEM: Wake word is not supported in this browser.', 'ai');
    return;
  }
  wakeWordEnabled = !wakeWordEnabled;
  wakeAwaitingCommand = false;
  updateWakeUI();
  if (wakeWordEnabled) {
    if (recognitionActive && recognitionMode === 'manual') stopRecognition();
    else if (!recognitionActive) startRecognition('wake');
  } else {
    if (wakeRestartTimer) clearTimeout(wakeRestartTimer);
    wakeRestartTimer = null;
    stopRecognition();
    updateWakeUI();
  }
}

function promptForWakeCommand() {
  wakeAwaitingCommand = true;
  wakePromptPending = true;
  updateWakeUI('SAY COMMAND');
  stopRecognition();
  add('J.A.R.V.I.S: చెప్పు, వింటున్నాను.', 'ai', true);
  speak('చెప్పు, వింటున్నాను.', () => {
    wakePromptPending = false;
    if (wakeWordEnabled) scheduleWakeRestart();
  });
}

function handleWakeVisibilityChange() {
  if (!wakeWordEnabled) return;
  if (document.hidden) {
    if (wakeRestartTimer) clearTimeout(wakeRestartTimer);
    wakeRestartTimer = null;
    if (recognitionActive) stopRecognition();
    updateWakeUI('RETURN TO J.A.R.V.I.S');
    return;
  }

  // Background tabs may suspend speech recognition/TTS while another app is open.
  // On return, finish any interrupted reply and resume the active command session.
  if (wakeReplyPending) {
    if (pendingWakeReplyText !== null) {
      const reply = pendingWakeReplyText;
      pendingWakeReplyText = null;
      speak(reply, finishWakeReply);
    } else if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    return;
  }
  if (wakePromptPending) {
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    wakePromptPending = false;
  }
  if (!recognitionActive && !wakeCommandPending && !wakePromptPending && !wakeReplyPending) scheduleWakeRestart();
}

document.addEventListener('visibilitychange', handleWakeVisibilityChange);
window.addEventListener('focus', handleWakeVisibilityChange);
window.addEventListener('pageshow', handleWakeVisibilityChange);
if (wakeBtn) wakeBtn.addEventListener('click', toggleWakeWord);

micBtn.onclick = () => {
  if (!rec) {
    add('SYSTEM: Voice input is not supported in this browser.', 'ai');
    return;
  }
  if (wakeWordEnabled) {
    add('SYSTEM: Turn off Wake Word before using one-time voice input.', 'ai');
    return;
  }
  if (recognitionActive && recognitionMode === 'manual') {
    stopRecognition();
    return;
  }
  startRecognition('manual');
};

let voices = [];
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  try { voices = window.speechSynthesis.getVoices(); }
  catch (e) { voices = []; }
}
loadVoices();
if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = loadVoices;

function finishWakeReply() {
  wakeReplyPending = false;
  pendingWakeReplyText = null;
  wakeCommandPending = false;
  if (wakeWordEnabled) {
    wakeAwaitingCommand = true;
    updateWakeUI('NEXT COMMAND');
    scheduleWakeRestart();
  } else updateWakeUI();
  }
function speakAssistantReply(text) {
  if (wakeWordEnabled && wakeCommandPending) {
    wakeReplyPending = true;
    if (document.hidden) {
      pendingWakeReplyText = String(text || '');
      return;
    }
    pendingWakeReplyText = null;
    speak(text, finishWakeReply);
  } else speak(text);
}

function speakWithWakePause(text) {
  if (!wakeWordEnabled) { speak(text); return; }
  wakePromptPending = true;
  stopRecognition();
  speak(text, () => {
    wakePromptPending = false;
    if (wakeWordEnabled) scheduleWakeRestart();
  });
}

function speak(t, onComplete) {
  let completed = false;
  let fallbackTimer = null;
  const finish = () => {
    if (completed) return;
    completed = true;
    if (fallbackTimer) clearTimeout(fallbackTimer);
    if (typeof onComplete === 'function') onComplete();
  };
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    finish();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(t);
  utterance.rate = 0.96;
  utterance.pitch = 1.0;
  const isTelugu = /[\u0C00-\u0C7F]/.test(t);
  const voice = isTelugu ? voices.find(v => /^te[-_]/i.test(v.lang)) : voices.find(v => /^en[-_]/i.test(v.lang));
  if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
  else utterance.lang = isTelugu ? 'te-IN' : 'en-IN';
  utterance.onend = finish;
  utterance.onerror = finish;
  if (typeof onComplete === 'function') fallbackTimer = setTimeout(finish, Math.max(10000, Math.min(90000, String(t).length * 100)));
  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    finish();
  }
}

// ===== 7. SEND + CLEAR =====
document.getElementById('send').onclick = () => {
  const t = input.value.trim();
  if (!t) return;
  add('YOU: ' + t, 'user');
  input.value = '';
  input.style.height = 'auto';
  askGemini(t);
};

clearBtn.onclick = () => {
  MEMORY = [];
  saveMemory();
  chat.replaceChildren();
  document.body.classList.remove('has-conversation');
  chat.scrollTop = 0;
  conversationStage.scrollTop = 0;
  setThinking(false);
  setJarvisVisualState('IDLE');
};

function add(t, w, force = false) {
  if (w === 'ai' && !force && isTransientActivity(t)) {
    setThinking(true, activityLabel(t));
    return null;
  }
  const d = document.createElement('div');
  d.className = 'msg ' + w;
  d.innerText = t;
  chat.appendChild(d);
  document.body.classList.toggle('has-conversation', chat.children.length > 0);
  scrollConversationToBottom();
  return d;
}

document.getElementById('new-chat').addEventListener('click', startNewConversation);
menuButton.addEventListener('click', toggleSidebar);
sidebarToggle.addEventListener('click', toggleSidebar);
sidebarBackdrop.addEventListener('click', () => {
  document.body.classList.remove('sidebar-open');
  sidebarBackdrop.hidden = true;
});
settingsOpen.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);
settingsScrim.addEventListener('click', closeSettings);
themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));
clearMemorySetting.addEventListener('click', () => {
  clearBtn.click();
  closeSettings();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (!settingsPanel.hidden) closeSettings();
    document.body.classList.remove('sidebar-open');
    sidebarBackdrop.hidden = true;
  }
  if (event.key === 'Enter' && !event.shiftKey && document.activeElement === input) {
    event.preventDefault();
    document.getElementById('send').click();
  }
});

input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 180) + 'px';
});

document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
  input.value = button.dataset.prompt || '';
  input.focus();
  input.dispatchEvent(new Event('input'));
}));

// ===== ORBS INITIALIZATION =====
let orbInstance = null;

function initOrbs() {
  const container = document.getElementById('jarvis-core-container');
  if (!container) return;

  orbInstance = new Orbs(container, {
    colorPrimary: '#00ffff',
    colorSecondary: '#ff00ff',
    speed: 0.5,
    complexity: 5
  });
}

function setJarvisVisualState(state) {
  if (!orbInstance) return;

  switch (state) {
    case 'IDLE':
      orbInstance.setSpeed(0.5);
      orbInstance.setColor('#00ffff');
      break;
    case 'LISTENING':
      orbInstance.setSpeed(1.5);
      orbInstance.setColor('#00ff00');
      break;
    case 'THINKING':
      orbInstance.setSpeed(3.0);
      orbInstance.setColor('#ffa500');
      break;
    case 'SPEAKING':
      orbInstance.setSpeed(1.0);
      orbInstance.setColor('#00ccff');
      break;
    case 'ERROR':
      orbInstance.setColor('#ff0000');
      break;
  }
}

window.addEventListener('load', () => {
  initOrbs();
  setJarvisVisualState('IDLE');
});
