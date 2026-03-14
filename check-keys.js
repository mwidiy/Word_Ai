import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

const apiKeys = [];
for (let i = 26; i <= 55; i++) {
  const key = process.env[`api${i}`];
  if (key) {
    apiKeys.push(key);
  }
}

console.log(`Ditemukan ${apiKeys.length} API Keys dalam .env\nMemulai pengecekan massal...`);

async function testKey(key, index) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${key}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      const limits = data.data?.limit > 0 ? `(Used: ${data.data.usage} / Limit: ${data.data.limit})` : `(Usage: ${data.data.usage})`;
      console.log(`✅ [Key ${index + 26}] OK - Rate Limit: ${data.data?.rate_limit?.requests} req/s ${limits}`);
      return { key, valid: true };
    } else {
      console.log(`❌ [Key ${index + 26}] GAGAL - Status: ${response.status} ${response.statusText}`);
      return { key, valid: false };
    }
  } catch (err) {
    console.log(`❌ [Key ${index + 26}] ERROR - ${err.message}`);
    return { key, valid: false };
  }
}

async function runCheck() {
  const results = [];
  let i = 0;
  for (const key of apiKeys) {
      const result = await testKey(key, i);
      results.push(result);
      i++;
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
