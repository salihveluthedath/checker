'use client';

import React, { useMemo } from 'react';
import { differenceInDays, parseISO, format } from 'date-fns';

// --- 1. Define Interface Locally to prevent Type Mismatches ---
export interface ReportTransaction {
  id: string;
  date: string; // ISO format 'YYYY-MM-DD'
  partyName: string;
  referenceNo: string; // The 'Corrected Vh No'
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

// --- 2. Configuration ---
const BUCKETS = [
  { label: '1 To 30 Days', min: 1, max: 30 },
  { label: '31 To 60 Days', min: 31, max: 60 },
  { label: '61 To 120 Days', min: 61, max: 120 },
  { label: '121 To 360 Days', min: 121, max: 360 },
];

const REPORT_DATE = new Date('2026-01-02'); 

// --- 3. Helpers ---
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

const HeaderCell = ({ label, align = 'left', width }: { label: string, align?: 'left'|'right'|'center', width?: string }) => (
  <th className={`border border-black px-1 py-0.5 font-normal text-${align} whitespace-nowrap bg-gray-50 ${width || ''}`}>
    <div className="flex items-center justify-between gap-1 overflow-hidden">
      <span className={`truncate ${align === 'right' ? 'flex-1 text-right' : ''}`}>{label}</span>
      <span className="text-[10px] text-gray-500 border border-gray-300 rounded px-0.5 bg-white shrink-0">▼</span>
    </div>
  </th>
);

const FooterTotalCell = ({ value }: { value: number }) => (
  <td className="border border-black px-1 py-0.5 text-right align-bottom">
    <div className="border-t border-black pt-0.5 whitespace-nowrap border-double border-b-4 border-b-transparent">
      {formatCurrency(value, true)}
    </div>
  </td>
);

// --- 4. Main Component ---
// This explicit interface definition fixes the "IntrinsicAttributes" error
export default function AgeingReport({ data = [] }: { data?: ReportTransaction[] }) {
  
  // --- Data Transformation Logic ---
  const groupedData = useMemo(() => {
    // Safety check
    if (!data || !Array.isArray(data)) return [];

    const groups: Record<string, ProcessedGroup> = {};

    data.forEach((txn) => {
      // Ensure we have valid data before processing
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
      
      // Update Totals
      group.totalAmount += txn.amount;
      if (bucketIndex !== -1) {
        group.bucketTotals[bucketIndex] += txn.amount;
      }

      // Add Bill
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

  // If no data is passed
  if (!data || data.length === 0) {
    return <div className="p-4 text-gray-500 text-center italic">No data available for report.</div>;
  }

  return (
    <div className="font-sans text-xs text-black overflow-x-auto">
      <div className="border border-black min-w-[800px]">
        
        {/* --- Main Title Row --- */}
        <div className="text-center font-bold text-lg py-1 border-b border-black">
           AGEING REPORT
        </div>

        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr className="bg-white">
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
                
                {/* 1. Party Header Row */}
                <tr className="bg-white">
                  <td className="border border-black px-1 py-0.5 whitespace-nowrap overflow-hidden text-ellipsis font-semibold">
                    {group.partyName}#
                  </td>
                  <td className="border border-black px-1 py-0.5 text-right whitespace-nowrap font-semibold">
                    {formatCurrency(group.totalAmount)}
                  </td>
                  <td className="border border-black px-1 py-0.5"></td>
                  <td className="border border-black px-1 py-0.5"></td>
                  <td className="border border-black px-1 py-0.5"></td>
                  {BUCKETS.map((_, i) => (
                    <td key={i} className="border border-black px-1 py-0.5"></td>
                  ))}
                </tr>

                {/* 2. Bill Rows */}
                {group.bills.map((bill, bIdx) => (
                  <tr key={`${gIdx}-${bIdx}`} className="bg-white hover:bg-gray-50">
                    <td className="border border-black px-1 py-0.5 font-bold whitespace-nowrap overflow-hidden text-ellipsis pl-4">
                      {bill.reference}
                    </td>
                    <td className="border border-black px-1 py-0.5"></td>
                    <td className="border border-black px-1 py-0.5 text-center whitespace-nowrap">
                      {format(parseISO(bill.date), 'dd/MM/yyyy')}
                    </td>
                    <td className="border border-black px-1 py-0.5 text-center">
                      {bill.days}
                    </td>
                    <td className="border border-black px-1 py-0.5 text-right whitespace-nowrap">
                      {formatCurrency(bill.amount)}
                    </td>

                    {BUCKETS.map((_, i) => (
                      <td key={i} className="border border-black px-1 py-0.5 text-right whitespace-nowrap">
                        {i === bill.bucketIndex ? formatCurrency(bill.amount) : ''}
                      </td>
                    ))}
                  </tr>
                ))}

                {/* 3. Footer Total Row */}
                <tr className="bg-white font-medium border-t-2 border-black">
                  <td className="border border-black px-1 py-0.5 whitespace-nowrap text-right pr-2">
                    {group.partyName} Total
                  </td>
                  <td className="border border-black px-1 py-0.5"></td>
                  <td className="border border-black px-1 py-0.5"></td>
                  <td className="border border-black px-1 py-0.5"></td>
                  
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
  );
}