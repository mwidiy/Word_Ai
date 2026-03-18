// Parse .env to get apikey1, apikey2, etc.
let apiKeys: string[] = [];

function loadKeys() {
  if (apiKeys.length > 0) return;

  // TRIK PAMUNGKAS: Next.js Webpack SANGAT agresif memblokir akses process.env dinamis.
  // Satu-satunya cara agar variabel Vercel 100% terbaca adalah dengan menuliskannya secara EKSPLISIT.
  const potentialKeys = [
    process.env.apikey1, process.env.apikey2, process.env.apikey3, process.env.apikey4, process.env.apikey5,
    process.env.apikey6, process.env.apikey7, process.env.apikey8, process.env.apikey9, process.env.apikey10,
    process.env.apikey11, process.env.apikey12, process.env.apikey13, process.env.apikey14, process.env.apikey15,
    process.env.apikey16, process.env.apikey17, process.env.apikey18, process.env.apikey19, process.env.apikey20,
    process.env.apikey21, process.env.apikey22, process.env.apikey23, process.env.apikey24, process.env.apikey25,
    process.env.apikey26, process.env.apikey27, process.env.apikey28, process.env.apikey29, process.env.apikey30
  ];

  for (const key of potentialKeys) {
    if (key && typeof key === 'string' && key.trim() !== '') {
      apiKeys.push(key.trim());
    }
  }

  // Fallback uppercase jika user menulis APIKEY di Vercel
  if (apiKeys.length === 0) {
    const uppercaseKeys = [
      process.env.APIKEY1, process.env.APIKEY2, process.env.APIKEY3, process.env.APIKEY4, process.env.APIKEY5,
      process.env.APIKEY6, process.env.APIKEY7, process.env.APIKEY8, process.env.APIKEY9, process.env.APIKEY10,
      process.env.APIKEY11, process.env.APIKEY12, process.env.APIKEY13, process.env.APIKEY14, process.env.APIKEY15
    ];
    for (const key of uppercaseKeys) {
      if (key && typeof key === 'string' && key.trim() !== '') {
        apiKeys.push(key.trim());
      }
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
