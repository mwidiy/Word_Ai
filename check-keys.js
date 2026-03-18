import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
dotenv.config({ path: path.join(__dirname, './.env') });

const apiKeys = [];
for (let i = 1; i <= 50; i++) {
  const key = process.env[`apikey${i}`];
  if (key) {
    apiKeys.push({ key, label: `apikey${i}` });
  }
}

console.log(`Ditemukan ${apiKeys.length} API Keys dalam .env\nMemulai pengecekan massal...`);

async function testKey(key, label) {
  try {
    const response = await fetch("https://api.friendli.ai/serverless/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-ai/DeepSeek-V3.2", // Model default untuk tes
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1
      })
    });

    if (response.ok) {
      console.log(`✅ [${label}] OK - API Key Aktif & Valid (Friendli AI)`);
      return { key, valid: true };
    } else {
      const data = await response.json().catch(() => ({}));
      const errorMsg = data.error?.message || response.statusText;
      console.log(`❌ [${label}] GAGAL - Status: ${response.status} ${errorMsg}`);
      return { key, valid: false };
    }
  } catch (err) {
    console.log(`❌ [${label}] ERROR - ${err.message}`);
    return { key, valid: false };
  }
}

async function runCheck() {
  const results = [];
  let i = 0;
  for (const item of apiKeys) {
      const result = await testKey(item.key, item.label);
      results.push(result);
      await new Promise(r => setTimeout(r, 50));
  }

  const validKeys = results.filter(r => r.valid).length;
  console.log(`\n=== KESIMPULAN ===`);
  console.log(`Total Keys: ${apiKeys.length}`);
  console.log(`Valid: ${validKeys}`);
  console.log(`Mati/Banned: ${apiKeys.length - validKeys}`);
  
  if (validKeys === 0) {
      console.log("\n⚠️ WARNING: SEMUA API KEY ANDA SUDAH MATI ATAU DIBAN! MAUPUN LIMIT HABIS. ⚠️");
  }
}

runCheck();
