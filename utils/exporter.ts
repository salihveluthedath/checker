import * as XLSX from 'xlsx';
import { MatchResult } from '@/types/reconciliation';
import { differenceInDays, parseISO, format } from 'date-fns';

// --- HELPER: Bucket Logic ---
const getBucket = (days: number) => {
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 120) return '61-120';
  if (days <= 360) return '121-360';
  return '360+';
};

// --- FUNCTION 1: Download Match List (Standard) ---
export const downloadReconciliationReport = (results: MatchResult[]) => {
  const data = results.map(item => ({
    'Party Name': item.partyName,
    'Date': item.date,
    'Amount': item.amount,
    'Status': item.status, 
    'Match Method': item.matchMethod || '-', 
    'Ledger Ref ID': item.ledgerRef || '-',
    'Corrected Vh. No': item.correctedVoucherNo || '-'
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 15 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Reconciliation Report');
  XLSX.writeFile(workbook, `Reconciliation_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
};

// --- FUNCTION 2: Download Ageing Report (Centered & Bold Header) ---
export const downloadAgeingReport = (results: MatchResult[]) => {
  const REPORT_DATE = new Date('2026-01-02');
  
  // 1. Group Data
  const groups: Record<string, MatchResult[]> = {};
  results.forEach(r => {
    if (!groups[r.partyName]) groups[r.partyName] = [];
    groups[r.partyName].push(r);
  });

  const uniqueParties = Object.keys(groups).sort();
  
  // 2. Determine File Name & Header Title
  let fileName = `Ageing_Report.xlsx`;
  let mainTitle = "AGEING REPORT"; 

  if (uniqueParties.length === 1) {
    const partyName = uniqueParties[0];
    const safeName = partyName.replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "_");
    fileName = `${safeName}_Ageing.xlsx`;
    mainTitle = partyName; // Use Party Name as Main Header
  }

  // 3. Build Layout (Array of Arrays)
  const rows: any[][] = [];

  // ROW 1: Main Header (Will be merged and centered)
  rows.push([mainTitle]); 

  // ROW 2: Column Headers
  rows.push([
    'References', 'Tot. Amt', 'Date', 'Days', 'Bill. Amt', 
    '1 To 30 Days', '31 To 60 Days', '61 To 120 Days', '121 To 360 Days'
  ]);

  // Track rows where Party Headers appear to bold them later
  const partyHeaderRowIndices: number[] = [];

  uniqueParties.forEach(partyName => {
    const txns = groups[partyName];
    
    // Calculate Totals
    let totalAmt = 0;
    const bucketTotals: any = { '1-30': 0, '31-60': 0, '61-120': 0, '121-360': 0, '360+': 0 };

    txns.forEach(t => {
       const d = differenceInDays(REPORT_DATE, parseISO(t.date));
       const b = getBucket(d);
       totalAmt += t.amount;
       if (bucketTotals[b] !== undefined) bucketTotals[b] += t.amount;
    });

    // --- Party Header Row ---
    partyHeaderRowIndices.push(rows.length); // Save index for styling
    rows.push([
      `${partyName}#`,  
      totalAmt,         
      '', '', '', '', '', '', ''
    ]);

    // --- Detail Rows ---
    txns.forEach(txn => {
      const txnDate = parseISO(txn.date);
      const days = differenceInDays(REPORT_DATE, txnDate);
      const bucket = getBucket(days);

      rows.push([
        txn.correctedVoucherNo || txn.voucherNo, 
        '',                                      
        format(txnDate, 'dd/MM/yyyy'),           
        days,                                    
        txn.amount,                              
        bucket === '1-30' ? txn.amount : '',     
        bucket === '31-60' ? txn.amount : '',    
        bucket === '61-120' ? txn.amount : '',   
        bucket === '121-360' ? txn.amount : ''   
      ]);
    });

    // --- Footer Row ---
    rows.push([
      `${partyName} Total`,    
      '', '', '',
      totalAmt,                
      bucketTotals['1-30'],    
      bucketTotals['31-60'],   
      bucketTotals['61-120'],  
      bucketTotals['121-360']  
    ]);

    rows.push([]); // Spacer
  });

  // 4. Create Sheet
  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  // --- STYLING LOGIC ---

  // A. Merge Main Header (A1 to I1) to Center it visually
  if(!worksheet['!merges']) worksheet['!merges'] = [];
  worksheet['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }); 

  // B. Apply "Bold" and "Center" styles manually to the cell objects
  // Note: This modifies the sheet object directly.
  
  // 1. Style Main Title (A1)
  const mainHeaderCell = worksheet[XLSX.utils.encode_cell({r: 0, c: 0})];
  if (mainHeaderCell) {
    mainHeaderCell.s = { 
      font: { bold: true, sz: 14 }, 
      alignment: { horizontal: "center", vertical: "center" } 
    };
  }

  // 2. Style Column Headers (Row 2, Index 1)
  const colHeaderRowIndex = 1;
  for (let c = 0; c <= 8; c++) {
    const cellRef = XLSX.utils.encode_cell({r: colHeaderRowIndex, c: c});
    if (worksheet[cellRef]) {
      worksheet[cellRef].s = { 
        font: { bold: true }, 
        alignment: { horizontal: "center" },
        fill: { fgColor: { rgb: "EEEEEE" } } // Light Gray Background
      };
    }
  }

  // 3. Style Party Headers (Name & Total)
  partyHeaderRowIndices.forEach(rowIndex => {
    // Party Name Cell (Col A)
    const nameRef = XLSX.utils.encode_cell({r: rowIndex, c: 0});
    if (worksheet[nameRef]) worksheet[nameRef].s = { font: { bold: true } };
    
    // Party Total Cell (Col B)
    const totalRef = XLSX.utils.encode_cell({r: rowIndex, c: 1});
    if (worksheet[totalRef]) worksheet[totalRef].s = { font: { bold: true } };
  });

  // 5. Set Widths
  worksheet['!cols'] = [
    { wch: 40 }, // A: References
    { wch: 15 }, // B: Tot. Amt
    { wch: 12 }, // C: Date
    { wch: 8 },  // D: Days
    { wch: 15 }, // E: Bill. Amt
    { wch: 15 }, // F: 1-30
    { wch: 15 }, // G: 31-60
    { wch: 15 }, // H: 61-120
    { wch: 15 }  // I: 121-360
  ];

  // 6. Generate File
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ageing Report');
  XLSX.writeFile(workbook, fileName);
};

// --- FUNCTION 3: Single Party (Fallback) ---
export const downloadSinglePartyReport = (results: MatchResult[], partyName: string) => {
  const partyData = results.filter(r => r.partyName === partyName);
  if (partyData.length === 0) { alert("No records found."); return; }

  const data = partyData.map(item => ({
    'Date': item.date,
    'Party Name': item.partyName,
    'Original Ref': item.voucherNo || '-',
    'Corrected Vh. No': item.correctedVoucherNo || 'NOT FOUND',
    'Amount': item.amount,
    'Status': item.status,
    'Match Type': item.matchMethod || '-'
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 20 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, partyName.substring(0, 30));
  XLSX.writeFile(workbook, `${partyName}_Corrected_Age_Due.xlsx`);
};