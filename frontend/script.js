async function sendMessage() {
  const input = document.getElementById("user-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";

  addMessage("YOU", text);

  const res = await fetch("YOUR_BACKEND_URL", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text })
  });
  const data = await res.json();
  addMessage("J.A.R.V.I.S", data.reply);
}
