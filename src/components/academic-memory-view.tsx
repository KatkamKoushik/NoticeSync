'use client';

import { Database, FileText, Image as ImageIcon, AlignLeft, Calendar } from 'lucide-react';
import { useEffect, useState } from 'react';

type Document = {
  id: string;
  title: string;
  source_type: 'pdf' | 'image' | 'text';
  created_at: string;
};

export default function AcademicMemoryView() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // For now we'll fetch from a dummy endpoint or use mock data until API is wired up.
    // In Phase 4 we will wire up the /api/memory endpoint.
    async function load() {
      try {
        const res = await fetch('/api/memory');
        if (res.ok) {
          const data = await res.json();
          setDocuments(data.documents || []);
        } else {
          // fallback mock for UI
          setDocuments([
            { id: '1', title: 'DBMS Syllabus', source_type: 'pdf', created_at: new Date().toISOString() },
            { id: '2', title: 'Circular August', source_type: 'image', created_at: new Date().toISOString() },
          ]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2 text-white">
          <Database className="text-indigo-400" size={20} />
          Academic Memory
        </h2>
        <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded-full">{documents.length} sources</span>
      </div>

      <p className="text-sm text-gray-400">
        NoticeSync remembers every syllabus and circular you upload. It uses these documents to detect conflicts and answer your questions.
      </p>

      {loading ? (
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-20 bg-gray-800 rounded-xl"></div>
            <div className="h-20 bg-gray-800 rounded-xl"></div>
          </div>
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-700 rounded-xl">
          <Database className="mx-auto text-gray-600 mb-2" size={32} />
          <p className="text-gray-400">No documents in memory yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {documents.map(doc => (
            <div key={doc.id} className="p-4 rounded-xl bg-gray-900 border border-gray-800 flex flex-col gap-2 hover:border-gray-700 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-800 text-gray-300">
                  {doc.source_type === 'pdf' && <FileText size={18} />}
                  {doc.source_type === 'image' && <ImageIcon size={18} />}
                  {doc.source_type === 'text' && <AlignLeft size={18} />}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-200 text-sm truncate max-w-[200px]">{doc.title}</h3>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Calendar size={10} />
                    {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
