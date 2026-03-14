import { NextResponse } from 'next/server';
import { makeOpenRouterChatRequest } from '@/lib/llm';
import { searchOpenAlex } from '@/lib/openalex';

const SYSTEM_PROMPT = `Anda adalah Spesialis Agen AI Otonom untuk Microsoft Word dengan Ketelitian Ekstra Tinggi (Exact Match Attention).
Tujuan Anda adalah membantu pengguna menulis, meneliti, atau mengedit dokumen Word mereka secara cerdas.

### DAFTAR ALAT (TOOLS) YANG TERSEDIA:
1. 'read_document': Membaca seluruh teks yang ada di dalam dokumen Word saat ini. WAJIB dipanggil jika Anda disuruh merevisi/mengganti/menghapus bagian tertentu dari dokumen tapi belum tahu isi pastinya.
   Format JSON: { "action": "read_document", "args": {} }

2. 'replace_text': MENGGANTI kalimat atau kata spesifik di dalam dokumen. 
   Gunakan alat ini untuk merombak/mengedit kalimat lama BUKAN dengan 'edit_document'.
   Format JSON: { "action": "replace_text", "args": { "old_text": "kalimat/kata persis yang ingin diganti (harus 100% sama kapitalisasinya)", "new_text": "kalimat/kata baru penggantinya" } }

3. 'delete_text': MENGHAPUS kalimat atau kata spesifik dari dokumen.
   Format JSON: { "action": "delete_text", "args": { "target_text": "kalimat persis yang ingin dihapus" } }

4. 'edit_document': MENAMBAHKAN teks baru murni di paling akhir (bawah) dokumen. JANGAN gunakan ini untuk merevisi.
   Format JSON: { "action": "edit_document", "args": { "text": "Teks baru yang ditambahkan ke bawah" } }

5. 'search_openalex': Mencari jurnal akademik di database.
   Format JSON: { "action": "search_openalex", "args": { "query": "kata kunci inggris" } }

6. 'finish': Selesai melakukan tugas dan mengirim pesan chat ke pengguna.
   Format JSON: { "action": "finish", "args": { "message": "Pesan ringkas balasan ke user" } }

### ATURAN SANGAT PENTING (BACA DENGAN TELITI):
1. Anda HANYA diperbolehkan membalas dengan 1 objek JSON tulen tanpa teks markdown \`\`\`json.
2. [ANTI HALUSINASI] Saat menggunakan 'replace_text', 'old_text' HARUS persis sama 100% (Literal Exact Match) dengan yang ada di hasil 'read_document'. Jangan menebak-nebak (misal di dokumen "Nanyan" jangan diubah jadi "Nanang").
3. Saat user meminta penggantian kata (contoh: "Ganti nama Nanyan menjadi Budi"), Anda TIDAK PERLU menulis ulang seluruh dokumen. Cukup panggil 1x alat 'replace_text' dengan \`old_text: "Nanyan"\` dan \`new_text: "Budi"\`.

Contoh Pemanggilan Valid:
{"action": "replace_text", "args": {"old_text": "Nanyan", "new_text": "Budi"}}`;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Messages array is required" }, { status: 400 });
    }

    // Suntikkan System Prompt ke awal percakapan
    const fullMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

    let loopCount = 0;
    const MAX_LOOPS = 5; // Batasan agar AI tidak infinite loop

    while(loopCount < MAX_LOOPS) {
       console.log(`[AGENT LOOP ${loopCount + 1}] Memanggil LLM...`);
       const llmResponse = await makeOpenRouterChatRequest(fullMessages);
       
       let actionObj;
       try {
          const cleanStr = llmResponse.replace(/```json/g, '').replace(/```/g, '').trim();
          actionObj = JSON.parse(cleanStr);
       } catch(e) {
          console.warn("[AGENT] Parsing JSON Gagal. Menyuruh LLM memperbaikinya...");
          fullMessages.push({ role: 'assistant', content: llmResponse });
          fullMessages.push({ role: 'user', content: 'SYSTEM ERROR: Respon Anda gagal di-parse. Anda HARUS membalas dengan objek JSON murni tanpa ada teks awalan/akhiran apa pun.' });
          loopCount++;
          continue;
       }

       const { action, args } = actionObj;
       console.log(`[AGENT] Keputusan LLM -> Action: ${action}`);

       // TOOL 1: FINISH (Langsung ke Chat User)
       if (action === "finish") {
          return NextResponse.json({ type: 'success', message: args.message });
       }

       // TOOL 2: SEARCH OPENALEX (Dieksekusi di Server)
       if (action === "search_openalex") {
          console.log(`[AGENT] Mengeksekusi pencarian OpenAlex untuk: ${args.query}`);
          const results = await searchOpenAlex(args.query, 3);
          
          fullMessages.push({ role: 'assistant', content: JSON.stringify(actionObj) });
          fullMessages.push({ role: 'user', content: `SYSTEM (TOOL RESULT - search_openalex):\n${JSON.stringify(results)}` });
          
          loopCount++;
          continue; // Lanjut loop untuk membiarkan AI berpikir langkah selanjutnya
       }

       // TOOL 3 & 4: READ/EDIT/REPLACE/DELETE DOCUMENT (Dieksekusi di Klien / Webview Word)
       if (["read_document", "edit_document", "replace_text", "delete_text"].includes(action)) {
          console.log(`[AGENT] Meminta klien (Word) untuk mengeksekusi tool: ${action} dengan args:`, args);
          // Kami mengembalikan kontrol (yield) ke klien Next.js UI agar dia menjalankan Office.js
          return NextResponse.json({ 
              type: 'action_required', 
              tool: action, 
              args: args, 
              assistantLogs: JSON.stringify(actionObj) 
          });
       }
       
       // Fallback untuk action ngawur
       fullMessages.push({ role: 'assistant', content: JSON.stringify(actionObj) });
       fullMessages.push({ role: 'user', content: `SYSTEM ERROR: Action '${action}' tidak dikenal. Harap gunakan nama alat yang valid.` });
       loopCount++;
    }

    return NextResponse.json({ type: 'success', message: "Maaf, daya komputasi agen habis sebelum tugas selesai (Mencapai batas maksimum siklus kognitif)." });

  } catch (error: any) {
    console.error("Agent Workflow Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
