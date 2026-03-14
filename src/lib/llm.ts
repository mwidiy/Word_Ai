import fs from 'fs';
import path from 'path';

// Parse .env to get api26 - api55
let apiKeys: string[] = [];

// Fallback logic to read from process.env if available
function loadKeys() {
  if (apiKeys.length > 0) return;
  for (let i = 26; i <= 55; i++) {
    const key = process.env[`api${i}`];
    if (key) {
      apiKeys.push(key);
    }
  }
}

let currentIndex = 0;

/**
 * Returns the next available API key using Round-Robin.
 */
export function getNextApiKey(): string {
  loadKeys();
  if (apiKeys.length === 0) {
    throw new Error("No API keys found in environment.");
  }
  const key = apiKeys[currentIndex];
  currentIndex = (currentIndex + 1) % apiKeys.length;
  return key;
}

/**
 * Make a request to OpenRouter using next round-robin key
 */
export async function makeOpenRouterRequest(systemPrompt: string, userMessage: string, model: string = "openrouter/free") {
    const apiKey = getNextApiKey();
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage }
            ]
        })
    });

    const data = await response.json();
    if (!response.ok) {
        const errorMsg = data.error ? data.error.message : response.statusText;
        throw new Error(`HTTP ${response.status}: ${errorMsg}`);
    }

    if (data.choices && data.choices.length > 0) {
        return data.choices[0].message.content || "[Empty Response]";
    }
    return JSON.stringify(data, null, 2);
}
