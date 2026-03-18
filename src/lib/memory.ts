import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ==========================================
// SUPABASE CLIENT SETUP
// ==========================================
let supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase;
  
  const url = process.env.projeck_url || process.env.SUPABASE_URL;
  const key = process.env.publis_key || process.env.SUPABASE_KEY;
  
  if (!url || !key) {
    console.warn("[MEMORY] Supabase credentials not found. Memory system disabled.");
    return null;
  }
  
  supabase = createClient(url, key);
  console.log("[MEMORY] Supabase connected successfully.");
  return supabase;
}

// ==========================================
// LAPIS 1: CACHE EKSAK (0 API Call)
// ==========================================
// Hash sederhana untuk membuat fingerprint dari prompt
function hashPrompt(prompt: string): string {
  const cleaned = prompt.toLowerCase().trim().replace(/\s+/g, ' ');
  let hash = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `h_${Math.abs(hash).toString(36)}`;
}

/**
 * Cek apakah ada respons yang ter-cache untuk prompt ini.
 * Return null jika cache miss.
 */
export async function getCachedResponse(prompt: string): Promise<{ type: string; data: any } | null> {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const promptHash = hashPrompt(prompt);
    const { data, error } = await sb
      .from('response_cache')
      .select('response_type, response_data, hit_count')
      .eq('prompt_hash', promptHash)
      .single();

    if (error || !data) return null;

    // Update hit counter (fire-and-forget)
    sb.from('response_cache')
      .update({ hit_count: (data.hit_count || 0) + 1 })
      .eq('prompt_hash', promptHash)
      .then(() => {});

    console.log(`[MEMORY] CACHE HIT! Prompt hash: ${promptHash}, hits: ${data.hit_count + 1}`);
    return { type: data.response_type, data: data.response_data };
  } catch (e) {
    console.warn("[MEMORY] Cache lookup error:", e);
    return null;
  }
}

/**
 * Simpan respons ke cache untuk akses instan di masa depan.
 */
export async function cacheResponse(prompt: string, responseType: string, responseData: any): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  try {
    const promptHash = hashPrompt(prompt);
    await sb.from('response_cache').upsert({
      prompt_hash: promptHash,
      prompt_text: prompt.substring(0, 500), // Simpan snippet buat debugging
      response_type: responseType,
      response_data: responseData,
      hit_count: 0
    }, { onConflict: 'prompt_hash' });

    console.log(`[MEMORY] Cached response for hash: ${promptHash}`);
  } catch (e) {
    console.warn("[MEMORY] Cache save error:", e);
  }
}

// ==========================================
// PILAR 1: FUZZY INTENT PREDICTION
// ==========================================

/**
 * Mencari aksi yang pernah berhasil untuk prompt SERUPA (bukan identik).
 * Menggunakan keyword overlap scoring alih-alih hash eksak.
 */
export async function predictFromPastActions(userPrompt: string): Promise<{ action: string; args: any; confidence: number } | null> {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const keywords = extractKeywords(userPrompt);
    if (keywords.length === 0) return null;

    // Ambil 10 cached responses terbaru
    const { data, error } = await sb
      .from('response_cache')
      .select('prompt_text, response_type, response_data')
      .order('hit_count', { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0) return null;

    // Hitung kecocokan keyword antara prompt baru vs cache lama
    let bestMatch: any = null;
    let bestScore = 0;

    for (const cached of data) {
      const cachedKeywords = extractKeywords(cached.prompt_text || '');
      if (cachedKeywords.length === 0) continue;
      
      // Hitung overlap
      const overlap = keywords.filter(k => cachedKeywords.includes(k)).length;
      const score = overlap / Math.max(keywords.length, cachedKeywords.length);
      
      if (score > bestScore && score >= 0.5) { // Minimal 50% keyword cocok
        bestScore = score;
        bestMatch = cached;
      }
    }

    if (bestMatch && bestScore >= 0.5) {
      console.log(`[MEMORY] 🎯 Fuzzy prediction! Score: ${(bestScore * 100).toFixed(0)}% from cached prompt: "${bestMatch.prompt_text?.substring(0, 60)}..."`);
      return {
        action: bestMatch.response_data?.type || 'success',
        args: bestMatch.response_data,
        confidence: bestScore
      };
    }

    return null;
  } catch (e) {
    console.warn("[MEMORY] Fuzzy prediction error:", e);
    return null;
  }
}

// ==========================================
// LAPIS 2: MEMORI SEMANTIK (Pelajaran Jangka Panjang)
// ==========================================

/**
 * Simpan pelajaran/pengalaman baru ke memori semantik.
 */
export async function saveMemory(content: string, category: string = "general"): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  try {
    // Ekstrak kata kunci dari konten untuk pencarian
    const keywords = extractKeywords(content);
    
    await sb.from('memories').insert({
      content: content,
      keywords: keywords,
      category: category
    });

    console.log(`[MEMORY] New memory saved: "${content.substring(0, 80)}..." [${category}]`);
  } catch (e) {
    console.warn("[MEMORY] Memory save error:", e);
  }
}

/**
 * Cari pelajaran/pengalaman yang relevan berdasarkan prompt user.
 * Menggunakan full-text search PostgreSQL (tanpa butuh Embedding API).
 */
export async function searchRelevantMemories(userPrompt: string, limit: number = 3): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) return [];

  try {
    // Strategi 1: Cari berdasarkan kata kunci yang mirip
    const keywords = extractKeywords(userPrompt);
    
    if (keywords.length === 0) return [];

    // Cari memories yang mengandung kata kunci dari prompt
    const { data, error } = await sb
      .from('memories')
      .select('content, category')
      .or(keywords.map(kw => `keywords.ilike.%${kw}%`).join(','))
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data || data.length === 0) return [];

    console.log(`[MEMORY] Found ${data.length} relevant memories for prompt.`);
    return data.map((m: any) => `[${m.category}] ${m.content}`);
  } catch (e) {
    console.warn("[MEMORY] Memory search error:", e);
    return [];
  }
}

/**
 * Ekstrak kata kunci penting dari sebuah teks.
 * Pendekatan ringan tanpa perlu NLP library.
 */
function extractKeywords(text: string): string[] {
  const stopwords = new Set([
    "yang", "dan", "di", "ke", "dari", "ini", "itu", "dengan", "untuk",
    "pada", "adalah", "dalam", "akan", "sudah", "tidak", "juga", "atau",
    "saya", "anda", "dia", "mereka", "kita", "kami", "nya", "bisa",
    "ada", "buat", "bikin", "tolong", "dong", "ya", "nih", "gue", "lo",
    "the", "is", "a", "an", "to", "of", "and", "in", "for", "that",
    "mau", "sih", "kan", "lah", "pake", "pakai", "kayak", "bro",
    "coba", "gimana", "apa", "deh", "kalo", "kalau", "jadi", "jangan",
    "harus", "perlu", "boleh", "biar", "agar", "dokumen", "teks"
  ]);

  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopwords.has(w));

  // Ambil kata unik, max 8
  const unique = Array.from(new Set(words));
  return unique.slice(0, 8);
}

// ==========================================
// LAPIS 3: MESIN REFLEKSI (Post-Task Learning)
// ==========================================

/**
 * PILAR 2: Gist Extraction (Memori Konseptual)
 * Mengekstrak intisari interaksi dalam format JSON terstruktur,
 * bukan kalimat panjang yang boros storage.
 */
export function buildGistExtractionPrompt(conversationSummary: string): string {
  return `Anda baru saja menyelesaikan sebuah tugas di MS Word.
Berikut ringkasan percakapan yang terjadi:
---
${conversationSummary}
---

TUGAS: Ekstrak INTISARI dari interaksi di atas menjadi 1 objek JSON.
Format wajib:
{"intent": "jenis_tugas_singkat", "key_entities": ["entitas penting"], "tool_used": "nama_tool", "lesson": "1 kalimat pelajaran"}

CONTOH:
{"intent": "ganti_nama", "key_entities": ["Nanyan", "Nanang"], "tool_used": "replace_text", "lesson": "Nama karakter harus ditulis eksak sesuai permintaan user"}

HANYA keluarkan 1 objek JSON. Tidak perlu penjelasan.`;
}

// Backward compat alias
export const buildReflectionPrompt = buildGistExtractionPrompt;

/**
 * Ambil semua memori untuk ditampilkan (debugging/admin)
 */
export async function getAllMemories(): Promise<any[]> {
  const sb = getSupabase();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from('memories')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    return data || [];
  } catch (e) {
    return [];
  }
}
