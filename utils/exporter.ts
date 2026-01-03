// utils/exporter.ts
import * as XLSX from 'xlsx-js-style'; // <--- MUST USE THIS IMPORT
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

// --- HELPER: Styles Configuration ---
const styles = {
  // The Big Centered Title at the top
  mainTitle: {
    font: { bold: true, sz: 14, name: "Calibri" },
    alignment: { horizontal: "center", vertical: "center" },
    fill: { fgColor: { rgb: "FFFFFF" } }
  },
  // The Gray Column Headers
  tableHeader: {
    font: { bold: true, name: "Calibri" },
    alignment: { horizontal: "center", vertical: "center" },
    fill: { fgColor: { rgb: "D9D9D9" } }, // Light Gray like screenshot
    border: {
      top: { style: "thin" }, bottom: { style: "thin" },
      left: { style: "thin" }, right: { style: "thin" }
    }
  },
  // Party Name Row (Bold Left)
  partyHeaderLeft: {
    font: { bold: true, name: "Calibri" },
    border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
  },
  // Party Total (Bold Right)
  partyHeaderRight: {
    font: { bold: true, name: "Calibri" },
    alignment: { horizontal: "right" },
    border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
  },
  // Normal Data Cells
  normalCell: {
    font: { name: "Calibri" },
    border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
  },
  // Centered Data (Date/Days)
  centerCell: {
    font: { name: "Calibri" },
    alignment: { horizontal: "center" },
    border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
  },
  // Footer/Total Row
  footerRow: {
    font: { bold: true, name: "Calibri" },
    alignment: { horizontal: "right" },
    border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }
  }
};

// --- FUNCTION 1: Download Match List (Standard) ---
export const downloadReconciliationReport = (results: MatchResult[]) => {
  const data = results.map(item => ({
    'Party Name': item.partyName,
    'Date': item.date,
    'Amount': item.amount,
    'Status': item.status, 
    'Corrected Vh. No': item.correctedVoucherNo || '-'
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Reconciliation Report');
  XLSX.writeFile(workbook, `Match_List.xlsx`);
};

// --- FUNCTION 2: PROFESSIONAL AGEING REPORT ---
export const downloadAgeingReport = (results: MatchResult[]) => {
  const REPORT_DATE = new Date('2026-01-02');
  
  // 1. Group Data
  const groups: Record<string, MatchResult[]> = {};
  results.forEach(r => {
    if (!groups[r.partyName]) groups[r.partyName] = [];
    groups[r.partyName].push(r);
  });

  const uniqueParties = Object.keys(groups).sort();
  
  // 2. Filename & Title Logic
  let fileName = `Ageing_Report.xlsx`;
  let mainTitle = "AGEING REPORT"; 

  if (uniqueParties.length === 1) {
    const partyName = uniqueParties[0];
    const safeName = partyName.replace(/[^a-zA-Z0-9 ]/g, "").trim().replace(/\s+/g, "_");
    fileName = `${safeName}_Ageing.xlsx`;
    mainTitle = partyName; 
  }

  // 3. Build Data Rows
  const rows: any[][] = [];

  // ROW 1: Main Title
  rows.push([mainTitle, '', '', '', '', '', '', '', '']); 

  // ROW 2: Column Headers
  rows.push([
    'References', 'Tot. Amt', 'Date', 'Days', 'Bill. Amt', 
    '1 To 30 Days', '31 To 60 Days', '61 To 120 Days', '121 To 360 Days'
  ]);

  // Keep track of which rows need which styles
  const stylingMap: { index: number, type: 'partyHeader' | 'detail' | 'total' }[] = [];

  uniqueParties.forEach(partyName => {
    const txns = groups[partyName];
    let totalAmt = 0;
    const bucketTotals: any = { '1-30': 0, '31-60': 0, '61-120': 0, '121-360': 0, '360+': 0 };

    txns.forEach(t => {
       const d = differenceInDays(REPORT_DATE, parseISO(t.date));
       const b = getBucket(d);
       totalAmt += t.amount;
       if (bucketTotals[b] !== undefined) bucketTotals[b] += t.amount;
    });

    // --- A. PARTY HEADER ROW ---
    stylingMap.push({ index: rows.length, type: 'partyHeader' });
    rows.push([
      `${partyName}#`,  // References (Bold Left)
      totalAmt,         // Tot. Amt (Bold Right)
      '', '', '', '', '', '', ''
    ]);

    // --- B. DETAIL ROWS ---
    txns.forEach(txn => {
      const txnDate = parseISO(txn.date);
      const days = differenceInDays(REPORT_DATE, txnDate);
      const bucket = getBucket(days);

      stylingMap.push({ index: rows.length, type: 'detail' });
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

    // --- C. FOOTER TOTAL ROW ---
    stylingMap.push({ index: rows.length, type: 'total' });
    rows.push([
      `${partyName} Total`, '', '', '', 
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

  // --- 5. APPLY VISUAL STYLES ---

  // A. Main Title (Merged & Centered)
  if(!worksheet['!merges']) worksheet['!merges'] = [];
  worksheet['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }); // Merge A1:I1
  if(worksheet['A1']) worksheet['A1'].s = styles.mainTitle;

  // B. Column Headers (Gray Background) - Row 1 (Index 1)
  ['A','B','C','D','E','F','G','H','I'].forEach(col => {
    const cell = worksheet[`${col}2`];
    if(cell) cell.s = styles.tableHeader;
  });

  // C. Row Styles Loop
  stylingMap.forEach(item => {
    const r = item.index; // Row Index
    const rExcel = r + 1; // Excel 1-based Row Number

    if (item.type === 'partyHeader') {
      // Party Name
      if(worksheet[`A${rExcel}`]) worksheet[`A${rExcel}`].s = styles.partyHeaderLeft;
      // Party Total
      if(worksheet[`B${rExcel}`]) worksheet[`B${rExcel}`].s = styles.partyHeaderRight;
      // Empty Borders for the rest
      ['C','D','E','F','G','H','I'].forEach(c => {
         if(worksheet[`${c}${rExcel}`]) worksheet[`${c}${rExcel}`].s = styles.normalCell;
      });
    } 
    else if (item.type === 'detail') {
      // All cells get borders
      ['A','B','E','F','G','H','I'].forEach(c => {
        if(worksheet[`${c}${rExcel}`]) worksheet[`${c}${rExcel}`].s = styles.normalCell;
      });
      // Center Date & Days
      if(worksheet[`C${rExcel}`]) worksheet[`C${rExcel}`].s = styles.centerCell;
      if(worksheet[`D${rExcel}`]) worksheet[`D${rExcel}`].s = styles.centerCell;
    }
    else if (item.type === 'total') {
      // Bold Text aligned Right for totals
      ['A','B','C','D','E','F','G','H','I'].forEach(c => {
         if(worksheet[`${c}${rExcel}`]) worksheet[`${c}${rExcel}`].s = styles.footerRow;
      });
    }
  });

  // 6. Column Widths (Matches screenshot)
  worksheet['!cols'] = [
    { wch: 35 }, // Ref
    { wch: 15 }, // Tot Amt
    { wch: 12 }, // Date
    { wch: 8 },  // Days
    { wch: 15 }, // Bill Amt
    { wch: 15 }, // 1-30
    { wch: 15 }, // 31-60
    { wch: 15 }, // 61-120
    { wch: 15 }  // 121-360
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ageing Report');
  XLSX.writeFile(workbook, fileName);
};