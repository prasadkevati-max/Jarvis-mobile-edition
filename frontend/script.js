// ====== SETTINGS ======
let API_KEY = localStorage.getItem("jarvis_key");
if (!API_KEY) {
  API_KEY = prompt("Gemini API key enter cheyandi:");
  if (API_KEY) localStorage.setItem("jarvis_key", API_KEY);
}
// https://aistudio.google.com lo free key teesukondi
const MODEL = "gemini-3.8-flash";           // model pani cheyakapote kotha model peru pettandi
const MEMORY_KEY = "jarvis_memory";

// ====== ELEMENTS (index.html IDs tho match avvali) ======
const chatBox = document.getElementById("chat");
const msgInput = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const clearBtn = document.getElementById("clear-btn");
const imgInput = document.getElementById("img-input");
const coreText = document.querySelector(".core-text");

// ====== MEMORY ======
let history = [];
try {
  history = JSON.parse(localStorage.getItem(MEMORY_KEY)) || [];
} catch (e) {
  history = [];
}

function saveMemory() {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(history.slice(-30)));
  } catch (e) {}
}

// ====== UI HELPERS ======
function addMessage(who, text) {
  const div = document.createElement("div");
  div.style.margin = "8px 0";
  div.style.color = who === "You" ? "#00ffff" : "#00ff66";
  div.textContent = who + ": " + text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function setStatus(text) {
  if (coreText) coreText.textContent = text;
}

history.forEach(h => addMessage(h.role === "user" ? "You" : "JARVIS", h.parts[0].text));

// ====== AI CALL ======
async function askAI(text, imageBase64 = null, mime = "image/jpeg") {
  if (!API_KEY) {
    addMessage("JARVIS", "API key pettaledu. script.js lo API_KEY set cheyandi.");
    return;
  }

  const parts = [{ text }];
  if (imageBase64) parts.push({ inline_data: { mime_type: mime, data: imageBase64 } });

  const contents = [...history, { role: "user", parts }];
  setStatus("THINKING...");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents })
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "Request failed");

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Response raledu.";
    addMessage("JARVIS", reply);

    history.push({ role: "user", parts: [{ text }] });
    history.push({ role: "model", parts: [{ text: reply }] });
    saveMemory();
    speak(reply);
  } catch (err) {
    addMessage("JARVIS", "Error: " + err.message);
  } finally {
    setStatus("SYSTEM READY");
  }
}

// ====== SEND ======
function sendMessage() {
  const text = msgInput.value.trim();
  if (!text) return;
  addMessage("You", text);
  msgInput.value = "";
  askAI(text);
}

sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", e => {
  if (e.key === "Enter") sendMessage();
});

// ====== VOICE OUTPUT ======
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ====== MIC (VOICE INPUT) ======
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
micBtn.addEventListener("click", () => {
  if (!SR) {
    addMessage("JARVIS", "Mee browser lo voice input support ledu. Chrome vaadandi.");
    return;
  }
  const rec = new SR();
  rec.lang = "en-IN"; // Telugu kosam "te-IN"
  rec.onstart = () => setStatus("LISTENING...");
  rec.onend = () => setStatus("SYSTEM READY");
  rec.onerror = e => addMessage("JARVIS", "Mic error: " + e.error);
  rec.onresult = e => {
    const text = e.results[0][0].transcript;
    addMessage("You", text);
    askAI(text);
  };
  rec.start();
});

// ====== CAMERA / IMAGE ======
camBtn.addEventListener("click", () => imgInput.click());

imgInput.addEventListener("change", () => {
  const file = imgInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(",")[1];
    addMessage("You", "[Image pampanu] " + file.name);
    askAI("Ee image gurinchi cheppu.", base64, file.type);
  };
  reader.readAsDataURL(file);
  imgInput.value = "";
});

// ====== CLEAR MEMORY ======
clearBtn.addEventListener("click", () => {
  history = [];
  try {
    localStorage.removeItem(MEMORY_KEY);
  } catch (e) {}
  chatBox.innerHTML = "";
  addMessage("JARVIS", "Memory clear ayyindi.");
});
