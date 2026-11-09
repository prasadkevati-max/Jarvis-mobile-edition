const chat = document.getElementById('chat');
const input = document.getElementById('msg');

function respond(text) {
    const c = text.toLowerCase().trim();

    if (c.startsWith('play ')) {
        const song = c.replace('play', '').trim();
        window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(song), '_blank');
        return 'Playing ' + song + ' on YouTube';
    }
    if (c.includes('open youtube')) {
        window.open('https://www.youtube.com', '_blank');
        return 'Opening YouTube';
    }
    if (['hi', 'hello', 'hi jarvis', 'hello jarvis'].includes(c)) {
        return 'Systems online. How may I assist you, Boss?';
    }
    if (c.includes('what are you doing')) {
        return 'Waiting for your command, Boss.';
    }
    if (c.includes('who are you')) {
        return 'I am J.A.R.V.I.S, your assistant.';
    }
    if (c.includes('time')) {
        return 'The time is ' + new Date().toLocaleTimeString();
    }
    return "Sorry Boss, I didn't understand that.";
}

function add(text, who) {
    const d = document.createElement('div');
    d.className = 'msg ' + who;
    d.innerText = text;
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
    return d;
}

function send() {
    const t = input.value.trim();
    if (!t) return;
    add('YOU: ' + t, 'user');
    input.value = '';
    const reply = add('J.A.R.V.I.S: Processing...', 'ai');
    setTimeout(() => {
        reply.innerText = 'J.A.R.V.I.S: ' + respond(t);
    }, 500);
}

document.getElementById('send').onclick = send;
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
});
