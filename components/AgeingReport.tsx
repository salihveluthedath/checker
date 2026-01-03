'use client';

import React, { useMemo } from 'react';
import { differenceInDays, parseISO, format } from 'date-fns';

// --- Types ---
export interface ReportTransaction {
  id: string;
  date: string; 
  partyName: string;
  referenceNo: string; 
  amount: number;
}

interface ProcessedGroup {
  partyName: string;
  totalAmount: number;
  bills: {
    reference: string;
    date: string;
    days: number;
    amount: number;
    bucketIndex: number;
  }[];
  bucketTotals: number[];
}

// --- Configuration ---
const BUCKETS = [
  { label: '1-30 Days', min: 1, max: 30 },
  { label: '31-60 Days', min: 31, max: 60 },
  { label: '61-120 Days', min: 61, max: 120 },
  { label: '121-360 Days', min: 121, max: 360 },
];

const REPORT_DATE = new Date('2026-01-02'); 

// --- Helpers ---
const formatCurrency = (val: number, isTotalRow = false) => {
  if (val === 0 && isTotalRow) return "0.00 Cr.";
  if (val === 0) return ""; 

  const absVal = Math.abs(val);
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absVal);

  return `${formatted} ${val >= 0 ? 'Dr.' : 'Cr.'}`;
};

// --- Main Component ---
export default function AgeingReport({ data = [] }: { data?: ReportTransaction[] }) {
  
  // --- Data Transformation ---
  const groupedData = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];

    const groups: Record<string, ProcessedGroup> = {};

    data.forEach((txn) => {
      if (!txn.partyName) return;

      if (!groups[txn.partyName]) {
        groups[txn.partyName] = {
          partyName: txn.partyName,
          totalAmount: 0,
          bills: [],
          bucketTotals: new Array(BUCKETS.length).fill(0),
        };
      }

      const group = groups[txn.partyName];
      const txnDate = parseISO(txn.date);
      const daysOld = differenceInDays(REPORT_DATE, txnDate);

      // Determine Bucket
      const bucketIndex = BUCKETS.findIndex(b => daysOld >= b.min && daysOld <= b.max);
      
      group.totalAmount += txn.amount;
      if (bucketIndex !== -1) {
        group.bucketTotals[bucketIndex] += txn.amount;
      }

      group.bills.push({
        reference: txn.referenceNo,
        date: txn.date,
        days: daysOld,
        amount: txn.amount,
        bucketIndex,
      });
    });

    return Object.values(groups);
  }, [data]);

  if (!data || data.length === 0) {
    return <div className="p-6 text-center text-gray-500 italic">No data available.</div>;
  }

  return (
    <div className="font-sans text-xs text-black">
      
      {/* ======================= */}
      {/* 1. MOBILE VIEW (CARDS)  */}
      {/* ======================= */}
      <div className="md:hidden space-y-4">
        <h2 className="text-center font-bold text-lg border-b border-black pb-2 mb-4">AGEING REPORT</h2>
        
        {groupedData.map((group, gIdx) => (
          <div key={gIdx} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            
            {/* Party Header Card */}
            <div className="bg-gray-100 p-3 border-b border-gray-200 flex justify-between items-center">
              <span className="font-bold text-sm text-gray-800">{group.partyName}</span>
              <span className="font-bold text-sm text-blue-700">{formatCurrency(group.totalAmount)}</span>
            </div>

            {/* List of Bills */}
            <div className="divide-y divide-gray-100">
              {group.bills.map((bill, bIdx) => (
                <div key={bIdx} className="p-3">
                  <div className="flex justify-between mb-1">
                    <span className="font-bold text-gray-700">{bill.reference}</span>
                    <span className="text-gray-500">{format(parseISO(bill.date), 'dd/MM/yy')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div>
                       <span className="text-[10px] uppercase text-gray-400 mr-2">Amount</span>
                       <span className="font-semibold">{formatCurrency(bill.amount)}</span>
                    </div>
                    <div className="text-right">
                       <span className="text-[10px] uppercase text-gray-400 mr-1">Age</span>
                       <span className="font-bold text-red-600">{bill.days} Days</span>
                    </div>
                  </div>
                  {/* Bucket Tag */}
                  <div className="mt-2 text-right">
                    <span className="inline-block bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full border border-gray-200">
                      {BUCKETS[bill.bucketIndex]?.label || '360+ Days'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Party Footer Card */}
            <div className="bg-gray-50 p-2 border-t border-gray-200 text-right">
              <span className="text-[10px] text-gray-500 mr-2">TOTAL OUTSTANDING:</span>
              <span className="font-bold text-sm">{formatCurrency(group.totalAmount)}</span>
            </div>
          </div>
        ))}
      </div>


      {/* ======================== */}
      {/* 2. DESKTOP VIEW (TABLE)  */}
      {/* ======================== */}
      <div className="hidden md:block overflow-x-auto">
        <div className="border border-black min-w-[800px]">
          
          <div className="text-center font-bold text-lg py-1 border-b border-black">
             AGEING REPORT
          </div>

          <table className="w-full border-collapse table-fixed">
            <thead>
              <tr className="bg-gray-100">
                <HeaderCell label="References" width="w-48" />
                <HeaderCell label="Tot. Amt" align="right" width="w-24" />
                <HeaderCell label="Date" align="center" width="w-20" />
                <HeaderCell label="Days" align="center" width="w-12" />
                <HeaderCell label="Bill. Amt" align="right" width="w-24" />
                {BUCKETS.map((b) => (
                  <HeaderCell key={b.label} label={b.label} align="right" />
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedData.map((group, gIdx) => (
                <React.Fragment key={gIdx}>
                  
                  {/* Party Header Row */}
                  <tr className="bg-white">
                    <td className="border border-black px-1 py-1 font-bold truncate">
                      {group.partyName}#
                    </td>
                    <td className="border border-black px-1 py-1 text-right font-bold">
                      {formatCurrency(group.totalAmount)}
                    </td>
                    <td className="border border-black px-1 py-1"></td>
                    <td className="border border-black px-1 py-1"></td>
                    <td className="border border-black px-1 py-1"></td>
                    {BUCKETS.map((_, i) => (
                      <td key={i} className="border border-black px-1 py-1"></td>
                    ))}
                  </tr>

                  {/* Bill Rows */}
                  {group.bills.map((bill, bIdx) => (
                    <tr key={`${gIdx}-${bIdx}`} className="bg-white hover:bg-yellow-50">
                      <td className="border border-black px-1 py-0.5 font-semibold text-gray-700 pl-4 truncate">
                        {bill.reference}
                      </td>
                      <td className="border border-black px-1 py-0.5"></td>
                      <td className="border border-black px-1 py-0.5 text-center">
                        {format(parseISO(bill.date), 'dd/MM/yyyy')}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-center">
                        {bill.days}
                      </td>
                      <td className="border border-black px-1 py-0.5 text-right">
                        {formatCurrency(bill.amount)}
                      </td>

                      {BUCKETS.map((_, i) => (
                        <td key={i} className="border border-black px-1 py-0.5 text-right">
                          {i === bill.bucketIndex ? formatCurrency(bill.amount) : ''}
                        </td>
                      ))}
                    </tr>
                  ))}

                  {/* Footer Total Row */}
                  <tr className="bg-gray-50 font-bold border-t-2 border-black">
                    <td className="border border-black px-1 py-1 text-right pr-2 text-gray-600">
                      {group.partyName} Total
                    </td>
                    <td className="border border-black px-1 py-1"></td>
                    <td className="border border-black px-1 py-1"></td>
                    <td className="border border-black px-1 py-1"></td>
                    
                    <FooterTotalCell value={group.totalAmount} />
                    
                    {group.bucketTotals.map((total, i) => (
                      <FooterTotalCell key={i} value={total} />
                    ))}
                  </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

const HeaderCell = ({ label, align = 'left', width }: { label: string, align?: 'left'|'right'|'center', width?: string }) => (
  <th className={`border border-black px-1 py-1 font-bold text-${align} whitespace-nowrap bg-gray-200 ${width || ''}`}>
    <div className="flex items-center justify-between gap-1 px-1">
      <span className={`truncate ${align === 'right' ? 'flex-1 text-right' : ''}`}>{label}</span>
    </div>
  </th>
);

const FooterTotalCell = ({ value }: { value: number }) => (
  <td className="border border-black px-1 py-1 text-right align-bottom bg-gray-50">
    <div className="border-b-4 border-double border-black inline-block w-full">
      {formatCurrency(value, true)}
    </div>
  </td>
);