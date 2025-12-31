
import React, { useState, useMemo } from 'react';
import { analyzeAccountDocument } from './services/geminiService.ts';
import { AccountAnalysis, ProcessingState } from './types.ts';
import OrgChart from './components/OrgChart.tsx';

const App: React.FC = () => {
  const [analysis, setAnalysis] = useState<AccountAnalysis | null>(null);
  const [activeDept, setActiveDept] = useState<string | null>(null);
  const [view, setView] = useState<'visual' | 'executive'>('visual');
  const [isDragging, setIsDragging] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingState>({
    isLoading: false,
    error: null,
    step: 'idle'
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const departments = useMemo(() => {
    if (!analysis) return [];
    return Array.from(new Set(analysis.contacts.map(c => c.department || "General"))).sort();
  }, [analysis]);

  const handleFileDrop = (files: FileList) => {
    const validFiles = Array.from(files).filter(file => {
      const isLarge = file.size > 10 * 1024 * 1024; // 10MB limit for text
      if (isLarge) {
        showToast(`${file.name} is too large (>10MB).`);
        return false;
      }
      return true;
    });
    setStagedFiles(prev => [...prev, ...validFiles]);
  };

  const runAnalysis = async () => {
    if (stagedFiles.length === 0) return;
    setStatus({ isLoading: true, error: null, step: 'scanning' });
    try {
      const fileContents = await Promise.all(stagedFiles.map(async (file) => {
        try {
          const text = await file.text();
          if (!text || text.trim().length === 0) {
            throw new Error(`File ${file.name} is empty.`);
          }
          return `SOURCE FILE: ${file.name}\n---\n${text}\n---`;
        } catch (e) {
          throw new Error(`Could not read ${file.name}. Please ensure it is a text-based document.`);
        }
      }));

      const combinedText = fileContents.join('\n\n');
      setStatus(s => ({ ...s, step: 'mapping' }));
      
      const result = await analyzeAccountDocument(combinedText);
      
      if (!result.contacts || result.contacts.length === 0) {
        throw new Error("No stakeholders identified. Try a document with more explicit organizational data.");
      }

      setAnalysis(result);
      setActiveDept(null);
      setStagedFiles([]);
      setStatus({ isLoading: false, error: null, step: 'idle' });
      showToast("Organization map generated successfully.");
    } catch (err: any) {
      console.error("Run Analysis Failure:", err);
      setStatus({ isLoading: false, error: err.message, step: 'idle' });
    }
  };

  const deleteStakeholder = (id: string) => {
    if (!analysis) return;
    setAnalysis(prev => {
      if (!prev) return null;
      const target = prev.contacts.find(c => c.id === id);
      if (!target) return prev;
      const newContacts = prev.contacts
        .filter(c => c.id !== id)
        .map(c => {
          if (c.managerId === id) {
            return { ...c, managerId: target.managerId || null };
          }
          return c;
        });
      return { ...prev, contacts: newContacts };
    });
    showToast("Stakeholder removed.");
  };

  return (
    <div className="min-h-screen bg-[#fcfdff] text-slate-900">
      {toast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] bg-slate-900 text-white px-8 py-4 rounded-3xl shadow-2xl font-bold text-sm flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
          {toast}
        </div>
      )}

      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-10 py-7 sticky top-0 z-50">
        <div className="max-w-[1920px] mx-auto flex justify-between items-center">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl">
               <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Strategic Account Mapper</h1>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Enterprise Hierarchy Intelligence</p>
            </div>
          </div>
          {analysis && (
            <div className="flex items-center gap-6">
              <div className="flex bg-slate-100 p-1 rounded-2xl">
                <button onClick={() => setView('visual')} className={`px-6 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${view === 'visual' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500'}`}>Map</button>
                <button onClick={() => setView('executive')} className={`px-6 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${view === 'executive' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500'}`}>Report</button>
              </div>
              <button onClick={() => { setAnalysis(null); setStagedFiles([]); setStatus({isLoading: false, error: null, step: 'idle'}); }} className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg">New Scan</button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto p-10">
        {status.error && (
          <div className="max-w-4xl mx-auto mb-10 p-6 bg-red-50 border-2 border-red-200 rounded-[32px] flex items-start gap-5 animate-in slide-in-from-top-4">
            <div className="w-10 h-10 bg-red-500 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <div>
              <h3 className="font-black text-red-900 uppercase tracking-tight">Analysis Interrupted</h3>
              <p className="text-red-700 font-medium text-sm mt-1">{status.error}</p>
              <button onClick={() => setStatus({ ...status, error: null })} className="mt-3 text-xs font-black text-red-900 underline uppercase tracking-widest">Dismiss</button>
            </div>
          </div>
        )}

        {!analysis && !status.isLoading && (
          <div className="max-w-4xl mx-auto mt-24">
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) handleFileDrop(e.dataTransfer.files); }}
              className={`border-[4px] border-dashed rounded-[60px] p-24 text-center bg-white transition-all duration-500 shadow-2xl ${isDragging ? 'border-indigo-500 bg-indigo-50/20 scale-[1.01]' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-400 mx-auto mb-10 shadow-inner">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </div>
              <h2 className="text-4xl font-black text-slate-900 mb-6 tracking-tighter">Organizational Blueprint</h2>
              <p className="text-slate-500 mb-12 max-w-md mx-auto font-medium">Drop meeting notes, LinkedIn exports, or account plans to map the stakeholder hierarchy.</p>
              
              <div className="flex justify-center gap-4">
                <label className="px-12 py-5 bg-white border-2 border-slate-900 text-slate-900 rounded-3xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all cursor-pointer">
                  Select Documents
                  <input type="file" multiple className="hidden" onChange={(e) => e.target.files && handleFileDrop(e.target.files)} />
                </label>
                {stagedFiles.length > 0 && (
                  <button onClick={runAnalysis} className="px-12 py-5 bg-indigo-600 text-white rounded-3xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-xl transition-all animate-in zoom-in-95">
                    Generate Hierarchy
                  </button>
                )}
              </div>
              
              {stagedFiles.length > 0 && (
                <div className="mt-12 space-y-3 max-w-md mx-auto">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 text-center">Ready for processing</p>
                  {stagedFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl animate-in slide-in-from-bottom-2">
                       <span className="text-sm font-bold text-slate-700 truncate">{f.name}</span>
                       <button onClick={() => setStagedFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-red-500 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                       </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {status.isLoading && (
          <div className="text-center py-60 animate-in fade-in duration-500">
            <div className="relative mx-auto mb-10 w-24 h-24">
              <div className="absolute inset-0 border-[6px] border-indigo-100 rounded-full"></div>
              <div className="absolute inset-0 border-[6px] border-indigo-600 border-t-transparent rounded-full animate-spin shadow-xl"></div>
            </div>
            <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter mb-4">{status.step}ing Intelligence...</h2>
            <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[10px]">Gemini 3 Pro is analyzing hierarchy logic</p>
          </div>
        )}

        {analysis && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {view === 'visual' ? (
              <div className="space-y-10">
                <div className="bg-white border border-slate-200 rounded-[40px] p-6 flex flex-wrap items-center justify-between gap-10 shadow-sm">
                  <div className="flex items-center gap-8">
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Department</span>
                      <select 
                        value={activeDept || ''} 
                        onChange={(e) => setActiveDept(e.target.value || null)}
                        className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-[11px] font-black text-slate-900 min-w-[200px]"
                      >
                        <option value="">All Departments</option>
                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest">{analysis.accountName}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">{analysis.contacts.length} Entities Found</p>
                  </div>
                </div>

                <div className="w-full relative shadow-2xl rounded-[40px] overflow-hidden border border-slate-100 bg-white">
                  <OrgChart data={analysis} filterDepartment={activeDept} onDeleteStakeholder={deleteStakeholder} />
                </div>
              </div>
            ) : (
              <div className="max-w-5xl mx-auto py-10">
                <div className="bg-white border border-slate-200 rounded-[60px] p-20 shadow-2xl space-y-16">
                  <div className="text-center space-y-6 pb-16 border-b border-slate-100">
                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Executive Strategy Summary</p>
                    <h2 className="text-6xl font-black tracking-tighter text-slate-900">{analysis.accountName}</h2>
                    <p className="text-xl text-slate-500 font-medium max-w-2xl mx-auto italic">"{analysis.executiveSummary}"</p>
                  </div>
                  <div className="grid grid-cols-2 gap-10">
                    <div className="bg-red-50 p-10 rounded-[40px] border border-red-100">
                      <h4 className="text-[11px] font-black text-red-600 uppercase tracking-widest mb-6">Alignment Gaps</h4>
                      <ul className="space-y-4">
                        {analysis.criticalAlignmentGaps.map((g, i) => (
                          <li key={i} className="text-sm font-bold text-red-900 flex gap-3">
                            <span className="shrink-0 text-red-400">•</span> {g}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-emerald-50 p-10 rounded-[40px] border border-emerald-100">
                      <h4 className="text-[11px] font-black text-emerald-600 uppercase tracking-widest mb-6">Strategic Wins</h4>
                      <ul className="space-y-4">
                        {analysis.strategicWins.map((w, i) => (
                          <li key={i} className="text-sm font-bold text-emerald-900 flex gap-3">
                            <span className="shrink-0 text-emerald-400">•</span> {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
