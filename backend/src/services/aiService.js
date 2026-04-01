export async function generateAIResponse(prompt) {
  try {
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt,
        stream: false
      })
    });

    const data = await res.json();
    return data.response || "";
  } catch (err) {
    console.error("Ollama error:", err);
    return null;
  }
}
