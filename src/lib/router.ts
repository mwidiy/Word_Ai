/**
 * PILAR 3: Intent Router (System 1 vs System 2)
 * 
 * Mengklasifikasi prompt user TANPA LLM (regex + pattern matching).
 * Tujuan: Memotong 40%+ API calls untuk tugas remeh atau pola familiar.
 */

// ==========================================
// POLA BASA-BASI (0 API Call, Jawab Langsung)
// ==========================================
const GREETINGS_PATTERNS = [
  /^(hai|halo|hello|hi|hey|selamat\s*(pagi|siang|sore|malam))\s*[.!]?$/i,
  /^(terima\s*kasih|makasih|thanks|thank\s*you|thx|ok|oke|sip|mantap|good|nice)\s*[.!]*$/i,
  /^(bye|dadah|sampai\s*jumpa)\s*[.!]*$/i,
];

const GREETING_RESPONSES: Record<string, string> = {
  greeting: "Halo! Ada yang bisa saya bantu untuk dokumen Word Anda? 😊",
  thanks: "Sama-sama! Senang bisa membantu. Ada lagi yang perlu dikerjakan? 📝",
  bye: "Sampai jumpa! Semoga dokumennya lancar jaya! 👋",
};

// ==========================================
// POLA AKSI FAMILIAR (Prediksi tanpa LLM)
// ==========================================
interface PredictedAction {
  action: string;
  args: Record<string, any>;
  confidence: number; // 0-1
}

const INTENT_PATTERNS: Array<{
  pattern: RegExp;
  extract: (match: RegExpMatchArray) => PredictedAction;
}> = [
  // "Ganti X jadi Y" / "Ubah X menjadi Y" / "Replace X with Y"
  {
    pattern: /(?:ganti|ubah|replace|tukar)\s+(?:kata\s+|nama\s+|teks\s+)?["']?(.+?)["']?\s+(?:jadi|menjadi|ke|with|sama|dgn)\s+["']?(.+?)["']?\s*$/i,
    extract: (m) => ({
      action: "replace_text",
      args: { old_text: m[1].trim(), new_text: m[2].trim() },
      confidence: 0.9,
    }),
  },
  // "Hapus kata/kalimat X"
  {
    pattern: /(?:hapus|delete|hilangkan|buang)\s+(?:kata\s+|kalimat\s+|teks\s+)?["']?(.+?)["']?\s*$/i,
    extract: (m) => ({
      action: "delete_text",
      args: { target_text: m[1].trim() },
      confidence: 0.85,
    }),
  },
  // "Cari kata X" / "Temukan X"
  {
    pattern: /(?:cari|temukan|find|search)\s+(?:kata\s+|kalimat\s+)?["']?(.+?)["']?\s*$/i,
    extract: (m) => ({
      action: "search_keyword_in_doc",
      args: { keyword: m[1].trim() },
      confidence: 0.9,
    }),
  },
  // "Baca dokumen" / "Lihat isi dokumen"
  {
    pattern: /(?:baca|lihat|tampilkan|show)\s+(?:isi\s+)?(?:dokumen|document|teks)/i,
    extract: () => ({
      action: "read_document",
      args: {},
      confidence: 0.95,
    }),
  },
];

// ==========================================
// KLASIFIKASI UTAMA
// ==========================================
export type IntentClass = "basa_basi" | "pola_familiar" | "tugas_sedang" | "tugas_berat";

export interface RouterResult {
  classification: IntentClass;
  // Untuk basa-basi: respons langsung
  directResponse?: string;
  // Untuk pola familiar: aksi yang diprediksi
  predictedAction?: PredictedAction;
}

/**
 * Klasifikasi prompt user tanpa memanggil LLM.
 * Return classification + data pendukung.
 */
export function classifyIntent(prompt: string): RouterResult {
  const cleaned = prompt.trim();

  // 1. Cek Basa-basi
  for (const pattern of GREETINGS_PATTERNS) {
    if (pattern.test(cleaned)) {
      // Deteksi sub-tipe
      if (/terima|makasih|thanks|thx/i.test(cleaned)) {
        return { classification: "basa_basi", directResponse: GREETING_RESPONSES.thanks };
      }
      if (/bye|dadah|sampai/i.test(cleaned)) {
        return { classification: "basa_basi", directResponse: GREETING_RESPONSES.bye };
      }
      return { classification: "basa_basi", directResponse: GREETING_RESPONSES.greeting };
    }
  }

  // 2. Cek Pola Familiar
  for (const { pattern, extract } of INTENT_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match) {
      const predicted = extract(match);
      if (predicted.confidence >= 0.8) {
        return { classification: "pola_familiar", predictedAction: predicted };
      }
    }
  }

  // 3. Heuristik: Tugas Berat vs Sedang
  const heavyKeywords = /riset|jurnal|openalex|penelitian|skripsi|daftar\s*pustaka|sitasi|citation|bab\s+\d/i;
  if (heavyKeywords.test(cleaned)) {
    return { classification: "tugas_berat" };
  }

  // Default: Tugas Sedang (LLM biasa)
  return { classification: "tugas_sedang" };
}
