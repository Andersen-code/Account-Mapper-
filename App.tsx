
import React, { useState, useMemo } from 'react';
import { analyzeAccountDocument } from './services/geminiService.ts';
import { AccountAnalysis, ProcessingState, OrgNode } from './types.ts';
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

  const runAnalysis = async () => {
    if (stagedFiles.length === 0) return;
    setStatus({ isLoading: true, error: null, step: 'scanning' });
    try {
      const fileContents = await Promise.all(stagedFiles.map(async (file) => {
        const text = await file.text();
        return `SOURCE FILE: ${file.name}\n---\n${text}\n---`;
      }));
      const combinedText = fileContents.join('\n\n');
      setStatus(s => ({ ...s, step: 'mapping' }));
      const result = await analyzeAccountDocument(combinedText);
      setAnalysis(result);
      setActiveDept(null);
      setStagedFiles([]);
      setStatus({ isLoading: false, error: null, step: 'finalizing' });
    } catch (err: any) {
      setStatus({ isLoading: false, error: err.message, step: 'idle' });
    }
  };

  const deleteStakeholder = (id: string) => {
    if (!analysis) return;
    
    setAnalysis(prev => {
      if (!prev) return null;
      
      const target = prev.contacts.find(c => c.id === id);
      if (!target) return prev;

      // Re-assign children to the deleted node's manager to keep the tree intact
      const newContacts = prev.contacts
        .filter(c => c.id !== id)
        .map(c => {
          if (c.managerId === id) {
            return { ...c, managerId: target.managerId || null };
          }
          return c;
        });

      return {
        ...prev,
        contacts: newContacts
      };
    });
    
    showToast("Stakeholder removed from map.");
  };

  const copyDataForExcel = () => {
    if (!analysis) return;
    const headers = ["Name", "Title", "Department", "Role", "Seniority", "Power", "Stance", "Strategy"];
    const rows = analysis.contacts.map(c => [
      c.name, c.title, c.department, c.buyingRole, c.seniorityRank, c.powerLevel, c.stance, c.strategicAction
    ]);
    const tsvContent = [headers, ...rows].map(row => row.join("\t")).join("\n");
    navigator.clipboard.writeText(tsvContent).then(() => {
      showToast("Stakeholder data copied for Excel.");
    });
  };

  const exportAsImage = async (copyToClipboard = false) => {
    const svgElement = document.querySelector('#org-chart-svg') as SVGSVGElement;
    if (!svgElement) return;

    const contentGroup = svgElement.querySelector('g') as SVGGElement;
    const bbox = contentGroup.getBBox();
    const padding = 80;
    
    const exportWidth = bbox.width + padding * 2;
    const exportHeight = bbox.height + padding * 2;

    const svgClone = svgElement.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute("width", exportWidth.toString());
    svgClone.setAttribute("height", exportHeight.toString());
    svgClone.setAttribute("viewBox", `${bbox.x - padding} ${bbox.y - padding} ${exportWidth} ${exportHeight}`);
    
    const styleElement = document.createElementNS("http://www.w3.org/2000/svg", "style");
    styleElement.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');
      text { font-family: 'Inter', sans-serif; }
    `;
    svgClone.prepend(styleElement);

    const cloneGroup = svgClone.querySelector('g');
    if (cloneGroup) cloneGroup.setAttribute('transform', '');

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    const scale = 3; 
    canvas.width = exportWidth * scale;
    canvas.height = exportHeight * scale;

    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = async () => {
      if (ctx) {
        ctx.scale(scale, scale);
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, exportWidth, exportHeight);
        ctx.drawImage(img, 0, 0);
        
        if (copyToClipboard) {
          canvas.toBlob(async (blob) => {
            if (blob) {
              try {
                const item = new ClipboardItem({ "image/png": blob });
                await navigator.clipboard.write([item]);
                showToast("Visual copied to clipboard.");
              } catch (e) {
                triggerDownload(canvas);
              }
            }
          }, 'image/png');
        } else {
          triggerDownload(canvas);
        }
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const triggerDownload = (canvas: HTMLCanvasElement) => {
    const pngUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = `${analysis?.accountName.replace(/\s+/g, '_')}_OrgMap.png`;
    link.click();
    showToast("Visual saved as PNG.");
  };

  return (
    <div className="min-h-screen bg-[#fcfdff] text-slate-900">
      {toast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] bg-slate-900 text-white px-8 py-4 rounded-3xl shadow-2xl font-bold text-sm animate-in fade-in slide-in-from-bottom-4 flex items-center gap-3 border border-slate-700">
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
              <button onClick={() => { setAnalysis(null); setStagedFiles([]); }} className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg">New Scan</button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-[1920px] mx-auto p-10">
        {!analysis && !status.isLoading && (
          <div className="max-w-4xl mx-auto mt-24">
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) setStagedFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]); }}
              className={`border-[4px] border-dashed rounded-[60px] p-24 text-center bg-white transition-all duration-500 shadow-2xl ${isDragging ? 'border-indigo-500 bg-indigo-50/20 scale-[1.01]' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-400 mx-auto mb-10 shadow-inner">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </div>
              <h2 className="text-4xl font-black text-slate-900 mb-12 tracking-tighter">Organizational Blueprint</h2>
              
              <div className="flex justify-center gap-4">
                <label className="px-12 py-5 bg-white border-2 border-slate-900 text-slate-900 rounded-3xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all cursor-pointer">
                  Select Documents
                  <input type="file" multiple className="hidden" onChange={(e) => e.target.files && setStagedFiles(prev => [...prev, ...Array.from(e.target.files!)])} />
                </label>
                {stagedFiles.length > 0 && (
                  <button onClick={runAnalysis} className="px-12 py-5 bg-indigo-600 text-white rounded-3xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-xl transition-all animate-in fade-in zoom-in-95">
                    Generate Hierarchy
                  </button>
                )}
              </div>
              
              {stagedFiles.length > 0 && (
                <div className="mt-12 space-y-3 max-w-md mx-auto">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Staged for analysis</p>
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
          <div className="text-center py-60">
            <div className="w-20 h-20 border-[6px] border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-10 shadow-2xl"></div>
            <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter mb-4">{status.step}ing Organization...</h2>
          </div>
        )}

        {analysis && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {view === 'visual' ? (
              <div className="space-y-10">
                <div className="bg-white border border-slate-200 rounded-[40px] p-6 flex flex-wrap items-center justify-between gap-10 shadow-sm">
                  <div className="flex items-center gap-8">
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hierarchy Filter</span>
                      <select 
                        value={activeDept || ''} 
                        onChange={(e) => setActiveDept(e.target.value || null)}
                        className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-[11px] font-black text-slate-900 min-w-[240px]"
                      >
                        <option value="">Global View</option>
                        {departments.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div className="h-10 w-px bg-slate-100"></div>
                    <div className="flex items-center gap-4">
                       <button onClick={() => exportAsImage(true)} className="group flex items-center gap-3 px-6 py-3.5 bg-slate-900 text-white rounded-2xl hover:bg-indigo-600 transition-all shadow-lg active:scale-95">
                          <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                          <span className="text-[11px] font-black uppercase tracking-widest">Copy to PowerPoint</span>
                       </button>
                       <button onClick={copyDataForExcel} className="group flex items-center gap-3 px-6 py-3.5 bg-white border-2 border-slate-900 rounded-2xl hover:bg-emerald-50 transition-all active:scale-95">
                          <svg className="w-5 h-5 text-slate-400 group-hover:text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                          <span className="text-[11px] font-black uppercase tracking-widest text-slate-900">Copy to Excel</span>
                       </button>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest">{analysis.accountName}</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">{analysis.contacts.length} Stakeholders Mapped</p>
                  </div>
                </div>

                <div className="w-full relative shadow-2xl rounded-[40px] overflow-hidden border border-slate-100">
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
                    <div className="bg-red-50 p-10 rounded-[40px] border border-red-100 shadow-sm">
                      <h4 className="text-[11px] font-black text-red-600 uppercase tracking-widest mb-6">Critical Risks</h4>
                      <ul className="space-y-4">
                        {analysis.criticalAlignmentGaps.map((g, i) => (
                          <li key={i} className="text-sm font-bold text-red-900 flex gap-3">
                            <span className="shrink-0 text-red-400">•</span> {g}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-emerald-50 p-10 rounded-[40px] border border-emerald-100 shadow-sm">
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