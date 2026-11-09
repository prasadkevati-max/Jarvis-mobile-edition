import webbrowser

def respond(command):
    c = command.lower().strip()

    if c.startswith("play"):
        song = c.replace("play", "", 1).strip()
        webbrowser.open(f"https://www.youtube.com/results?search_query={song}")
        return f"Playing {song} on YouTube"
    elif "open youtube" in c:
        webbrowser.open("https://www.youtube.com")
        return "Opening YouTube"
    elif c in ("hi", "hello", "hi jarvis", "hello jarvis"):
        return "Systems online. How may I assist you, Boss?"
    elif "what are you doing" in c:
        return "Waiting for your command, Boss."
    elif "who are you" in c:
        return "I am J.A.R.V.I.S, your assistant."
    elif c in ("bye", "exit", "quit"):
        return "Goodbye, Boss."
    else:
        return "Sorry Boss, I didn't understand that."

while True:
    cmd = input("YOU: ")
    reply = respond(cmd)
    print("J.A.R.V.I.S:", reply)
    if cmd.lower().strip() in ("bye", "exit", "quit"):
        break
