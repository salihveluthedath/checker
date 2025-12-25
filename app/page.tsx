"use client";

import React, { useState, useMemo } from "react";
import { ArrowRightLeft, UploadCloud, FileSpreadsheet, Calendar, AlertCircle, CheckCircle2, ChevronLeft, Search, Calculator, Copy } from "lucide-react";
import * as XLSX from "xlsx"; 
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// --- Types ---
type Transaction = {
  id: string;
  date: string; 
  amount: number;
  type: "DEBIT" | "CREDIT";
  raw: string;
};

type AnalysisResult = {
  matched: { ledger: Transaction; bank: Transaction }[];
  ledgerOnly: Transaction[];
  bankOnly: Transaction[];
};

type DailyComparison = {
  date: string;
  ledgerIn: number;
  bankIn: number;
  diffIn: number;
  ledgerOut: number;
  bankOut: number;
  diffOut: number;
  // NEW: Net calculations for Balance Difference
  ledgerNet: number;
  bankNet: number;
  dailyBalanceDiff: number; 
  status: "MATCH" | "MISMATCH";
};

// --- HELPERS ---
const parseAmount = (value: any): number => {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const str = String(value).replace(/,/g, "").replace(/ Dr| Cr|Dr\.|Cr\./gi, "").replace(/[^\d.-]/g, "");
  return parseFloat(str) || 0;
};

const parseDate = (value: any): string => {
  if (!value) return "";
  if (typeof value === 'number') {
    const dateObj = new Date(Math.round((value - 25569) * 86400 * 1000));
    return dateObj.toISOString().split('T')[0];
  }
  const str = String(value).trim();
  if (str.includes("/")) {
    const parts = str.split("/");
    const day = parts[0].length === 4 ? parts[2] : parts[0];
    const month = parts[1];
    const year = parts[0].length === 4 ? parts[0] : parts[2];
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return str;
};

export default function ReconcilePage() {
  const [ledgerData, setLedgerData] = useState<Transaction[]>([]);
  const [bankData, setBankData] = useState<Transaction[]>([]);
  const [ledgerName, setLedgerName] = useState("");
  const [bankName, setBankName] = useState("");
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<"matched" | "ledgerOnly" | "bankOnly" | "daily">("matched");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // --- 1. File Upload ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, source: "LEDGER" | "BANK") => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (source === "LEDGER") setLedgerName(file.name);
    else setBankName(file.name);

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    
    const transactions: Transaction[] = [];

    jsonData.slice(1).forEach((row, index) => {
      const rawDate = row[0];
      const debit = parseAmount(row[1]);
      const credit = parseAmount(row[2]);

      let amount = 0;
      let type: "DEBIT" | "CREDIT" = "DEBIT";

      if (debit > 0) { amount = debit; type = "DEBIT"; }
      else if (credit > 0) { amount = credit; type = "CREDIT"; }

      if (amount > 0) {
        transactions.push({
          id: `${source}-${index}-${Math.random()}`,
          date: parseDate(rawDate),
          amount,
          type,
          raw: `${parseDate(rawDate)} | ${amount.toLocaleString()}`,
        });
      }
    });

    if (source === "LEDGER") setLedgerData(transactions);
    else setBankData(transactions);
  };

  // --- 2. Compare Logic ---
  const handleCompare = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      const matched: any[] = [];
      const ledgerOnly = [...ledgerData]; 
      const bankOnly = [...bankData]; 

      for (let i = ledgerOnly.length - 1; i >= 0; i--) {
        const lTx = ledgerOnly[i];
        const matchIndex = bankOnly.findIndex((bTx) => {
            const dateMatch = lTx.date === bTx.date;
            const amountMatch = Math.abs(bTx.amount - lTx.amount) < 0.01;
            const typeMatch = (lTx.type === "DEBIT" && bTx.type === "CREDIT") || 
                              (lTx.type === "CREDIT" && bTx.type === "DEBIT");
            return dateMatch && amountMatch && typeMatch;
        });

        if (matchIndex !== -1) {
          matched.push({ ledger: lTx, bank: bankOnly[matchIndex] });
          ledgerOnly.splice(i, 1);
          bankOnly.splice(matchIndex, 1);
        }
      }
      setResults({ matched, ledgerOnly, bankOnly });
      setIsAnalyzing(false);
    }, 500);
  };

  // --- 3. Daily Stats Calculation (Including Balance Diff) ---
  const dailyStats = useMemo(() => {
    if (!ledgerData.length && !bankData.length) return [];
    
    const stats = new Map<string, DailyComparison>();
    const allDates = new Set([...ledgerData.map(t => t.date), ...bankData.map(t => t.date)]);

    allDates.forEach(date => {
      if (!date || date === "undefined") return;

      const lTx = ledgerData.filter(t => t.date === date);
      const ledgerIn = lTx.filter(t => t.type === "DEBIT").reduce((sum, t) => sum + t.amount, 0);
      const ledgerOut = lTx.filter(t => t.type === "CREDIT").reduce((sum, t) => sum + t.amount, 0);

      const bTx = bankData.filter(t => t.date === date);
      const bankIn = bTx.filter(t => t.type === "CREDIT").reduce((sum, t) => sum + t.amount, 0);
      const bankOut = bTx.filter(t => t.type === "DEBIT").reduce((sum, t) => sum + t.amount, 0);

      const diffIn = ledgerIn - bankIn;
      const diffOut = ledgerOut - bankOut;

      // Net Movement (Did the balance go up or down?)
      const ledgerNet = ledgerIn - ledgerOut;
      const bankNet = bankIn - bankOut;
      
      // THE KEY METRIC: How different was the movement?
      const dailyBalanceDiff = ledgerNet - bankNet;

      const isClean = Math.abs(dailyBalanceDiff) < 0.01;

      stats.set(date, {
          date, 
          ledgerIn, bankIn, diffIn, 
          ledgerOut, bankOut, diffOut,
          ledgerNet, bankNet, dailyBalanceDiff,
          status: isClean ? "MATCH" : "MISMATCH"
      });
    });

    return Array.from(stats.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [ledgerData, bankData]);


  // --- 4. Drill Down Data ---
  const drillDownData = useMemo(() => {
    if (!results || !selectedDate) return null;
    
    const missingInBank = results.ledgerOnly.filter(t => t.date === selectedDate);
    const missingInLedger = results.bankOnly.filter(t => t.date === selectedDate);
    
    const duplicates = new Set<string>();
    missingInBank.forEach(t => {
       const alreadyMatched = results.matched.find(m => 
           m.ledger.date === t.date && 
           Math.abs(m.ledger.amount - t.amount) < 0.01 && 
           m.ledger.type === t.type
       );
       if (alreadyMatched) duplicates.add(t.id);
    });
    
    const totalMissingInBank = missingInBank.reduce((acc, t) => acc + (t.type === 'DEBIT' ? t.amount : -t.amount), 0);
    const totalMissingInLedger = missingInLedger.reduce((acc, t) => acc + (t.type === 'CREDIT' ? t.amount : -t.amount), 0);
    const netDifference = totalMissingInBank - totalMissingInLedger;

    return { missingInBank, missingInLedger, netDifference, duplicates };
  }, [results, selectedDate]);


  return (
    <div className="min-h-screen bg-[#0B0C15] text-slate-200 p-6 md:p-12 font-sans">
      <div className="max-w-[1400px] mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-white">Reconciliation Dashboard</h1>

        <div className="grid md:grid-cols-2 gap-6">
          <UploadCard title="Internal Ledger" filename={ledgerName} onUpload={(e: any) => handleFileUpload(e, "LEDGER")} />
          <UploadCard title="Bank Statement" filename={bankName} onUpload={(e: any) => handleFileUpload(e, "BANK")} />
        </div>

        <div className="flex justify-center">
          <button
            onClick={handleCompare}
            disabled={!ledgerData.length || !bankData.length}
            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {isAnalyzing ? "Analyzing..." : <><ArrowRightLeft size={18} /> Compare Files</>}
          </button>
        </div>

        {results && (
          <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800 shadow-2xl min-h-[500px]">
             
             {!selectedDate ? (
               <>
                 <div className="flex flex-wrap gap-2 md:gap-4 mb-6 border-b border-slate-700 pb-4">
                    <button onClick={() => setActiveTab('daily')} className={cn("flex items-center gap-2 text-sm font-bold transition-all px-4 py-2 rounded-lg", activeTab === 'daily' ? "bg-cyan-900/30 text-cyan-400 border border-cyan-500/30" : "text-slate-500 hover:text-slate-300 hover:bg-white/5")}>
                      <Calendar size={16} /> Day-by-Day Result
                    </button>
                    <TabButton label="Matched" count={results.matched.length} active={activeTab === 'matched'} onClick={() => setActiveTab('matched')} color="text-emerald-400" />
                    <TabButton label="Missing in Bank" count={results.ledgerOnly.length} active={activeTab === 'ledgerOnly'} onClick={() => setActiveTab('ledgerOnly')} color="text-amber-400" />
                    <TabButton label="Missing in Ledger" count={results.bankOnly.length} active={activeTab === 'bankOnly'} onClick={() => setActiveTab('bankOnly')} color="text-rose-400" />
                 </div>

                 <div className="h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                    {/* STANDARD LISTS */}
                    {activeTab === 'matched' && results.matched.map((m, i) => <Row key={i} tx={m.ledger} note="Reconciled" color="text-emerald-500" />)}
                    {activeTab === 'ledgerOnly' && results.ledgerOnly.map((t, i) => <Row key={i} tx={t} note="In Ledger only" color="text-amber-400" />)}
                    {activeTab === 'bankOnly' && results.bankOnly.map((t, i) => <Row key={i} tx={t} note="In Bank only" color="text-rose-400" />)}

                    {/* DAILY TABLE (Updated with Balance Diff) */}
                    {activeTab === 'daily' && (
                      <table className="w-full text-left text-xs md:text-sm border-collapse">
                        <thead className="text-slate-400 border-b border-slate-700 bg-slate-900/50 sticky top-0">
                          <tr>
                            <th className="py-3 pl-2">Date</th>
                            <th className="py-3 text-right text-emerald-400/80">Ledger In</th>
                            <th className="py-3 text-right text-emerald-400/80">Bank In</th>
                            <th className="py-3 text-right text-rose-400/80 pl-4">Ledger Out</th>
                            <th className="py-3 text-right text-rose-400/80">Bank Out</th>
                            
                            {/* THE NEW COLUMN */}
                            <th className="py-3 text-right text-indigo-300 border-l border-slate-700 pl-4">Daily Net Diff</th>
                            
                            <th className="py-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {dailyStats.map((day, i) => (
                            <tr 
                              key={i} 
                              onClick={() => setSelectedDate(day.date)} 
                              className={cn("hover:bg-indigo-500/10 transition-colors cursor-pointer group", day.status === "MISMATCH" ? "bg-red-500/5" : "")}
                            >
                              <td className="py-3 pl-2 font-mono text-slate-300 group-hover:text-indigo-300 flex items-center gap-2">
                                {day.date} <Search size={12} className="opacity-0 group-hover:opacity-100 transition-opacity"/>
                              </td>
                              <td className="py-3 text-right text-slate-400">{day.ledgerIn > 0 ? day.ledgerIn.toLocaleString() : "-"}</td>
                              <td className="py-3 text-right text-slate-400">{day.bankIn > 0 ? day.bankIn.toLocaleString() : "-"}</td>
                              
                              <td className="py-3 text-right text-slate-400 pl-4">{day.ledgerOut > 0 ? day.ledgerOut.toLocaleString() : "-"}</td>
                              <td className="py-3 text-right text-slate-400">{day.bankOut > 0 ? day.bankOut.toLocaleString() : "-"}</td>

                              {/* BALANCE DIFF VALUE */}
                              <td className={cn("py-3 text-right font-mono font-bold border-l border-slate-700 pl-4 text-base", 
                                  Math.abs(day.dailyBalanceDiff) < 0.01 ? "text-slate-600" : "text-amber-400"
                              )}>
                                {Math.abs(day.dailyBalanceDiff) < 0.01 ? "-" : day.dailyBalanceDiff.toLocaleString()}
                              </td>

                              <td className="py-3 text-center">
                                {day.status === "MATCH" ? <span className="inline-flex"><CheckCircle2 size={16} className="text-emerald-500/50" /></span> : <span className="inline-flex"><AlertCircle size={16} className="text-rose-500" /></span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                 </div>
               </>
             ) : (
               /* --- DRILL DOWN VIEW --- */
               <div className="animate-in slide-in-from-right-4 duration-300 flex flex-col h-full">
                 <div className="flex items-center gap-4 mb-6 border-b border-slate-700 pb-4">
                   <button onClick={() => setSelectedDate(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><ChevronLeft /></button>
                   <div className="flex-1">
                     <h2 className="text-xl font-bold text-white">Analysis: {selectedDate}</h2>
                     <p className="text-xs text-slate-500">Reviewing discrepancies for this date</p>
                   </div>
                   {drillDownData && (
                     <div className="flex items-center gap-3 bg-slate-800/50 px-4 py-2 rounded-lg border border-slate-700">
                        <div className="bg-indigo-500/20 p-2 rounded-full"><Calculator size={18} className="text-indigo-300"/></div>
                        <div className="flex flex-col text-right">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Unexplained Difference</span>
                            <span className={cn("font-mono font-bold text-lg", drillDownData.netDifference === 0 ? "text-emerald-400" : "text-rose-400")}>
                                {drillDownData.netDifference > 0 ? "+" : ""}{drillDownData.netDifference.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                     </div>
                   )}
                 </div>

                 <div className="grid md:grid-cols-2 gap-8 flex-1 overflow-hidden min-h-[400px]">
                   {/* LEFT: Missing in Bank */}
                   <div className="flex flex-col bg-slate-950/30 rounded-lg border border-slate-800 overflow-hidden relative">
                     <div className="p-3 bg-amber-900/20 border-b border-amber-500/20 text-amber-300 font-medium text-sm flex justify-between">
                        <span>Missing in Bank</span>
                        <span className="text-xs opacity-70">Likely uncleared or duplicate</span>
                     </div>
                     <div className="overflow-y-auto p-2 space-y-1 custom-scrollbar flex-1">
                        {drillDownData?.missingInBank.map((t, i) => {
                           const isDuplicate = drillDownData.duplicates.has(t.id);
                           return (
                             <div key={i} className={cn("flex justify-between p-3 rounded border transition-colors", isDuplicate ? "bg-amber-500/10 border-amber-500/30" : "bg-white/5 border-white/5 hover:bg-white/10")}>
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs text-slate-400 self-start">{t.type}</span>
                                  {isDuplicate && (
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-900/40 px-2 py-0.5 rounded-full w-fit">
                                      <Copy size={10} /> POSSIBLE DUPLICATE
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-col text-right">
                                    <span className="font-mono text-amber-400 font-bold">{t.amount.toLocaleString()}</span>
                                    <span className="text-[10px] text-slate-600 truncate max-w-[150px]">{t.id}</span>
                                </div>
                             </div>
                           )
                        })}
                     </div>
                   </div>

                   {/* RIGHT: Missing in Ledger */}
                   <div className="flex flex-col bg-slate-950/30 rounded-lg border border-slate-800 overflow-hidden relative">
                     <div className="p-3 bg-rose-900/20 border-b border-rose-500/20 text-rose-300 font-medium text-sm flex justify-between">
                        <span>Missing in Ledger</span>
                        <span className="text-xs opacity-70">Bank items not recorded</span>
                     </div>
                     <div className="overflow-y-auto p-2 space-y-1 custom-scrollbar flex-1">
                        {drillDownData?.missingInLedger.map((t, i) => (
                           <div key={i} className="flex justify-between p-3 bg-white/5 rounded border border-white/5 hover:bg-white/10">
                              <span className="text-xs text-slate-400 self-center">{t.type}</span>
                              <div className="flex flex-col text-right">
                                  <span className="font-mono text-rose-400 font-bold">{t.amount.toLocaleString()}</span>
                              </div>
                           </div>
                        ))}
                     </div>
                   </div>
                 </div>
               </div>
             )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-Components ---
const UploadCard = ({ title, filename, onUpload }: any) => (
  <div className="bg-slate-900/50 border border-slate-700 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center hover:bg-slate-800/50 transition-colors relative h-40 cursor-pointer group">
    <input type="file" accept=".xlsx, .xls, .csv" onChange={onUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
    {filename ? (
        <>
            <FileSpreadsheet className="w-8 h-8 text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
            <p className="text-emerald-400 font-medium text-sm truncate max-w-[200px]">{filename}</p>
        </>
    ) : (
        <>
            <UploadCloud className="w-8 h-8 text-indigo-400 mb-2 group-hover:scale-110 transition-transform" />
            <p className="text-slate-300 font-medium text-sm">{title}</p>
        </>
    )}
  </div>
);

const TabButton = ({ label, count, active, onClick, color }: any) => (
    <button onClick={onClick} className={cn("flex items-center gap-2 text-sm font-medium transition-all px-3 py-1.5 rounded-md", active ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-300")}>
        {label} <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full bg-slate-950 text-white/70", color)}>{count}</span>
    </button>
);

const Row = ({ tx, note, color }: any) => (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5 mb-2 hover:bg-white/10">
        <div><div className="text-slate-300 font-mono text-sm">{tx.date}</div><div className="text-[10px] text-slate-500">{note}</div></div>
        <div className="text-right"><div className={cn("font-mono font-bold", color)}>{tx.amount.toLocaleString()}</div><div className="text-[10px] uppercase text-slate-600">{tx.type}</div></div>
    </div>
);