import * as XLSX from 'xlsx'; // <--- This was missing
import { Transaction } from '@/types/reconciliation';

// Helper to clean currency strings (e.g., "2,886.00 Dr." -> 2886.00)
const cleanAmount = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  // Remove commas, "Dr", "Cr", and whitespace
  const cleanStr = val.toString().replace(/,/g, '').replace(/ [DC]r\.?/i, '').trim();
  return parseFloat(cleanStr) || 0;
};

// Helper to parse Excel dates
const parseDate = (val: any): string => {
  if (!val) return '';
  // If it's an Excel serial date number
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
  }
  // If it's a string like "30/12/2025"
  if (typeof val === 'string') {
    const parts = val.split('/');
    if (parts.length === 3) {
      // Convert DD/MM/YYYY to YYYY-MM-DD
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  return String(val);
};

export const parseAgeDueFile = (fileData: ArrayBuffer): Transaction[] => {
  const workbook = XLSX.read(fileData, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  // Use header:1 to get an array of arrays (rows)
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

  const transactions: Transaction[] = [];
  let currentParty = '';

  // Skip header (Row 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const col0 = row[0]; // References / Party Name / Voucher Ref
    const colDate = row[2]; // Date column index (0-based)
    const colAmount = row[4]; // Amount column index (0-based)

    const isTotalRow = String(col0).includes('Total');
    const hasDate = !!colDate;

    // Logic to distinguish Party Header from Transaction Row
    if (!hasDate && col0 && !isTotalRow) {
      // It's a Party Name Header
      currentParty = String(col0).trim();
    } else if (hasDate && !isTotalRow) {
      // It's a Transaction Row
      const amount = cleanAmount(colAmount);
      
      // If col0 has a value, it is likely the Voucher Ref in Age Due
      const ageDueRef = col0 ? String(col0) : undefined;

      if (amount > 0) {
        transactions.push({
          id: `AD-${i}`,
          partyName: currentParty || 'Unknown',
          date: parseDate(colDate),
          amount: amount,
          voucherNo: ageDueRef
        });
      }
    }
  }
  return transactions;
};

export const parseLedgerFile = (fileData: ArrayBuffer): Transaction[] => {
  const workbook = XLSX.read(fileData, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(sheet); 

  return rows.map((row, index) => {
    // ADJUST THESE KEYS based on your actual Excel header names
    const dateVal = row['Date'] || row['Entry-Date']; 
    const debitVal = row['Debit'] || row['Amount']; 
    
    // Capture Vh. No
    const vhNo = row['Vh. No'] || row['Ref'] || row['Vh.Type']; 
    const partyVal = row['Particulars'] || 'Ledger Entry';

    return {
      id: `L-${index}`,
      partyName: partyVal,
      date: parseDate(dateVal),
      amount: cleanAmount(debitVal),
      voucherNo: vhNo ? String(vhNo) : undefined
    };
  });
};