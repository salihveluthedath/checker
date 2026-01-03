'use client';

import React, { useState, useMemo } from 'react';
import { reconcileData } from '@/utils/matcher';
import { parseAgeDueFile, parseLedgerFile } from '@/utils/parser';
import { downloadReconciliationReport, downloadSinglePartyReport, downloadAgeingReport } from '@/utils/exporter';
import { Transaction, ReconciliationSummary } from '@/types/reconciliation';
import AgeingReport from '@/components/AgeingReport';

export default function ReconciliationPage() {
  // --- 1. STATE DEFINITIONS ---
  const [ageDueData, setAgeDueData] = useState<Transaction[]>([]);
  const [ledgerData, setLedgerData] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  
  // This state now controls BOTH the download and the screen view
  const [selectedParty, setSelectedParty] = useState<string>('');
  
  const [viewMode, setViewMode] = useState<'reconciliation' | 'ageing'>('reconciliation');

  // --- 2. COMPUTED VALUES ---
  
  // Get list of unique parties for the dropdown
  const uniqueParties = useMemo(() => {
    if (!summary) return [];
    const names = new Set(summary.results.map(r => r.partyName));
    return Array.from(names).sort();
  }, [summary]);

  // NEW: Filter the results based on the dropdown selection
  const filteredResults = useMemo(() => {
    if (!summary) return [];
    if (!selectedParty) return summary.results; // Show all if nothing selected
    return summary.results.filter(r => r.partyName === selectedParty);
  }, [summary, selectedParty]);

  // Prepare Data for Ageing Report using the FILTERED results
  const ageingData = useMemo(() => {
    return filteredResults.map(r => ({
      id: r.id,
      date: r.date,
      partyName: r.partyName,
      referenceNo: r.correctedVoucherNo || r.voucherNo || 'N/A', 
      amount: r.amount
    }));
  }, [filteredResults]);

  // --- 3. HANDLERS ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'ageDue' | 'ledger') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const data = await file.arrayBuffer();
    
    if (type === 'ageDue') {
      setAgeDueData(parseAgeDueFile(data));
    } else {
      setLedgerData(parseLedgerFile(data));
    }
  };

  const runMatching = () => {
    if (ageDueData.length === 0 || ledgerData.length === 0) {
      alert("Please upload both files first.");
      return;
    }
    const result = reconcileData(ageDueData, ledgerData);
    setSummary(result);
    setSelectedParty(''); // Reset filter on new run
  };

  // --- 4. UI RENDER ---
  return (
    <div className="p-8 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">Financial Reconciliation Tool</h1>

      {/* Upload Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold mb-4">1. Upload Route Age Due</h2>
          <input 
            type="file" 
            accept=".xlsx, .xls, .csv" 
            onChange={(e) => handleFileUpload(e, 'ageDue')}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <div className="mt-4 text-sm text-gray-600">
            Loaded: <span className="font-bold">{ageDueData.length}</span> records
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold mb-4">2. Upload Ledger</h2>
          <input 
            type="file" 
            accept=".xlsx, .xls, .csv" 
            onChange={(e) => handleFileUpload(e, 'ledger')}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
          />
          <div className="mt-4 text-sm text-gray-600">
            Loaded: <span className="font-bold">{ledgerData.length}</span> records
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col items-center gap-4 mb-8">
        <button 
          onClick={runMatching}
          disabled={ageDueData.length === 0 || ledgerData.length === 0}
          className="px-8 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg"
        >
          Run Reconciliation Logic
        </button>

        {summary && (
          <div className="w-full max-w-5xl bg-white p-4 rounded-lg shadow border border-gray-200 mt-4 flex flex-wrap gap-4 items-center justify-between">
            
            <div className="flex gap-2">
                <button 
                  onClick={() => downloadReconciliationReport(summary.results)}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-bold rounded hover:bg-green-700 flex items-center gap-2"
                >
                  <span>Download Full Report</span>
                </button>

                <button 
                  onClick={() => downloadAgeingReport(summary.results)}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded hover:bg-indigo-700 flex items-center gap-2"
                >
                  <span>Download Ageing Report</span>
                </button>
            </div>

            {/* FILTER DROPDOWN */}
            <div className="flex items-center gap-2 bg-yellow-50 p-2 rounded border border-yellow-200">
              <span className="text-sm font-bold text-gray-800">Filter View:</span>
              <select 
                value={selectedParty}
                onChange={(e) => setSelectedParty(e.target.value)}
                className="p-2 border border-gray-300 rounded text-sm min-w-[200px]"
              >
                <option value="">-- Show All Parties --</option>
                {uniqueParties.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              
              <button 
                onClick={() => {
                  if(selectedParty) downloadSinglePartyReport(summary.results, selectedParty);
                }}
                disabled={!selectedParty}
                className="px-4 py-2 bg-purple-600 text-white text-sm font-bold rounded hover:bg-purple-700 disabled:opacity-50"
              >
                Download Excel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Results Section */}
      {summary && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Summary Stats (Always Global) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-green-500">
              <p className="text-gray-500 text-sm uppercase">Matched Successfully</p>
              <p className="text-3xl font-bold text-gray-800">{summary.matchedCount}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-red-500">
              <p className="text-gray-500 text-sm uppercase">Pending (Unmatched)</p>
              <p className="text-3xl font-bold text-gray-800">{summary.pendingCount}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-blue-500">
              <p className="text-gray-500 text-sm uppercase">Value Cleared</p>
              <p className="text-3xl font-bold text-gray-800">₹{summary.totalAmountCleared.toLocaleString()}</p>
            </div>
          </div>

          {/* VIEW TOGGLE & CONTENT */}
          <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
             
             {/* Tabs Header */}
             <div className="border-b border-gray-200 flex">
                <button
                    onClick={() => setViewMode('reconciliation')}
                    className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                        viewMode === 'reconciliation' 
                        ? 'border-blue-600 text-blue-600 bg-blue-50/50' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    Detailed Match List ({filteredResults.length})
                </button>
                <button
                    onClick={() => setViewMode('ageing')}
                    className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                        viewMode === 'ageing' 
                        ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                    Ageing Report View
                </button>
             </div>

             {/* Tab Content */}
             <div className="p-0">
                {/* KEY CHANGE: We now map over `filteredResults` instead of `summary.results`.
                   This ensures the table respects the dropdown selection.
                */}
                {viewMode === 'reconciliation' ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Party</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Original Ref</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Corrected Vh. No</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredResults.length > 0 ? (
                            filteredResults.map((row) => (
                            <tr key={row.id} className={row.status === 'Matched' ? 'bg-green-50/30' : 'bg-red-50/30'}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.partyName}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.date}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-700">₹{row.amount.toLocaleString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                    row.status === 'Matched' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                    {row.status}
                                </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{row.voucherNo || '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600">
                                {row.correctedVoucherNo || '-'}
                                </td>
                            </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                                    No records found for the selected party.
                                </td>
                            </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 bg-gray-50">
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