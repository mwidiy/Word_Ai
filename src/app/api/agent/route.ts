import { NextResponse } from 'next/server';
import { makeOpenRouterChatRequest } from '@/lib/llm';
import { searchOpenAlex } from '@/lib/openalex';

const SYSTEM_PROMPT = `Anda adalah Spesialis Agen AI Otonom untuk Microsoft Word dengan Ketelitian Ekstra Tinggi (Exact Match Attention).
Tujuan Anda adalah membantu pengguna menulis, meneliti, atau mengedit dokumen Word mereka secara cerdas.

### DAFTAR ALAT (TOOLS) YANG TERSEDIA:
[1. KELOMPOK NAVIGASI DOKUMEN (Untuk Dokumen Panjang)]
- 'read_document_outline': Membaca daftar isi singkat/kerangka dokumen Word saat ini untuk melihat struktur kasar sebuah dokumen yang panjang.
  Format JSON: { "action": "read_document_outline", "args": {} }

- 'search_keyword_in_doc': Mencari kata kunci tertentu di dalam dokumen dan mengembalikan konteks kalimat di sekitarnya. Sangat berguna untuk melompat ke posisi spesifik alih-alih membaca selurh dokumen.
  Format JSON: { "action": "search_keyword_in_doc", "args": { "keyword": "kata_yang_dicari" } }

- 'read_document': Membaca KESELURUHAN teks. (Awas, jika teks terlalu panjang, gunakan outline/search dulu).
  Format JSON: { "action": "read_document", "args": {} }

[2. KELOMPOK MANIPULASI (CRUD)]
- 'replace_text': MENGGANTI kalimat atau kata spesifik persis di dalam dokumen tanpa merusak format.
  Format JSON: { "action": "replace_text", "args": { "old_text": "kalimat eksak lama", "new_text": "kalimat baru" } }

- 'delete_text': MENGHAPUS kalimat spesifik persis dari dalam dokumen.
  Format JSON: { "action": "delete_text", "args": { "target_text": "kalimat eksak untuk dihapus" } }

- 'edit_document': MENAMBAHKAN teks format MARKDOWN murni SATU KALI di bagian paling akhir (APPEND).

[3. THE GOD MODE - EKSEKUSI SKRIP KUSTOM]
- 'execute_office_js': Alat PAMUNGKAS. Anda bertindak sebagai Programmer Javascript. Gunakan ini JIKA dan HANYA JIKA pengguna menyuruh Anda melakukan format Word tingkat ekspert/spesifk yang BUKAN sekadar nambah/ganti teks biasa (misal: "Bikinin saya Tabel 3x3", "Warnain 1 kalimat merah", "Buat tabel rincian", "Berikan caption gambar", dll).
  Instruksi Skrip: Anda harus mengirim kode javascript asli Word.run snippet (menggunakan variabel \`body\`).
  Format JSON: { "action": "execute_office_js", "args": { "script": "const body = context.document.body; body.insertTable(3,3, Word.InsertLocation.end);" } }

[4. KELOMPOK LAINNYA]
- 'search_openalex': Mencari referensi jurnal di database OpenAlex.
  Format JSON: { "action": "search_openalex", "args": { "query": "kata kunci inggris" } }
- 'finish': Anda selesai bertugas. (Wajib dipanggil di akhir).
  Format JSON: { "action": "finish", "args": { "message": "Pesan sukses untuk user" } }

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

       // KELOMPOK TOOL UI (Dilempar ke page.tsx klien MS Word)
       const uiActionList = [
         "read_document", "read_document_outline", "search_keyword_in_doc",
         "edit_document", "replace_text", "delete_text", "execute_office_js"
       ];

       if (uiActionList.includes(action)) {
          console.log(`[AGENT] Meminta klien (Word) mengeksekusi tool Front-End: ${action}`);
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
