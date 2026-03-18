/**
 * PILAR 4: User Profiler (Theory of Mind)
 * 
 * Membaca sinyal emosional/kontekstual dari prompt user.
 * Tujuan: Agen merespons lebih manusiawi — hati-hati saat user frustrasi,
 * agresif saat user urgent, formal saat user formal.
 */

export interface UserProfile {
  urgency: "low" | "medium" | "high";
  frustration: "none" | "mild" | "high";
  formality: "casual" | "neutral" | "formal";
  // Instruksi tambahan yang disuntikkan ke System Prompt
  promptInjection: string;
}

/**
 * Profiling user dari satu prompt. Tanpa LLM (heuristik murni).
 */
export function profileUser(prompt: string): UserProfile {
  const result: UserProfile = {
    urgency: "medium",
    frustration: "none",
    formality: "neutral",
    promptInjection: "",
  };

  // ========== URGENCY ==========
  const urgencySignals = {
    high: /(!{2,}|TOLONG|SEGERA|URGENT|CEPAT|BURUAN|ASAP|sekarang\s*juga)/i,
    low: /^(halo|hai|hey|coba|mungkin|kalau\s*bisa|boleh\s*nggak)/i,
  };

  if (urgencySignals.high.test(prompt)) {
    result.urgency = "high";
  } else if (urgencySignals.low.test(prompt)) {
    result.urgency = "low";
  }

  // ========== FRUSTRATION ==========
  const frustrationSignals = {
    high: /(kenapa\s*(masih|lagi)|kok\s*(salah|error|gagal)|error\s*lagi|masih\s*(error|salah|bug)|nggak\s*bisa|ga\s*bisa|ngaco|bego|bodoh|tolol)/i,
    mild: /(salah|error|gagal|rusak|berantakan|aneh|typo)/i,
  };

  if (frustrationSignals.high.test(prompt)) {
    result.frustration = "high";
  } else if (frustrationSignals.mild.test(prompt)) {
    result.frustration = "mild";
  }

  // ========== FORMALITY ==========
  const casualSignals = /(gue|lo|bro|cuy|dong|nih|sih|banget|mantap|gokil|anjir|wkwk)/i;
  const formalSignals = /(mohon|saya|Anda|harap|berkenan|terima kasih|dengan hormat)/i;

  if (casualSignals.test(prompt)) {
    result.formality = "casual";
  } else if (formalSignals.test(prompt)) {
    result.formality = "formal";
  }

  // ========== PROMPT INJECTION ==========
  const injections: string[] = [];

  if (result.frustration === "high") {
    injections.push("⚠️ USER SEDANG FRUSTRASI. Periksa dokumen EKSTRA HATI-HATI sebelum bertindak. Jangan buat kesalahan lagi. Minta maaf jika perlu.");
  } else if (result.frustration === "mild") {
    injections.push("User mengindikasikan ada masalah. Pastikan membaca dokumen dulu sebelum melakukan perubahan.");
  }

  if (result.urgency === "high") {
    injections.push("User butuh respons CEPAT. Langsung eksekusi tanpa banyak penjelasan. Skip basa-basi.");
  }

  if (result.formality === "casual") {
    injections.push("User berkomunikasi santai. Boleh pakai bahasa santai juga di pesan finish. Tapi tetap profesional dalam aksi.");
  } else if (result.formality === "formal") {
    injections.push("User berkomunikasi formal. Balas dengan bahasa Indonesia baku dan sopan.");
  }

  result.promptInjection = injections.length > 0
    ? `\n\n### PROFIL EMOSIONAL USER SAAT INI:\n${injections.join('\n')}`
    : "";

  return result;
}
