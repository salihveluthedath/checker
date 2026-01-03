'use client';

import React, { useState, useMemo } from 'react';
import { reconcileData } from '@/utils/matcher';
import { parseAgeDueFile, parseLedgerFile } from '@/utils/parser';
import { downloadReconciliationReport, downloadAgeingReport } from '@/utils/exporter';
import { Transaction, ReconciliationSummary } from '@/types/reconciliation';
import AgeingReport from '@/components/AgeingReport';

export default function ReconciliationPage() {
  const [ageDueData, setAgeDueData] = useState<Transaction[]>([]);
  const [ledgerData, setLedgerData] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  
  const [selectedParty, setSelectedParty] = useState<string>('');
  const [viewMode, setViewMode] = useState<'reconciliation' | 'ageing'>('reconciliation');

  // --- COMPUTED VALUES ---
  const uniqueParties = useMemo(() => {
    if (!summary) return [];
    const names = new Set(summary.results.map(r => r.partyName));
    return Array.from(names).sort();
  }, [summary]);

  // filteredResults: Used for Display AND Single Party Download
  const filteredResults = useMemo(() => {
    if (!summary) return [];
    if (!selectedParty) return summary.results; 
    return summary.results.filter(r => r.partyName === selectedParty);
  }, [summary, selectedParty]);

  const ageingData = useMemo(() => {
    return filteredResults.map(r => ({
      id: r.id,
      date: r.date,
      partyName: r.partyName,
      referenceNo: r.correctedVoucherNo || r.voucherNo || 'N/A', 
      amount: r.amount
    }));
  }, [filteredResults]);

  // --- HANDLERS ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'ageDue' | 'ledger') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = await file.arrayBuffer();
    if (type === 'ageDue') setAgeDueData(parseAgeDueFile(data));
    else setLedgerData(parseLedgerFile(data));
  };

  const runMatching = () => {
    if (ageDueData.length === 0 || ledgerData.length === 0) {
      alert("Please upload both files first.");
      return;
    }
    const result = reconcileData(ageDueData, ledgerData);
    setSummary(result);
    setSelectedParty(''); // Reset selection on new run
  };

  // --- HELPER FOR DOWNLOADS ---
  const handleSinglePartyDownload = () => {
    if(!selectedParty) {
        alert("Please select a party first!");
        return;
    }
    // This strictly passes ONLY the filtered results
    downloadAgeingReport(filteredResults);
  };

  const handleGlobalDownload = () => {
    if(!summary) return;
    // This passes EVERYTHING
    downloadAgeingReport(summary.results);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">Financial Reconciliation Tool</h1>

      {/* Upload Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold mb-4">1. Upload Route Age Due</h2>
          <input type="file" onChange={(e) => handleFileUpload(e, 'ageDue')} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          <div className="mt-4 text-sm text-gray-600">Loaded: <span className="font-bold">{ageDueData.length}</span> records</div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold mb-4">2. Upload Ledger</h2>
          <input type="file" onChange={(e) => handleFileUpload(e, 'ledger')} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:bg-green-50 file:text-green-700 hover:file:bg-green-100" />
          <div className="mt-4 text-sm text-gray-600">Loaded: <span className="font-bold">{ledgerData.length}</span> records</div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 mb-8">
        <button onClick={runMatching} disabled={ageDueData.length === 0 || ledgerData.length === 0} className="px-8 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-lg">Run Reconciliation Logic</button>
      </div>

      {summary && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* --- CONTROL PANEL --- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             
             {/* LEFT: Single Party Controls */}
             <div className="bg-white p-4 rounded-lg shadow border border-indigo-100">
                <h3 className="font-bold text-gray-700 mb-2">Single Party Actions</h3>
                <div className="flex flex-col gap-3">
                    <select 
                        value={selectedParty} 
                        onChange={(e) => setSelectedParty(e.target.value)}
                        className="p-2 border border-gray-300 rounded text-sm w-full"
                    >
                        <option value="">-- Select a Party --</option>
                        {uniqueParties.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    
                    <button 
                        onClick={handleSinglePartyDownload}
                        disabled={!selectedParty}
                        className="w-full py-2 bg-indigo-600 text-white font-semibold rounded hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                        Download Report for {selectedParty ? selectedParty.substring(0, 15) + '...' : 'Selected'}
                    </button>
                </div>
             </div>

             {/* RIGHT: Global Controls */}
             <div className="bg-white p-4 rounded-lg shadow border border-gray-200 bg-gray-50">
                <h3 className="font-bold text-gray-700 mb-2">Global Actions (All Data)</h3>
                <div className="flex flex-col gap-3">
                    <button 
                        onClick={handleGlobalDownload}
                        className="w-full py-2 bg-green-600 text-white font-semibold rounded hover:bg-green-700 transition-colors"
                    >
                        Download Ageing Report (All Parties)
                    </button>
                    <button 
                         onClick={() => downloadReconciliationReport(summary.results)}
                         className="w-full py-2 bg-gray-600 text-white font-semibold rounded hover:bg-gray-700 transition-colors"
                    >
                        Download Detailed Match List (All)
                    </button>
                </div>
             </div>
          </div>

          {/* --- VIEW SECTION --- */}
          <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
             <div className="border-b border-gray-200 flex">
                <button onClick={() => setViewMode('reconciliation')} className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${viewMode === 'reconciliation' ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Detailed Match List</button>
                <button onClick={() => setViewMode('ageing')} className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${viewMode === 'ageing' ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Ageing Report View</button>
             </div>
             
             <div className="p-0">
                {viewMode === 'reconciliation' ? (
                  <div className="overflow-x-auto p-2">
                    <p className="text-sm text-gray-500 mb-2 px-2">Showing: {selectedParty ? selectedParty : 'All Parties'}</p>
                    <table className="min-w-full divide-y divide-gray-200 border">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Party</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Corrected Ref</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredResults.map((row) => (
                          <tr key={row.id} className={row.status === 'Matched' ? 'bg-green-50' : 'bg-red-50'}>
                            <td className="px-4 py-2 text-sm font-medium text-gray-900">{row.partyName}</td>
                            <td className="px-4 py-2 text-sm text-gray-500">{row.date}</td>
                            <td className="px-4 py-2 text-sm font-bold text-gray-700">{row.amount}</td>
                            <td className="px-4 py-2 text-xs font-semibold">{row.status}</td>
                            <td className="px-4 py-2 text-sm text-blue-600 font-bold">{row.correctedVoucherNo || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 bg-gray-50">
                    <p className="text-sm text-gray-500 mb-2">Previewing Ageing Report for: <strong>{selectedParty ? selectedParty : 'All Parties'}</strong></p>
                    <AgeingReport data={ageingData} />
                  </div>
                )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}