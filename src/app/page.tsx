"use client";

import { useState, useRef, useEffect } from "react";
import showdown from "showdown";

// Inisialisasi converter markdown ke HTML
const converter = new showdown.Converter({
  tables: true,
  strikethrough: true,
  tasklists: true
});

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
    // Inisialisasi Office.js
    if (typeof window !== "undefined" && window.Office) {
      window.Office.onReady(() => {
        setIsOfficeReady(true);
      });
    } else {
      // Fallback jika dibuka di browser biasa
      setIsOfficeReady(true); 
    }
  }, []);

  // Auto scroll ke bawah tiap ada pesan baru
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // The "under the hood" conversational history that we send to the LLM
  // Includes tool calls and hidden system thinking
  const [apiHistory, setApiHistory] = useState<any[]>([]);

  const callAgent = async (currentHistory: any[]) => {
    try {
      // Tambahkan '?v=1' untuk memaksa Word Add-in mengunduh script JS Next.js yang baru (Bypass Cache)
      const res = await fetch("/api/agent?action=chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: currentHistory }),
      });

      const data = await res.json();

      if (data.type === 'success') {
        // Agent is done
        setMessages((prev) => [
          ...prev, 
          { id: Date.now().toString(), role: "agent", content: data.message }
        ]);
        
        // Save to internal history
        setApiHistory([
            ...currentHistory, 
            { role: 'assistant', content: JSON.stringify({ action: 'finish', args: { message: data.message } }) }
        ]);
        setIsLoading(false);
        
      } else if (data.type === 'action_required') {
        const { tool, args, assistantLogs } = data;
        let toolResult = "";

        // UI Feedback that agent is doing something
        if (tool === 'read_document') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "👀 *Membaca isi dokumen Anda...*", isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             await window.Word.run(async (context: any) => {
               const body = context.document.body;
               body.load("text");
               await context.sync();
               toolResult = body.text || "[Dokumen Kosong]";
             });
           } else {
             toolResult = "[Development Mode Error: Office.js tidak ditemukan]";
           }

        } else if (tool === 'edit_document') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "✍️ *Menambahkan teks baru ke dokumen...*", isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             await window.Word.run(async (context: any) => {
               const body = context.document.body;
               const htmlString = converter.makeHtml(args.text);
               body.insertHtml(htmlString, window.Word.InsertLocation.end);
               await context.sync();
               toolResult = "SUCCESS: Teks baru berhasil ditambahkan.";
             });
           } else {
             toolResult = "SUCCESS (Simulated)";
           }

        } else if (tool === 'replace_text') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "🔄 *Mengganti teks spesifik di dokumen...*", isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             await window.Word.run(async (context: any) => {
               const searchResults = context.document.body.search(args.old_text, { matchCase: true });
               context.load(searchResults, 'text');
               await context.sync();
               
               if (searchResults.items.length === 0) {
                 toolResult = `ERROR: Teks '${args.old_text}' tidak ditemukan persis di dokumen. Harap panggil 'read_document' lagi dan periksa kapitalisasinya!`;
               } else {
                 for (let i = 0; i < searchResults.items.length; i++) {
                   searchResults.items[i].insertText(args.new_text, window.Word.InsertLocation.replace);
                 }
                 await context.sync();
                 toolResult = `SUCCESS: Berhasil mengganti ${searchResults.items.length} kemunculan dari '${args.old_text}'.`;
               }
             });
           } else {
             toolResult = "SUCCESS (Simulated Replace)";
           }

        } else if (tool === 'delete_text') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "🗑️ *Menghapus teks spesifik di dokumen...*", isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             await window.Word.run(async (context: any) => {
               const searchResults = context.document.body.search(args.target_text, { matchCase: true });
               context.load(searchResults, 'text');
               await context.sync();
               
               if (searchResults.items.length === 0) {
                 toolResult = `ERROR: Teks '${args.target_text}' tidak ditemukan persis di dokumen. Harap panggil 'read_document' lagi dan periksa kapitalisasinya!`;
               } else {
                 for (let i = 0; i < searchResults.items.length; i++) {
                   searchResults.items[i].clear(); // Delete text
                 }
                 await context.sync();
                 toolResult = `SUCCESS: Berhasil menghapus ${searchResults.items.length} kemunculan dari teks tersebut.`;
               }
             });
           } else {
             toolResult = "SUCCESS (Simulated Delete)";
           }

        } else if (tool === 'read_document_outline') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "📑 *Membaca daftar isi dokumen Anda...*", isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             await window.Word.run(async (context: any) => {
               // Ambil hanya paragraf yang merupakan "Heading" (Judul Bab dsb)
               const paragraphs = context.document.body.paragraphs;
               context.load(paragraphs, 'style, text');
               await context.sync();
               
               let outline = "";
               paragraphs.items.forEach((p: any) => {
                 if (p.style.includes("Heading")) {
                   outline += `- [${p.style}] ${p.text}\n`;
                 }
               });
               toolResult = outline || "[Dokumen tidak memiliki struktur Heading yang terdeteksi. Harap gunakan read_document semua jika ini dokumen pendek.]";
             });
           } else {
             toolResult = "[Simulated Outline]";
           }
           
        } else if (tool === 'search_keyword_in_doc') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: `🔍 *Mencari lokasi kata '${args.keyword}'...*`, isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             await window.Word.run(async (context: any) => {
               const searchResults = context.document.body.search(args.keyword, { matchCase: false });
               context.load(searchResults, 'text'); // Load the text of the found range
               // Untuk ngasih "konteks", kita idealnya harus tau paragraf di sekitarnya. 
               // Sebagai jalan pintas cepat, Word.js bisa mengekspansi *range* pencarian ke level paragraf:
               
               await context.sync();
               
               if (searchResults.items.length === 0) {
                 toolResult = `Kata '${args.keyword}' tidak ditemukan di seluruh dokumen.`;
               } else {
                 let contextSnippets = "";
                 for (let i = 0; i < Math.min(searchResults.items.length, 5); i++) { // Limit max 5 ctx
                    const expandedRange = searchResults.items[i].expandTo(context.document.body.paragraphs.getFirst()); // Hackish way for context
                    context.load(expandedRange, 'text');
                 }
                 await context.sync();
                 toolResult = `Ditemukan ${searchResults.items.length} kemunculan (Maks 5 cuplikan konteks terlampir kalau bisa). Silakan pake tool lain jika kurang.`;
               }
             });
           } else {
             toolResult = "[Simulated Search]";
           }

        } else if (tool === 'execute_office_js') {
           setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "⚡ *Mengeksekusi skrip dinamis / God Mode...*", isWritingInfo: true }]);
           
           if (typeof window !== "undefined" && window.Word) {
             try {
                // EXTREMELY POWERFUL: Menjalankan Javascript Word API racikan AI secara mentah.
                await window.Word.run(async (context: any) => {
                   const body = context.document.body; // Ekspos body ke eval scope
                   // eslint-disable-next-line no-eval
                   eval(`(async () => { ${args.script} })()`);
                   await context.sync();
                });
                toolResult = "SUCCESS: Skrip Word_JS Anda berhasil dieksekusi tanpa error.";
             } catch (e: any) {
                console.error("Execute Script Error:", e);
                toolResult = `ERROR Eksekusi Skrip: ${e.message}. Silakan perbaiki sintaks Office.js Anda. Ingat objek utamanya adalah 'context' dan 'body'.`;
             }
           } else {
             toolResult = "[Simulated Script Exec]";
           }
        }

        // Attach tool result to conversation history for next Agent loop
        const updatedHistory = [
           ...currentHistory,
           { role: 'assistant', content: assistantLogs }, // What it thought
           { role: 'user', content: `SYSTEM (TOOL RESULT - ${tool}):\n${toolResult}` } // The outcome
        ];
        
        setApiHistory(updatedHistory);
        
        // RECURSIVE CALL: Give outcome back to agent so it can decide what to do next
        await callAgent(updatedHistory);

      } else {
         setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "Error: " + (data.error || "Unknown Error") }]);
         setIsLoading(false);
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "Koneksi ke otak agen gagal." }]);
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-white"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
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
