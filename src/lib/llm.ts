// Parse .env to get apikey1, apikey2, etc.
let apiKeys: string[] = [];

function loadKeys() {
  if (apiKeys.length > 0) return;
  
  // Trik membaca process.env agar tidak di-hardcode/dihapus oleh Next.js Webpack saat proses Build
  const envObj: Record<string, any> = typeof process !== 'undefined' ? process['env'] : {};
  
  // Deteksi semua variabel tanpa peduli indeks/angka urutannya (apikey1, apikey3, APIKEY13, dll)
  for (const key of Object.keys(envObj)) {
    if (key.toLowerCase().startsWith('apikey')) {
      const val = envObj[key];
      if (val && typeof val === 'string' && val.trim() !== '') {
        apiKeys.push(val.trim());
      }
    }
  }

  // Jika entah kenapa Object.keys gagal, gunakan fallback loop statis yang lebih banyak
  if (apiKeys.length === 0) {
    for (let i = 1; i <= 50; i++) {
      const k1 = envObj[`apikey${i}`];
      const k2 = envObj[`APIKEY${i}`];
      const val = k1 || k2;
      if (val) apiKeys.push(val);
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
 * Make a request to OpenRouter using round-robin and auto-retry
 */
export async function makeOpenRouterRequest(systemPrompt: string, userMessage: string, model: string = "deepseek-ai/DeepSeek-V3.2") {
    loadKeys();
    if (apiKeys.length === 0) {
        throw new Error("No API keys found in environment.");
    }

    const maxAttempts = apiKeys.length; // Coba seluruh key berbeda sebelum menyerah
    let attempts = 0;
    let lastError = "";

    while (attempts < maxAttempts) {
        const apiKey = getNextApiKey();
        try {
            const response = await fetch("https://api.friendli.ai/serverless/v1/chat/completions", {
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
            
            if (response.ok && data.choices && data.choices.length > 0) {
                return data.choices[0].message.content || "[Empty Response]";
            }
            
            // Jika error dari OpenRouter (misal 401, 429)
            const errorMsg = data.error ? data.error.message : response.statusText;
            console.warn(`[WARN] API Key berawalan ${apiKey.substring(0, 12)} gagal. Status: ${response.status} - ${errorMsg}. Mencoba key selanjutnya...`);
            lastError = `HTTP ${response.status}: ${errorMsg}`;
            attempts++;
            
        } catch (err: any) {
            console.warn(`[WARN] Fetch error: ${err.message}. Mencoba key selanjutnya...`);
            lastError = err.message;
            attempts++;
        }
    }
    
    throw new Error(`Semua ${maxAttempts} percobaan API Key gagal. Error terakhir: ${lastError}`);
}

/**
 * Make a request to OpenRouter using full conversation history
 */
export async function makeOpenRouterChatRequest(messages: any[], model: string = "deepseek-ai/DeepSeek-V3.2") {
    loadKeys();
    if (apiKeys.length === 0) {
        throw new Error("No API keys found in environment.");
    }

    const maxAttempts = apiKeys.length; // Coba seluruh key berbeda sebelum menyerah
    let attempts = 0;
    let lastError = "";

    while (attempts < maxAttempts) {
        const apiKey = getNextApiKey();
        try {
            const response = await fetch("https://api.friendli.ai/serverless/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages
                })
            });

            const data = await response.json();
            
            if (response.ok && data.choices && data.choices.length > 0) {
                return data.choices[0].message.content || "[Empty Response]";
            }
            
            const errorMsg = data.error ? data.error.message : response.statusText;
            console.warn(`[WARN] API Key berawalan ${apiKey.substring(0, 12)} gagal. Status: ${response.status} - ${errorMsg}.`);
            lastError = `HTTP ${response.status}: ${errorMsg}`;
            attempts++;
            
        } catch (err: any) {
            console.warn(`[WARN] Fetch error: ${err.message}.`);
            lastError = err.message;
            attempts++;
        }
    }
    
    throw new Error(`Semua ${maxAttempts} percobaan API Key gagal. Error terakhir: ${lastError}`);
}
