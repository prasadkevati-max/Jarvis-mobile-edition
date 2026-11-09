// ===== 1. API KEY (stored only in this browser) =====
let API_KEY = localStorage.getItem('jarvis_key');
if (!API_KEY) {
  API_KEY = prompt('Enter your Gemini API Key:');
  if (API_KEY) localStorage.setItem('jarvis_key', API_KEY);
}

// ===== 2. MODELS (auto-fallback) =====
const MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const micBtn = document.getElementById('mic-btn');

// ===== 3. CHAT HELPER =====
function add(text, who) {
  const d = document.createElement('div');
  d.className = 'msg ' + who;
  d.innerText = text;
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
  return d;
}

// ===== 4. GEMINI BRAIN =====
async function callGemini(p) {
  let lastErr;
  for (const m of MODELS) {
    try {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent?key=' + API_KEY,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: p }] }] })
        }
      );
      const data = await res.json();
      if (data.error) {
        lastErr = new Error(data.error.message);
        continue; // try next model
      }
      return data.candidates[0].content.parts[0].text;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function askGemini(p) {
  const bubble = add('J.A.R.V.I.S: Thinking...', 'ai');
  try {
    const reply = await callGemini(p);
    bubble.innerText = 'J.A.R.V.I.S: ' + reply;
    speak(reply);
  } catch (e) {
    bubble.innerText = 'J.A.R.V.I.S: ERROR - ' + e.message;
  }
}

// ===== 5. SPEECH RECOGNITION =====
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;

if (SR) {
  rec = new SR();
  rec.lang = 'te-IN'; // English: 'en-US'
  rec.onresult = (e) => {
    const t = e.results[0][0].transcript;
    add('YOU: ' + t, 'user');
    askGemini(t);
  };
  rec.onend = () => { micBtn.innerText = '🎤'; };
  rec.onerror = () => { micBtn.innerText = '🎤'; };
}

micBtn.onclick = () => {
  if (!rec) {
    add('J.A.R.V.I.S: Mic is not supported in this browser. Use Chrome.', 'ai');
    return;
  }
  rec.start();
  micBtn.innerText = 'LISTENING...';
};

// ===== 6. TEXT-TO-SPEECH =====
let voices = [];
function loadVoices() { voices = speechSynthesis.getVoices(); }
loadVoices();
speechSynthesis.onvoiceschanged = loadVoices;

function speak(t) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.lang = 'te-IN';
  speechSynthesis.speak(u);
}

// ===== 7. SEND BUTTON + ENTER KEY =====
function send() {
  const t = input.value.trim();
  if (!t) return;
  add('YOU: ' + t, 'user');
  input.value = '';
  askGemini(t);
}

document.getElementById('send').onclick = send;
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') send();
});
