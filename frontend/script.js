// ===== 0. CONFIG =====
const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY'; // <-- ikkada mee key pettandi
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=';

// ===== 1. ELEMENTS =====
const chat = document.getElementById('chat');
const statusEl = document.getElementById('status');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');

function addMsg(text, who) {
    const d = document.createElement('div');
    d.className = 'msg ' + who;
    d.textContent = text;
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
}

// ===== 2. SPEAK =====
function speak(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const isTelugu = /[\u0C00-\u0C7F]/.test(text);
    u.lang = isTelugu ? 'te-IN' : 'en-US';
    speechSynthesis.speak(u);
}

// ===== 3. TOOLS =====
async function handleTools(text) {
    const t = text.toLowerCase();

    // 1. Time
    if (/\btime\b/.test(t) || t.includes('సమయం')) {
        return 'The time is ' + new Date().toLocaleTimeString() + ', Boss.';
    }

    // 2. Weather
    if (t.includes('weather') || t.includes('వాతావరణం')) {
        return await new Promise(res => {
            if (!navigator.geolocation) return res('Location not supported, Boss.');
            navigator.geolocation.getCurrentPosition(async p => {
                try {
                    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.coords.latitude}&longitude=${p.coords.longitude}&current_weather=true`);
                    const d = await r.json();
                    res(`It is ${d.current_weather.temperature} degrees Celsius now, Boss.`);
                } catch (e) { res('Weather service error, Boss.'); }
            }, () => res('I need location permission for weather, Boss.'));
        });
    }

    // 3. Timer
    const m = t.match(/(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/i);
    if ((t.includes('timer') || t.includes('టైమర్')) && m) {
        const amount = parseInt(m[1]);
        const unit = m[2].toLowerCase();
        const factor = /^(hours?|hrs?)$/.test(unit) ? 3600000
                     : /^(seconds?|secs?)$/.test(unit) ? 1000 : 60000;
        setTimeout(() => {
            const msg = `టైమర్ పూర్తయింది! ${amount} ${unit} అయిపోయాయి.`;
            addMsg(msg, 'bot');
            speak(msg);
        }, amount * factor);
        return `Timer set for ${amount} ${unit}, Boss.`;
    }

    // 4. Translate
    if (t.includes('translate')) {
        const q = text.replace(/translate (this )?/i, '').trim() || 'hello';
        try {
            const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|te`);
            const d = await r.json();
            return 'In Telugu: ' + d.responseData.translatedText;
        } catch (e) { return 'Translate error, Boss.'; }
    }

    // 5. YouTube
    if (/^(play|youtube|search)\s+/i.test(t)) {
        const q = text.replace(/^(play|youtube|search)\s+/i, '').trim();
        if (q) {
            window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(q), '_blank');
            return 'Searching YouTube for ' + q + ', Boss.';
        }
    }

    return null; // Tool match kaakapothe Gemini ki veltundi
}

// ===== 4. GEMINI =====
async function askGemini(text) {
    if (GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
        return 'Gemini API key set cheyyandi, Boss.';
    }
    try {
        const r = await fetch(GEMINI_URL + GEMINI_API_KEY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: 'You are Jarvis, a helpful assistant. Reply briefly in the same language as the user. ' + text }] }]
            })
        });
        const d = await r.json();
        return d.candidates?.[0]?.content?.parts?.[0]?.text || 'No response, Boss.';
    } catch (e) {
        return 'Gemini error, Boss.';
    }
}

// ===== 5. MAIN HANDLER =====
async function processInput(text) {
    text = text.trim();
    if (!text) return;
    addMsg(text, 'user');
    statusEl.textContent = 'Thinking...';
    let reply = await handleTools(text);
    if (reply === null) reply = await askGemini(text);
    addMsg(reply, 'bot');
    speak(reply);
    statusEl.textContent = 'Ready';
}

// ===== 6. MIC (Speech Recognition) =====
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

if (SR) {
    recognition = new SR();
    recognition.lang = 'te-IN'; // English kosam 'en-US' pettandi
    recognition.interimResults = false;

    recognition.onstart = () => {
        listening = true;
        micBtn.classList.add('listening');
        statusEl.textContent = 'Listening...';
    };
    recognition.onend = () => {
        listening = false;
        micBtn.classList.remove('listening');
        if (statusEl.textContent === 'Listening...') statusEl.textContent = 'Ready';
    };
    recognition.onerror = e => {
        statusEl.textContent = 'Mic error: ' + e.error;
    };
    recognition.onresult = e => {
        processInput(e.results[0][0].transcript);
    };
}

micBtn.addEventListener('click', () => {
    if (!recognition) {
        alert('Speech recognition ee browser lo ledu. Chrome vadandi.');
        return;
    }
    if (listening) recognition.stop();
    else recognition.start();
});

// ===== 7. TEXT SEND =====
sendBtn.addEventListener('click', () => {
    processInput(textInput.value);
    textInput.value = '';
});
textInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendBtn.click();
});

// ===== 8. GREETING =====
addMsg('Hello Boss, nenu Jarvis ni. Mic nokki matladandi.', 'bot');
            
