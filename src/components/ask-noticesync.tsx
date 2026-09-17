'use client';

import { useState } from 'react';
import { MessageSquare, Send, Bot, User, Loader2 } from 'lucide-react';

export default function AskNoticeSync() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { id: Date.now().toString(), role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      });

      if (!response.ok) throw new Error('API Error');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let assistantContent = '';

      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: '' }]);

      while (!done) {
        if (!reader) break;
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          assistantContent += chunk;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1].content = assistantContent;
            return updated;
          });
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card border p-4 bg-gray-900/50 mt-8 rounded-2xl flex flex-col h-[400px]">
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Bot className="text-blue-400" size={20} />
        Ask NoticeSync
      </h2>
      
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
        {messages.length === 0 ? (
          <div className="text-gray-500 text-sm h-full flex flex-col items-center justify-center text-center px-4">
            <MessageSquare size={32} className="mb-2 opacity-50" />
            <p>Ask anything about your academic schedule, deadlines, or conflicts.</p>
            <p className="mt-2 opacity-70 text-xs">Example: "When is my DBMS lab record due?"</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`p-2 rounded-full h-8 w-8 flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              </div>
              <div className={`text-sm py-2 px-3 rounded-lg max-w-[85%] ${m.role === 'user' ? 'bg-blue-600/20 text-blue-100' : 'bg-gray-800 text-gray-200'}`}>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))
        )}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex gap-3">
            <div className="p-2 rounded-full h-8 w-8 flex items-center justify-center shrink-0 bg-purple-500/20 text-purple-400">
              <Bot size={14} />
            </div>
            <div className="text-sm py-2 px-4 rounded-lg bg-gray-800 text-gray-400 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Thinking...
            </div>
          </div>
        )}
      </div>
      
      <form onSubmit={handleSubmit} className="relative">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your deadlines..."
          className="w-full bg-black/50 border border-gray-700 rounded-full py-3 pl-4 pr-12 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
          disabled={isLoading}
        />
        <button 
          type="submit" 
          disabled={!input.trim() || isLoading}
          className="absolute right-2 top-2 p-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-blue-500 text-white rounded-full transition-colors"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
