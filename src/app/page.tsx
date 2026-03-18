"use client";

import { useState, useRef, useEffect } from "react";
import { markdownToSkripsiHtml, buildEquationHtml, buildBibliographyHtml } from "@/lib/skripsi-formatter";

// Tipe data pesan
type Message = {
  id: string;
  role: "user" | "agent";
  content: string;
  isWritingInfo?: boolean;
};

// Polyfill history API for Office Add-in Environment
if (typeof window !== "undefined") {
  if (!window.history) {
    (window as any).history = {};
  }
  if (!window.history.replaceState) {
    window.history.replaceState = function () {};
  }
  if (!window.history.pushState) {
    window.history.pushState = function () {};
  }
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "agent",
      content: "Hi! I am your AI Agent for Microsoft Word. What needs to be written or formatted today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOfficeReady, setIsOfficeReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.Office) {
      window.Office.onReady(() => {
        setIsOfficeReady(true);
      });
    } else {
      setIsOfficeReady(true); 
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const [apiHistory, setApiHistory] = useState<any[]>([]);

  const callAgent = async (currentHistory: any[]) => {
    try {
      const res = await fetch("/api/agent?action=chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: currentHistory }),
      });

      const data = await res.json();

      if (data.type === 'success') {
        setMessages((prev) => [
          ...prev, 
          { id: Date.now().toString(), role: "agent", content: data.message }
        ]);
        setApiHistory([
            ...currentHistory, 
            { role: 'assistant', content: JSON.stringify({ action: 'finish', args: { message: data.message } }) }
        ]);
        setIsLoading(false);
        
      } else if (data.type === 'action_required') {
        const { tool, args, assistantLogs } = data;
        const isPredicted = data.predicted === true;
        let toolResult = "";

        // =====================================================
        // TOOL: read_document
        // =====================================================
        if (tool === 'read_document') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "👀 *Membaca isi dokumen Anda...*", isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             try {
               await window.Word.run(async (context: any) => {
                 const body = context.document.body;
                 body.load("text");
                 await context.sync();
                 toolResult = body.text || "[Dokumen Kosong]";
               });
             } catch (e: any) {
               toolResult = `ERROR Word API: ${e.message}`;
             }
           } else {
             toolResult = "[Dev Mode: Office.js tidak ditemukan]";
           }

        // =====================================================
        // TOOL: edit_document (SIMPLE — always append to End)
        // =====================================================
        } else if (tool === 'edit_document') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "✍️ *Menambahkan teks baru ke dokumen...*", isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             try {
               await window.Word.run(async (context: any) => {
                 const body = context.document.body;
                 const markdownInput = args.text || args.content || "";
                 const location = args.location || "End";

                 if (!markdownInput) {
                   toolResult = "ERROR: Input teks kosong.";
                   return;
                 }
                 const htmlString = markdownToSkripsiHtml(markdownInput);

                 if (location === "BeforeBibliography") {
                   const paragraphs = body.paragraphs;
                   context.load(paragraphs, 'text');
                   await context.sync();

                   let bibPara = null;
                   for (let i = 0; i < paragraphs.items.length; i++) {
                     const txt = paragraphs.items[i].text.toUpperCase();
                     if (txt.includes("DAFTAR PUSTAKA") || txt.includes("REFERENCE") || txt.includes("BIBLIOGRAPHY")) {
                       bibPara = paragraphs.items[i];
                       break;
                     }
                   }

                   if (bibPara) {
                     bibPara.insertHtml(htmlString, "Before");
                     toolResult = "SUCCESS: Teks ditambahkan SEBELUM Daftar Pustaka.";
                   } else {
                     body.insertHtml(htmlString, "End");
                     toolResult = "SUCCESS: Daftar Pustaka tidak ditemukan, teks ditambahkan di AKHIR dokumen.";
                   }
                 } else {
                   body.insertHtml(htmlString, "End");
                   toolResult = "SUCCESS: Teks baru berhasil ditambahkan ke AKHIR dokumen.";
                 }
                 await context.sync();
               });
             } catch (e: any) {
               toolResult = `ERROR Word API (edit_document): ${e.message}`;
             }
           } else {
             toolResult = "SUCCESS (Simulated)";
           }

        // =====================================================
        // TOOL: replace_text
        // =====================================================
        } else if (tool === 'replace_text') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "🔄 *Mengganti teks spesifik di dokumen...*", isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             try {
               await window.Word.run(async (context: any) => {
                 const searchResults = context.document.body.search(args.old_text, { matchCase: true });
                 context.load(searchResults, 'text');
                 await context.sync();
                 
                 if (searchResults.items.length === 0) {
                   toolResult = `ERROR: Teks '${args.old_text}' tidak ditemukan persis di dokumen.`;
                 } else {
                   const isRichText = args.new_text && (args.new_text.includes("\n") || args.new_text.includes("#") || args.new_text.includes("*"));
                   
                   for (let i = 0; i < searchResults.items.length; i++) {
                     if (isRichText) {
                       const richHtml = markdownToSkripsiHtml(args.new_text);
                       searchResults.items[i].insertHtml(richHtml, "Replace");
                     } else {
                       // Gunakan insertHtml untuk teks pendek sekalipun agar font TNR tetap terjaga
                       const plainHtml = markdownToSkripsiHtml(args.new_text || "");
                       searchResults.items[i].insertHtml(plainHtml, "Replace");
                     }
                   }
                   await context.sync();
                   toolResult = `SUCCESS: Berhasil mengganti ${searchResults.items.length} kemunculan dari '${args.old_text}' dengan format skripsi.`;
                 }
               });
             } catch (e: any) {
               toolResult = `ERROR Word API (replace_text): ${e.message}`;
             }
           } else {
             toolResult = "SUCCESS (Simulated Replace)";
           }

        // =====================================================
        // TOOL: delete_text
        // =====================================================
        } else if (tool === 'delete_text') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "🗑️ *Menghapus teks spesifik di dokumen...*", isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             try {
               await window.Word.run(async (context: any) => {
                 const searchResults = context.document.body.search(args.target_text, { matchCase: true });
                 context.load(searchResults, 'text');
                 await context.sync();
                 
                 if (searchResults.items.length === 0) {
                   toolResult = `ERROR: Teks '${args.target_text}' tidak ditemukan.`;
                 } else {
                   for (let i = 0; i < searchResults.items.length; i++) {
                     searchResults.items[i].clear();
                   }
                   await context.sync();
                   toolResult = `SUCCESS: Berhasil menghapus ${searchResults.items.length} kemunculan.`;
                 }
               });
             } catch (e: any) {
               toolResult = `ERROR Word API (delete_text): ${e.message}`;
             }
           } else {
             toolResult = "SUCCESS (Simulated Delete)";
           }

        // =====================================================
        // TOOL: read_document_outline
        // =====================================================
        } else if (tool === 'read_document_outline') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "📑 *Membaca daftar isi dokumen Anda...*", isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             try {
               await window.Word.run(async (context: any) => {
                 const paragraphs = context.document.body.paragraphs;
                 context.load(paragraphs, 'style, text');
                 await context.sync();
                 
                 let outline = "";
                 paragraphs.items.forEach((p: any) => {
                   if (p.style && p.style.includes("Heading")) {
                     outline += `- [${p.style}] ${p.text}\n`;
                   }
                 });
                 toolResult = outline || "[Dokumen tidak memiliki heading. Gunakan read_document.]";
               });
             } catch (e: any) {
               toolResult = `ERROR Word API (read_outline): ${e.message}`;
             }
           } else {
             toolResult = "[Simulated Outline]";
           }
           
        // =====================================================
        // TOOL: search_keyword_in_doc
        // =====================================================
        } else if (tool === 'search_keyword_in_doc') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: `🔍 *Mencari kata '${args.keyword}'...*`, isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             try {
               await window.Word.run(async (context: any) => {
                 const searchResults = context.document.body.search(args.keyword, { matchCase: false });
                 context.load(searchResults, 'text');
                 await context.sync();
                 
                 if (searchResults.items.length === 0) {
                   toolResult = `Kata '${args.keyword}' tidak ditemukan di dokumen.`;
                 } else {
                   toolResult = `Ditemukan ${searchResults.items.length} kemunculan kata '${args.keyword}'.`;
                 }
               });
             } catch (e: any) {
               toolResult = `ERROR Word API (search): ${e.message}`;
             }
           } else {
             toolResult = "[Simulated Search]";
           }

        // =====================================================
        // TOOL: execute_office_js (God Mode)
        // =====================================================
        } else if (tool === 'execute_office_js') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "⚡ *Mengeksekusi skrip dinamis...*", isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             try {
                await window.Word.run(async (context: any) => {
                   const body = context.document.body;
                   const Word = window.Word;
                   const scriptFn = new Function('context', 'body', 'Word', `
                     return (async () => { ${args.script} })();
                   `);
                   await scriptFn(context, body, Word);
                   await context.sync();
                });
                toolResult = "SUCCESS: Skrip Office.js berhasil dieksekusi.";
             } catch (e: any) {
                console.error("Execute Script Error:", e);
                toolResult = `ERROR Eksekusi Skrip: ${e.message}. Perbaiki sintaks Office.js Anda.`;
             }
           } else {
             toolResult = "[Simulated Script Exec]";
           }

        // =====================================================
        // TOOL: insert_equation
        // =====================================================
        } else if (tool === 'insert_equation') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: `📐 *Menyisipkan rumus: ${args.latex}...*`, isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             try {
               await window.Word.run(async (context: any) => {
                 const body = context.document.body;
                 const equationHtml = buildEquationHtml(args.latex, args.label || "");
                 body.insertHtml(equationHtml, "End");
                 await context.sync();
                 toolResult = `SUCCESS: Rumus '${args.latex}' berhasil disisipkan.`;
               });
             } catch (e: any) {
               toolResult = `ERROR Word API (equation): ${e.message}`;
             }
           } else {
             toolResult = "SUCCESS (Simulated Equation)";
           }

        // =====================================================
        // TOOL: append_bibliography
        // =====================================================
        } else if (tool === 'append_bibliography') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: `📚 *Menyisipkan/Memperbarui Daftar Pustaka...*`, isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             try {
               await window.Word.run(async (context: any) => {
                 const body = context.document.body;
                 const paragraphs = body.paragraphs;
                 context.load(paragraphs, 'text, style');
                 await context.sync();

                 const refsArray = Array.isArray(args.references) ? args.references : [args.references];
                 
                 // Step 1: Cari apakah seksi Daftar Pustaka sudah ada
                 let biblioHeadingIndex = -1;
                 for (let i = 0; i < paragraphs.items.length; i++) {
                   const txt = paragraphs.items[i].text.toUpperCase();
                   if (txt.includes("DAFTAR PUSTAKA") || txt.includes("REFERENCE") || txt.includes("BIBLIOGRAPHY")) {
                     biblioHeadingIndex = i;
                     break;
                   }
                 }

                 if (biblioHeadingIndex !== -1) {
                   // SMART MERGE: Masukkan ke seksi yang sudah ada
                   // Cari baris terakhir di seksi bibliography (sampai akhir dokumen atau heading lain)
                   let lastRefIndex = biblioHeadingIndex;
                   for (let i = biblioHeadingIndex + 1; i < paragraphs.items.length; i++) {
                     const style = paragraphs.items[i].style || "";
                     const text = paragraphs.items[i].text.toUpperCase();
                     
                     // Berhenti jika ketemu heading lain atau teks kosong yang mencurigakan (batas akhir)
                     if (style.includes("Heading") || text.startsWith("BAB ")) {
                       break;
                     }
                     
                     // Jika paragraf kosong (hanya whitespace), kita tetep anggap bagian dari seksi 
                     // kecuali jika di bawahnya sudah tidak ada teks lagi.
                     lastRefIndex = i;
                   }
                   
                   const lastPara = paragraphs.items[lastRefIndex];
                   const biblioHtml = buildBibliographyHtml(refsArray, false); // Tanpa judul
                   lastPara.insertHtml(biblioHtml, "After");
                   toolResult = `SUCCESS: Referensi baru (${refsArray.length}) digabungkan ke Daftar Pustaka yang sudah ada.`;
                 } else {
                   // BUAT BARU di akhir dokumen
                   const biblioHtml = buildBibliographyHtml(refsArray, true); // Dengan judul
                   body.insertHtml(biblioHtml, "End");
                   toolResult = `SUCCESS: Seksi Daftar Pustaka baru berhasil dibuat di akhir dokumen.`;
                 }
                 await context.sync();
               });
             } catch (e: any) {
               toolResult = `ERROR Word API (bibliography): ${e.message}`;
             }
           } else {
             toolResult = "SUCCESS (Simulated Bibliography)";
           }

        // =====================================================
        // TOOL: replace_section_content
        // =====================================================
        } else if (tool === 'replace_section_content') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: `📝 *Merevisi '${args.heading}'...*`, isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             try {
               await window.Word.run(async (context: any) => {
                 const body = context.document.body;
                 const paragraphs = body.paragraphs;
                 context.load(paragraphs, 'text, style');
                 await context.sync();

                 // Step 1: Cari Heading Target (Filter Daftar Isi agar tidak salah sasaran)
                 let headingIndex = -1;
                 const targetHeading = args.heading.toUpperCase();
                 const tocKeywords = ["DAFTAR ISI", "TABLE OF CONTENTS", "HALAMAN", "DAFTAR GAMBAR", "DAFTAR TABEL"];
                 
                 for (let i = 0; i < paragraphs.items.length; i++) {
                   const txt = paragraphs.items[i].text.toUpperCase();
                   const style = paragraphs.items[i].style || "";
                   
                   // Abaikan jika itu bagian dari Daftar Isi
                   const isToc = tocKeywords.some(kw => txt.includes(kw)) || txt.includes(".......");
                   if (isToc) continue;

                   if ((style.includes("Heading") || txt.startsWith("BAB ") || txt.length < 100) && txt.includes(targetHeading)) {
                     headingIndex = i;
                     break;
                   }
                 }

                 if (headingIndex === -1) {
                   toolResult = `ERROR: Heading '${targetHeading}' tidak ditemukan di isi dokumen. Pastikan nama heading benar.`;
                   return;
                 }

                 // Step 2: Cari Batas Akhir
                 let endIndex = paragraphs.items.length;
                 for (let i = headingIndex + 1; i < paragraphs.items.length; i++) {
                   const style = paragraphs.items[i].style || "";
                   const text = paragraphs.items[i].text.toUpperCase();
                   if (style.includes("Heading") || text.startsWith("BAB ") || text.includes("DAFTAR PUSTAKA")) {
                     endIndex = i;
                     break;
                   }
                 }

                 // Step 3: Ambil Range Heading sebelum kontennya dihapus
                 const headingPara = paragraphs.items[headingIndex];
                 const headingRange = headingPara.getRange();

                 // Step 4: Hapus isi di bawah heading (Surgical Delete)
                 const numToDelete = endIndex - 1 - headingIndex;
                 if (numToDelete > 0) {
                   // Buat range dari paragraf pertama setelah heading sampai paragraf terakhir section
                   const startRange = paragraphs.items[headingIndex + 1].getRange("Start");
                   const endRange = paragraphs.items[endIndex - 1].getRange("End");
                   const deleteRange = startRange.expandTo(endRange);
                   deleteRange.clear();
                 }
                 await context.sync();

                 // Step 5: Suntikkan Konten Baru
                 const markdownInput = args.content || "";
                 if (!markdownInput) {
                    toolResult = "ERROR: Konten baru kosong.";
                    return;
                 }
                 const htmlContent = markdownToSkripsiHtml(markdownInput);
                 
                 // Masukkan setelah headingRange
                 headingRange.insertHtml(htmlContent, "After");
                 await context.sync();

                 toolResult = `SUCCESS: Revisi '${targetHeading}' selesai. (Dihapus: ${numToDelete} paragraf, Disisipkan: ${htmlContent.length} char HTML).`;
               });
             } catch (e: any) {
               console.error("Replace Section Error:", e);
               toolResult = `ERROR Word API (replace_section): ${e.message}`;
             }
           } else {
             toolResult = "SUCCESS (Simulated)";
           }

        // =====================================================
        // TOOL: insert_page_numbers (OOXML Power)
        // =====================================================
                 } else if (tool === 'insert_page_numbers') {
            setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: `🔢 *Menyisipkan nomor halaman otomatis (Robust Mode)...*`, isWritingInfo: true }]);
            
            if (typeof window !== "undefined" && window.Word) {
              try {
                await window.Word.run(async (context: any) => {
                  const sections = context.document.sections;
                  sections.load("items");
                  await context.sync();
                  
                  const location = args.location || "Bottom"; 
                  const alignment = args.alignment || "Center";
                  const alignMap: Record<string, string> = { "Left": "left", "Center": "center", "Right": "right" };
                  const xmlAlign = alignMap[alignment] || "center";

                  const ooxml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><?mso-application progid="Word.Document"?><pkg:package xmlns:pkg="http://schemas.microsoft.com/office/2006/xmlPackage"><pkg:part pkg:name="/_rels/.rels" pkg:contentType="application/vnd.openxmlformats-package.relationships+xml" pkg:padding="512"><pkg:xmlData><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships></pkg:xmlData></pkg:part><pkg:part pkg:name="/word/document.xml" pkg:contentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"><pkg:xmlData><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:jc w:val="${xmlAlign}"/></w:pPr><w:fldSimple w:fld=" PAGE "/></w:p></w:body></w:document></pkg:xmlData></pkg:part></pkg:package>`;

                  for (let i = 0; i < sections.items.length; i++) {
                    const section = sections.items[i];
                    let hf = (location === "Top") ? section.getHeader("Primary") : section.getFooter("Primary");
                    
                    try {
                      // Attempt 1: Standard OOXML Replace
                      hf.body.getRange().insertOoxml(ooxml, "Replace");
                    } catch (innerError) {
                      console.warn("OOXML Insert failed, trying Fallback Body Clear...", innerError);
                      // Fallback: Clear and insert at end
                      hf.body.clear();
                      hf.body.insertOoxml(ooxml, "End");
                    }
                  }
                  
                  await context.sync();
                  toolResult = `SUCCESS: Nomor halaman (${location}, ${alignment}) aktif. Harap cek dokumen.`;
                });
              } catch (e: any) {
                console.error("Page Numbering Tool Failure:", e);
                // JANGAN hanya kasih error mentah, tapi kasih instruksi biar Agen gak nyerah
                toolResult = `ERROR: Gagal menyisipkan nomor halaman otomatis. Pesan: ${e.message}. SARAN: Gunakan tool 'execute_office_js' untuk mencoba menyisipkan teks manual ke Footer.`;
              }
            } else {
              toolResult = "SUCCESS (Simulated)";
            }

         // =====================================================
         // TOOL: insert_toc (Smart Table of Contents)
         // =====================================================
         } else if (tool === 'insert_toc') {
            setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: `📋 *Menyisipkan Daftar Isi otomatis...*`, isWritingInfo: true }]);
            
            if (typeof window !== "undefined" && window.Word) {
              try {
                await window.Word.run(async (context: any) => {
                  const body = context.document.body;
                  const paragraphs = body.paragraphs;
                  context.load(paragraphs, 'text, style');
                  await context.sync();
                  
                  let targetIndex = -1;
                  for (let i = 0; i < paragraphs.items.length; i++) {
                    const txt = paragraphs.items[i].text.toUpperCase();
                    if (txt.includes("BAB 1") || txt.includes("BAB I") || txt.includes("PENDAHULUAN")) {
                      targetIndex = i;
                      break;
                    }
                  }

                  let insertRange;
                  if (targetIndex !== -1) {
                    insertRange = paragraphs.items[targetIndex].getRange("Before");
                  } else {
                    insertRange = body.getRange("Start");
                  }

                  // Gunakan insertHtml agar gaya Heading 1 lebih pasti nempel dan dikenali TOC
                  const titleHtml = '<h1 style="font-family: \'Times New Roman\'; font-size: 14pt; text-align: center;">DAFTAR ISI</h1>';
                  insertRange.insertHtml(titleHtml, "Before");
                  
                  // Penting: API ini akan menyisipkan TOC yang memindai seluruh dokumen untuk gaya Heading
                  context.document.insertTableOfContents(); 
                  
                  // Kasih Page Break SEBELUM isi skripsi (setelah TOC area)
                  insertRange.insertBreak("Page", "Before");

                  await context.sync();
                  toolResult = `SUCCESS: Daftar Isi otomatis berhasil disisipkan ${targetIndex !== -1 ? 'sebelum Pendahuluan' : 'di awal dokumen'}. Silakan scroll ke atas untuk melihat hasilnya.`;
                });
              } catch (e: any) {
                console.error("TOC Error:", e);
                toolResult = `ERROR Word API (insert_toc): ${e.message}`;
              }
            } else {
              toolResult = "SUCCESS (Simulated TOC)";
            }

        // =====================================================
        // TOOL TIDAK DIKENAL
        // =====================================================
        } else {
           toolResult = `ERROR: Tool '${tool}' tidak dikenal oleh klien.`;
        }

        // Attach tool result to conversation history
        const updatedHistory = [
           ...currentHistory,
           { role: 'assistant', content: assistantLogs },
           { role: 'user', content: `[SYSTEM_TOOL_RESULT - ${tool}]:\n${toolResult}` }
        ];
        
        setApiHistory(updatedHistory);
        
        if (isPredicted) {
          setMessages((prev) => [
            ...prev,
            { id: Date.now().toString(), role: "agent", content: `✅ Perintah berhasil dieksekusi (Autopilot).` }
          ]);
          setIsLoading(false);
          return;
        }
        
        await callAgent(updatedHistory);

      } else {
         setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "Error: " + (data.error || "Unknown Error") }]);
         setIsLoading(false);
      }
    } catch (err: any) {
      console.error("Call Agent Network/Parsing Error:", err);
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "Koneksi ke otak agen gagal. " + (err.message || "") }]);
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    const updatedHistory = [...apiHistory, { role: "user", content: userMessage.content }];
    setApiHistory(updatedHistory);
    
    await callAgent(updatedHistory);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Header Premium */}
      <header className="px-6 py-5 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-lg shadow-indigo-500/30 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-white">
              <path d="M5 5h14" />
              <path d="M7 5v8" />
              <path d="M17 5v8" />
              <circle cx="12" cy="11" r="3" />
              <path d="M8 17c0-2.5 8-2.5 8 0v2H8v-2z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-300">
            Word Agent
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
          Online
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-700">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div 
              className={`max-w-[85%] rounded-2xl px-5 py-3.5 shadow-sm ${
                m.role === "user" 
                  ? "bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-br-none" 
                  : m.isWritingInfo 
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-bl-none"
                    : "bg-slate-800/80 border border-slate-700/50 text-slate-200 rounded-bl-none"
              }`}
            >
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl rounded-bl-none px-5 py-4 flex gap-1.5">
               <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
               <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
               <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/80 backdrop-blur-md">
        <div className="relative flex items-center">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ketik tugas untuk Word Add-in..."
            className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3.5 pl-4 pr-14 text-[14px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none transition-all placeholder:text-slate-500"
            rows={2}
          />
          <button 
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="absolute right-3 bottom-0 top-0 my-auto h-10 w-10 bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg flex items-center justify-center transition-colors shadow-md disabled:shadow-none"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 ml-0.5"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
          </button>
        </div>
        <div className="mt-2 text-center">
          <p className="text-[11px] text-slate-500 font-medium">Shift + Enter untuk baris baru. didukung oleh OpenAlex & LangGraph.</p>
        </div>
      </div>
    </div>
  );
}
