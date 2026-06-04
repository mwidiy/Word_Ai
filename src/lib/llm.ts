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

export async function makeOpenRouterChatRequest(messages: any[], model: string = "agt_BxcRatEWzVYH2yRNtyWynn") {
    loadKeys();
    if (apiKeys.length === 0) {
        throw new Error("No API keys found in environment.");
    }

    const maxAttempts = apiKeys.length;
    let attempts = 0;
    let lastError = "";

    // Upstage agent models expect 'content' to be a list of objects.
    // If we have a string content, we must wrap it.
    const formattedMessages = messages.map(msg => {
        if (typeof msg.content === 'string') {
            return {
                role: msg.role,
                content: [
                    { type: "text", text: msg.content }
                ]
            };
        }
        return msg;
    });

    while (attempts < maxAttempts) {
        const apiKey = getNextApiKey();
        try {
            // Step 1: Initiate the response
            const response = await fetch("https://api.upstage.ai/v2/responses", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: model,
                    include: ["last"],
                    input: formattedMessages
                })
            });

            const data = await response.json();
            
            if (!response.ok) {
                const errorMsg = data.error ? data.error.message : response.statusText;
                throw new Error(`HTTP ${response.status}: ${errorMsg}`);
            }

            let respId = data.id;
            let status = data.status;

            // Step 2: Poll until completed
            while (status === "queued" || status === "in_progress") {
                // Wait 2 seconds
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const pollResp = await fetch(`https://api.upstage.ai/v2/responses/${respId}?include=last`, {
                    headers: {
                        "Authorization": `Bearer ${apiKey}`
                    }
                });
                
                const pollData = await pollResp.json();
                
                if (!pollResp.ok) {
                    const errorMsg = pollData.error ? pollData.error.message : pollResp.statusText;
                    throw new Error(`Polling HTTP ${pollResp.status}: ${errorMsg}`);
                }
                
                status = pollData.status;
                
                if (status === "completed") {
                    return pollData.output_text || "[Empty Response]";
                }
                if (status === "failed") {
                    throw new Error(`Upstage API processing failed: ${JSON.stringify(pollData)}`);
                }
            }
            
            throw new Error(`Upstage API stopped with status: ${status}`);
            
        } catch (err: any) {
            console.warn(`[WARN] Fetch error: ${err.message}. Mencoba key selanjutnya...`);
            lastError = err.message;
            attempts++;
        }
    }
    
    throw new Error(`Semua ${maxAttempts} percobaan API Key gagal. Error terakhir: ${lastError}`);
}

/**
 * Make a request to OpenRouter (now Upstage) using round-robin and auto-retry
 */
export async function makeOpenRouterRequest(systemPrompt: string, userMessage: string, model: string = "agt_BxcRatEWzVYH2yRNtyWynn") {
    return makeOpenRouterChatRequest([
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
    ], model);
}
