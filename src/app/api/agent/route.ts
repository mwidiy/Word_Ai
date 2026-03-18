import { NextResponse } from 'next/server';
import { makeOpenRouterChatRequest, makeOpenRouterRequest } from '@/lib/llm';
import { searchOpenAlex } from '@/lib/openalex';
import { 
  getCachedResponse, cacheResponse, 
  searchRelevantMemories, saveMemory, 
  predictFromPastActions,
  buildReflectionPrompt 
} from '@/lib/memory';
import { classifyIntent } from '@/lib/router';
import { profileUser } from '@/lib/profiler';

const SYSTEM_PROMPT = `Anda adalah Asisten AI untuk Microsoft Word. Tugas Anda adalah membantu pengguna menulis, meneliti, atau mengedit dokumen Word mereka.

### DAFTAR ALAT (TOOLS) YANG TERSEDIA:

[1. NAVIGASI DOKUMEN]
- 'read_document_outline': Membaca daftar isi/kerangka dokumen (heading saja).
  Format JSON: { "action": "read_document_outline", "args": {} }

- 'search_keyword_in_doc': Mencari kata kunci di dalam dokumen.
  Format JSON: { "action": "search_keyword_in_doc", "args": { "keyword": "kata" } }

- 'read_document': Membaca keseluruhan teks dokumen.
  Format JSON: { "action": "read_document", "args": {} }

[2. MENULIS & MENGEDIT]
- 'edit_document': Menambahkan teks baru ke dokumen.
  Format JSON: { "action": "edit_document", "args": { "text": "# Judul BAB\n\nParagraf teks...", "location": "BeforeBibliography" } }
  - Argument 'location': opsional. Nilai: "End" (default) atau "BeforeBibliography" (sangat disarankan jika menulis isi bab skripsi agar tidak nulis di bawah Daftar Pustaka).

- 'replace_text': Mengganti kata/kalimat spesifik di dokumen. MENDUKUNG format Markdown.
  Format JSON: { "action": "replace_text", "args": { "old_text": "kalimat lama", "new_text": "**Kalimat baru dengan format**" } }

- 'delete_text': Menghapus kalimat spesifik dari dokumen.
  Format JSON: { "action": "delete_text", "args": { "target_text": "kalimat untuk dihapus" } }

- 'replace_section_content': MENGGANTI SELURUH ISI sebuah bagian/sub-bab dengan konten baru yang terformat.
  Gunakan ini untuk perbaikan detail (misal: "Perbanyak Latar Belakang"). Agen akan menghapus isi lama dan menyuntikkan isi baru terformat di posisi yang sama.
  Format JSON: { "action": "replace_section_content", "args": { "heading": "1.1 Latar Belakang", "content": "Paragraf baru yang panjang..." } }

[3. RUMUS & PUSTAKA]
- 'insert_equation': Menyisipkan rumus matematika (notasi LaTeX).
  Format JSON: { "action": "insert_equation", "args": { "latex": "E = mc^2", "label": "(2.1)" } }

- 'append_bibliography': Menambahkan Daftar Pustaka di akhir dokumen (APA Style).
  Format JSON: { "action": "append_bibliography", "args": { "references": ["Penulis, A. (2024). Judul. Jurnal, 1(1), 1-10."] } }

[4. SKRIP KUSTOM]
- 'execute_office_js': Menulis kode JavaScript Office.js untuk format Word yang kompleks (tabel, warna, dll).
  Format JSON: { "action": "execute_office_js", "args": { "script": "const table = body.insertTable(3,3, 'End'); table.values = [['A','B','C']]; await context.sync();" } }
  ATURAN: Gunakan \`body\` (sudah tersedia). JANGAN gunakan \`table.rows.getItem()\` atau \`table.getCell()\`. Gunakan \`table.values = [[...]]\` untuk mengisi tabel.

[5. LAINNYA]
- 'search_openalex': Mencari referensi jurnal di OpenAlex.
  Format JSON: { "action": "search_openalex", "args": { "query": "kata kunci" } }
- 'finish': Selesai.
  Format JSON: { "action": "finish", "args": { "message": "Pesan untuk user" } }

### ATURAN REASONING (PENTING!):
1. **Dilarang Loop**: Jika Anda sudah memanggil 'search_keyword_in_doc' dan hasilnya menunjukkan kata kunci ditemukan, JANGAN panggil search lagi. Lanjutkan ke langkah berikutnya (misal: read_document atau replace_section_content).
2. **Surgical Update**: Jika user minta "perbanyak", "revisi", atau "tulis ulang" sebuah bagian (seperti Latar Belakang), gunakan 'replace_section_content'. JANGAN gunakan 'edit_document' karena itu akan menumpuk teks di paling bawah dokumen.
3. **Konfirmasi Langkah**: Selalu panggil 'read_document_outline' di awal tugas besar agar Anda tahu struktur dokumen yang sebenarnya sebelum melakukan perubahan.
4. **Citation Awareness**: Jika user minta "berikan sitasi", Anda HARUS menyisipkan teks kutipan (misal: Smith, 2024) di dalam narasi DAN memanggil tool 'append_bibliography' untuk memperbarui daftar pustaka.
5. **Tidying Initiative**: Jika user minta "rapikan", Anda harus proaktif menggunakan 'read_document' untuk memeriksa konsistensi font dan heading, lalu gunakan tool yang sesuai untuk memperbaikinya.

Contoh:
- User: "Bikin pendahuluan bebek lengkap dengan sitasinya."
- Agent Action: 'edit_document' (isi teks) -> 'search_openalex' (cari jurnal) -> 'append_bibliography' (tambah ke daftar pustaka) -> 'finish'.`;


export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Messages array is required" }, { status: 400 });
    }

    // Ambil prompt user terakhir (Abaikan hasil tool/system yang masuk sebagai role user)
    const lastUserMsg = [...messages].reverse().find((m: any) => 
      m.role === 'user' && !m.content.includes("SYSTEM_TOOL_RESULT")
    );
    const userPrompt = lastUserMsg?.content || "";

    // ================================================================
    // PILAR 4: PROFILING USER (Theory of Mind)
    // ================================================================
    const userProfile = profileUser(userPrompt);
    if (userProfile.promptInjection) {
      console.log(`[BRAIN] 🧠 Profil User: urgency=${userProfile.urgency}, frustration=${userProfile.frustration}, formality=${userProfile.formality}`);
    }

    // ================================================================
    // PILAR 3: INTENT ROUTER (System 1 vs System 2)
    // ================================================================
    const routerResult = classifyIntent(userPrompt);
    console.log(`[BRAIN] 🚦 Router: ${routerResult.classification}`);

    // SYSTEM 1 — Basa-basi (0 API Call)
    if (routerResult.classification === "basa_basi" && routerResult.directResponse) {
      console.log(`[BRAIN] ⚡ System 1: Basa-basi terjawab tanpa API!`);
      return NextResponse.json({ type: 'success', message: routerResult.directResponse });
    }

    // SYSTEM 1 — Pola Familiar (0 API Call, langsung eksekusi tool)
    if (routerResult.classification === "pola_familiar" && routerResult.predictedAction) {
      const { action, args, confidence } = routerResult.predictedAction;
      console.log(`[BRAIN] ⚡ System 1: Pola familiar terdeteksi! Action=${action}, Confidence=${(confidence * 100).toFixed(0)}%`);
      
      // Hanya untuk aksi edit final yang tidak butuh lanjut 'Thinking'
      const uiActions = ["replace_text", "delete_text"];
      if (uiActions.includes(action)) {
        return NextResponse.json({
          type: 'action_required',
          tool: action,
          args: args,
          assistantLogs: JSON.stringify({ action, args }),
          predicted: true // Flag bahwa ini hasil prediksi, bukan LLM
        });
      }
    }

    // ================================================================
    // LAPIS 1: CEK CACHE EKSAK (0 API Call)
    // ================================================================
    console.log(`[BRAIN] Lapis 1: Mengecek cache eksak...`);
    const cachedResult = await getCachedResponse(userPrompt);
    if (cachedResult) {
      console.log(`[BRAIN] ⚡ CACHE HIT! Menjawab tanpa API call.`);
      return NextResponse.json(cachedResult.data);
    }

    // ================================================================
    // PILAR 1: FUZZY PREDICTION (Cek pola serupa di cache)
    // ================================================================
    console.log(`[BRAIN] Pilar 1: Mencari prediksi fuzzy dari pengalaman...`);
    const fuzzyPrediction = await predictFromPastActions(userPrompt);
    if (fuzzyPrediction && fuzzyPrediction.confidence >= 0.7) {
      console.log(`[BRAIN] 🎯 Fuzzy match cukup kuat (${(fuzzyPrediction.confidence * 100).toFixed(0)}%). Menggunakan respons cached!`);
      return NextResponse.json(fuzzyPrediction.args);
    }

    // ================================================================
    // LAPIS 2: SUNTIKKAN MEMORI SEMANTIK (Pelajaran Masa Lalu)
    // ================================================================
    console.log(`[BRAIN] Lapis 2: Mencari memori relevan di Supabase...`);
    const relevantMemories = await searchRelevantMemories(userPrompt);
    
    let memoryInjection = "";
    if (relevantMemories.length > 0) {
      memoryInjection = `\n\n### PELAJARAN DARI PENGALAMAN MASA LALU (INGAT INI!):\n${relevantMemories.map((m, i) => `${i+1}. ${m}`).join('\n')}`;
      console.log(`[BRAIN] ✅ ${relevantMemories.length} memori relevan ditemukan.`);
    }

    // ================================================================
    // LAPIS 3: FULL REACT LOOP (System 2 — Deep Think)
    // ================================================================
    console.log(`[BRAIN] 🧠 System 2: Full ReAct Loop dimulai...`);
    
    // Gabungkan: System Prompt + Memori + Profil Emosional
    const systemWithContext = SYSTEM_PROMPT + memoryInjection + userProfile.promptInjection;
    const fullMessages = [{ role: 'system', content: systemWithContext }, ...messages];

    let loopCount = 0;
    const MAX_LOOPS = 10;
    const conversationLog: string[] = [`User: ${userPrompt}`];

    while(loopCount < MAX_LOOPS) {
       console.log(`[AGENT LOOP ${loopCount + 1}] Memanggil LLM...`);
       const llmResponse = await makeOpenRouterChatRequest(fullMessages);
       
       let actionObj;
       try {
          // Robust JSON extraction: Look for the first '{' and the last '}'
          const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON object found.");
          const cleanStr = jsonMatch[0];
          actionObj = JSON.parse(cleanStr);
       } catch(e) {
          console.warn("[AGENT] Parsing JSON Gagal. Menyuruh LLM memperbaikinya...");
          fullMessages.push({ role: 'assistant', content: llmResponse });
          fullMessages.push({ role: 'user', content: 'SYSTEM ERROR: Respon Anda gagal di-parse. Pastikan Anda hanya membalas dengan objek JSON murni.' });
          loopCount++;
          continue;
       }

       const { action, args } = actionObj;
       console.log(`[AGENT] Keputusan LLM -> Action: ${action}`);
       conversationLog.push(`Agent Action: ${action} | Args: ${JSON.stringify(args).substring(0, 200)}`);

       // TOOL 1: FINISH (+ Refleksi + Cache + Gist)
       if (action === "finish") {
          const responsePayload = { type: 'success', message: args.message };
          
          // POST-TASK: Refleksi + Cache + Gist (fire-and-forget)
          (async () => {
            try {
              await cacheResponse(userPrompt, 'success', responsePayload);
              
              conversationLog.push(`Agent Final: ${args.message}`);
              const gistPrompt = buildReflectionPrompt(conversationLog.join('\n'));
              const gistRaw = await makeOpenRouterRequest(gistPrompt, "Refleksikan tugas ini.");
              
              if (gistRaw && gistRaw.length > 5 && gistRaw.length < 500) {
                // Coba parse sebagai JSON (Pilar 2: Gist)
                let lesson = gistRaw.replace(/```json/g, '').replace(/```/g, '').trim();
                try {
                  const gist = JSON.parse(lesson);
                  lesson = gist.lesson || lesson;
                  // Simpan dengan kategori dari gist
                  await saveMemory(lesson, gist.intent || "general");
                } catch {
                  // Fallback: simpan sebagai teks biasa
                  let category = "general";
                  if (conversationLog.some(l => l.includes("replace_text"))) category = "editing";
                  if (conversationLog.some(l => l.includes("edit_document"))) category = "writing";
                  if (conversationLog.some(l => l.includes("execute_office_js"))) category = "formatting";
                  if (conversationLog.some(l => l.includes("search_openalex"))) category = "research";
                  await saveMemory(lesson.replace(/"/g, ''), category);
                }
                console.log(`[BRAIN] 🧠 Gist tersimpan: "${lesson.substring(0, 80)}..."`);
              }
            } catch (reflErr) {
              console.warn("[BRAIN] Refleksi gagal (non-blocking):", reflErr);
            }
          })();
          
          return NextResponse.json(responsePayload);
       }

       // TOOL 2: SEARCH OPENALEX
       if (action === "search_openalex") {
          const results = await searchOpenAlex(args.query, 3);
          fullMessages.push({ role: 'assistant', content: JSON.stringify(actionObj) });
          fullMessages.push({ role: 'user', content: `SYSTEM (TOOL RESULT - search_openalex):\n${JSON.stringify(results)}` });
          loopCount++;
          continue;
       }

       // TOOLS CLIENT-SIDE (Office.js)
       const uiActionList = [
         "read_document", "read_document_outline", "search_keyword_in_doc",
         "edit_document", "replace_text", "delete_text", "replace_section_content",
         "execute_office_js", "insert_equation", "append_bibliography"
       ];

       if (uiActionList.includes(action)) {
          return NextResponse.json({ 
              type: 'action_required', 
              tool: action, 
              args: args, 
              assistantLogs: JSON.stringify(actionObj) 
          });
       }
       
       fullMessages.push({ role: 'assistant', content: JSON.stringify(actionObj) });
       fullMessages.push({ role: 'user', content: `SYSTEM ERROR: Action '${action}' tidak dikenal.` });
       loopCount++;
    }

    return NextResponse.json({ type: 'success', message: "Maaf, daya komputasi agen habis (limit siklus kognitif tercapai)." });

  } catch (error: any) {
    console.error("Agent Workflow Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
