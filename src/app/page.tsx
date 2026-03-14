"use client";

import { useState, useRef, useEffect } from "react";

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

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userMessage.content }),
      });

      const data = await res.json();

      if (data.success) {
        // Tampilkan draft di chat UI (hanya preview singkat)
        const agentMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "agent",
          content: "Draft completed. Writing to document now...",
          isWritingInfo: true
        };
        setMessages((prev) => [...prev, agentMessage]);

        // Eksekusi Word.run
        if (typeof window !== "undefined" && window.Word) {
          await window.Word.run(async (context: any) => {
            const body = context.document.body;
            body.insertParagraph(data.draft, "End");
            await context.sync();
          });
          
          setMessages((prev) => [
            ...prev,
            { id: (Date.now() + 2).toString(), role: "agent", content: "Successfully wrote to your document!" }
          ]);
        } else {
          console.warn("Word.run API not found. Showing draft here instead:");
          setMessages((prev) => [
            ...prev,
            { id: (Date.now() + 2).toString(), role: "agent", content: data.draft }
          ]);
        }

      } else {
        setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "Error: " + data.error }]);
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: "agent", content: "Failed to connect to agent." }]);
    } finally {
      setIsLoading(false);
    }
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
