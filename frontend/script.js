// ===== 1. API KEY =====
let API_KEY = localStorage.getItem('jarvis_key');
if(!API_KEY){ API_KEY = prompt('Enter your Gemini API Key:'); if(API_KEY) localStorage.setItem('jarvis_key', API_KEY); }
const MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-flash-latest"];

// ===== 2. MEMORY =====
let MEMORY = [];
try {
  const storedMemory = JSON.parse(localStorage.getItem('jarvis_memory') || '[]');
  if (Array.isArray(storedMemory)) {
    MEMORY = storedMemory.filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && !(m.role === 'model' && /^(?:Your strong password:|A strong password:)/i.test(m.text)));
    if (MEMORY.length !== storedMemory.length) localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY));
  } else {
    localStorage.removeItem('jarvis_memory');
  }
} catch (e) {
  localStorage.removeItem('jarvis_memory');
}
function saveMemory(){ localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY)); }
const chat=document.getElementById('chat');
const input=document.getElementById('msg');
const micBtn=document.getElementById('mic-btn');
const clearBtn=document.getElementById('clear-btn');
const camBtn=document.getElementById('cam-btn');
const imgInput=document.getElementById('img-input');
MEMORY.forEach(m=> add(m.role==='user'?'YOU: ':'J.A.R.V.I.S: ')+m.text, m.role==='user'?'user':'ai'));

// ===== 3. TOOLS (THE HANDS) - 15 TOOLS =====
async function fetchToolJson(url, options={}, timeoutMs=10000){
  const controller=typeof AbortController==='function'?new AbortController():null;
  const timeoutId=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
  try{
    const response=await fetch(url,{...options,...(controller?{signal:controller.signal}:{})});

async function handleTools(text) {
  const t = text.toLowerCase();

  if (/^\s*(?:please\s+)?(?:open\s+youtube|youtube\s+open|youtube)(?:\s+please)?[.!?]*\s*$/i.test(text)) {
    window.open('https://youtube.com', '_blank', 'noopener,noreferrer');
    return 'Opening YouTube, Boss.';
  }
  if (/^\s*(?:please\s+)?(?:open\s+google|google\s+open|google)(?:\s+please)?[.!?]*\s*$/i.test(text)) {
    window.open('https://google.com', '_blank', 'noopener,noreferrer');
    return 'Opening Google, Boss.';
  }

  const urlCommand = text.match(/^\s*(?:open|visit|go to)\s+(https?:\/\/\S+)\s*$/i);
  if (urlCommand) {
    try {
      const destination = new URL(urlCommand[1]);
      if (destination.protocol !== 'https:' && destination.protocol !== 'http:') return 'Only http and https links can be opened.';
      window.open(destination.href, '_blank', 'noopener,noreferrer');
      return 'Opening ' + destination.hostname + ', Boss.';
    } catch (e) {
      return 'That link does not look valid.';
    }
  }

  if (/^\s*(?:google\s+search|search\s+(?:on\s+)?google)(?:\s+for)?\s*$/i.test(text)) return 'Tell me what to search for on Google.';
  const googleSearch = text.match(/^\s*(?:google\s+search|search\s+(?:on\s+)?google)(?:\s+for)?\s+(.+?)\s*$/i);
  if (googleSearch) {
    const query = googleSearch[1].trim();
    if (!query) return 'Tell me what to search for on Google.';
    window.open('https://google.com' + encodeURIComponent(query), '_blank', 'noopener,noreferrer');
    return 'Searching Google for ' + query + ', Boss.';
  }

  const playMatch = text.match(/^\s*play\s+(.+?)\s*$/i);
  const youtubeMatch = text.match(/^\s*youtube(?:\s+search)?(?:\s+for)?\s+(.+?)\s*$/i);
  const searchYoutubeMatch = text.match(/^\s*search\s+(?:on\s+)?youtube(?:\s+for)?\s+(.+?)\s*$/i);
  const videoQuery = (playMatch || youtubeMatch || searchYoutubeMatch)?.[1]?.trim();
  if (videoQuery) {
    window.open('https://youtube.com' + encodeURIComponent(videoQuery), '_blank', 'noopener,noreferrer');
    return 'Searching YouTube for ' + videoQuery + ', Boss.';
  }

  const searchMatch = text.match(/^\s*(?:search|look up)\s+(?:for\s+)?(.+?)\s*$/i);
  if (searchMatch) {
    const query = searchMatch[1].trim();
    if (!query) return 'Tell me what to search for.';
    try {
      const url = 'https://wikipedia.org' + encodeURIComponent(query) + '&format=json&origin=*';
      const data = await fetchToolJson(url);
      const result = data?.query?.search?.[0];
      if (!result) return 'I could not find that, Boss.';
      const snippet = String(result.snippet || '').replace(/<[^>]*>/g, '').replace(/"/g, '"').replace(/&#039;/g, "'").replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
      return 'Wikipedia summary: ' + result.title + '. ' + snippet;
    } catch (e) {
      return 'Search error, Boss.';
    }
  }
}
// ===== 3.5. AGENT MODE ENGINE =====
const AGENT_TOOLS = Object.freeze({
  time: async () => handleTools('current time'),
  weather: async () => handleTools('weather'),
  news: async () => handleTools('news'),
  crypto: async () => handleTools('bitcoin')
});

const AGENT_TOOL_NAMES = Object.freeze({ 
  time: 'time', 
  weather: 'weather', 
  news: 'news', 
  crypto: 'crypto' 
});

function isAgentModeRequest(text=''){
  const value=String(text||'');
  if(/\b(?:agent(?:\s+mode)?|run\s+(?:the\s+)?agent|use\s+(?:the\s+)?agent)\b/i.test(value)) return true;
  if(/\b(?:briefing|research|analy[sz]e|analysis)\b/i.test(value)) return true;
  return /\bplan\b/i.test(value)&&/\b(?:time|weather|news|crypto|bitcoin|btc)\b/i.test(value);
}

function parseAgentToolPlan(responseText){
  const text=String(responseText||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  const start=text.indexOf('['), end=text.lastIndexOf(']');
  if(start<0||end<start) throw new Error('Agent plan format incorrect.');
  let parsed = JSON.parse(text.slice(start,end+1));
  const allowed=new Set(Object.keys(AGENT_TOOLS));
  return [...new Set(parsed.filter(item=>typeof item==='string').map(item=>item.trim().toLowerCase()).filter(item=>allowed.has(item)))];
}

async function runAgent(goal){
  add('J.A.R.V.I.S: Agent mode active.','ai');
  add('J.A.R.V.I.S: Goal analyze chesthunna...','ai');
  const planPrompt='Select tools from ["time","weather","news","crypto"]. Goal: '+JSON.stringify(String(goal));
  let toolsToRun;
  try{
    toolsToRun=parseAgentToolPlan(await callGeminiRaw(planPrompt));
  }catch(error){
    toolsToRun=fallbackAgentToolPlan(goal);
  }
  const results={};
  for(let i=0;i<toolsToRun.length;i++){
    const tool=toolsToRun[i];
    add('J.A.R.V.I.S: ['+(i+1)+'/'+toolsToRun.length+'] '+AGENT_TOOL_NAMES[tool]+' tool run chesthunna...','ai');
    try{ results[tool]=await AGENT_TOOLS[tool](); }catch(e){ results[tool]='Tool error'; }
  }
  add('J.A.R.V.I.S: Results combine chesthunna...','ai');
  const summaryPrompt='Goal: '+JSON.stringify(String(goal))+'. Tool results: '+JSON.stringify(results)+'. Give concise Telugu/English summary.';
  return await callGemini(summaryPrompt);
}
document.addEventListener("DOMContentLoaded", function () {
  const $ = id => document.getElementById(id);
  const chat = $("chat"), input = $("msg"), coreText = $("core-text");
  const imgInput = $("img-input"), preview = $("preview");
  const KEY = "jarvis_history";

  // Optional: your own backend URL for AI replies (never put API keys here)
  const AI_URL = "";

  let hist = [];
  try { hist = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) {}

  function add(who, text) {
    const d = document.createElement("div");
    d.className = "msg" + (who === "user" ? " user" : "");
    d.textContent = text;
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
  }
  function remember(who, text) {
    hist.push([who, text]);
    try { localStorage.setItem(KEY, JSON.stringify(hist.slice(-50))); } catch (e) {}
  }
  function reply(text) {
    add("ai", text); remember("ai", text);
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = /[\u0C00-\u0C7F]/.test(text) ? "te-IN" : "en-IN";
      speechSynthesis.speak(u);
    }
  }

  async function run(text) {
    text = (text || "").trim();
    if (!text) return;
    add("user", text); remember("user", text);
    input.value = "";
    const t = text.toLowerCase();

    if (t.includes("time")) reply("Ippudu " + new Date().toLocaleTimeString());
    else if (t.includes("date")) reply("Ee roju " + new Date().toLocaleDateString());
    else if (t.includes("open youtube")) { reply("YouTube open chestunnanu"); window.open("https://youtube.com", "_blank"); }
    else if (t.includes("open google")) { reply("Google open chestunnanu"); window.open("https://google.com", "_blank"); }
    else if (AI_URL) {
      try {
        const r = await fetch(AI_URL, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history: hist.slice(-10) }) });
        const j = await r.json();
        reply(j.reply || "Reply raaledu.");
      } catch (e) { reply("AI server connect avvaledu."); }
    }
    else reply("Ee command naaku teliyadu. Try: time, date, open youtube, open google");
  }

  // EXECUTE
  $("send").onclick = () => run(input.value);
  input.addEventListener("keydown", e => { if (e.key === "Enter") run(input.value); });

  // MIC
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  $("mic-btn").onclick = () => {
    if (!SR) return reply("Ee browser lo mic support ledu. Chrome vaadandi.");
    const rec = new SR();
    rec.lang = "te-IN"; // English kosam "en-IN"
    rec.onstart = () => { coreText.textContent = "LISTENING..."; };
    rec.onresult = e => run(e.results[0][0].transcript);
    rec.onerror = e => reply("Mic error: " + e.error);
    rec.onend = () => { coreText.textContent = "SYSTEM READY"; };
    rec.start();
  };

  // CAMERA / IMAGE: opens camera or gallery, then shows the photo
  $("cam-btn").onclick = () => imgInput.click();
  imgInput.onchange = () => {
    const f = imgInput.files[0];
    if (!f) return;
    preview.src = URL.createObjectURL(f);
    preview.style.display = "block";
    reply("Image vachindi. Image analysis kosam AI connection kavali.");
    imgInput.value = "";
  };

  // CLEAR MEMORY
  $("clear-btn").onclick = () => {
    hist = [];
    localStorage.removeItem(KEY);
    chat.innerHTML = "";
    preview.style.display = "none";
    reply("Memory clear ayyindi.");
  };

  hist.forEach(h => add(h[0], h[1]));
  if (!hist.length) add("ai", "Jarvis ready. Command ivvandi.");
});
// ===== 4. GEMINI BRAIN =====
async function callGemini(p){
  if(!API_KEY) throw new Error('Gemini API key is missing.');
  const contents = MEMORY.slice(-12).map(m=>({role:m.role, parts:[{text:m.text}]}));
  contents.push({role:'user', parts:[{text:p}]});
  for(const m of MODELS){
    try{
      
