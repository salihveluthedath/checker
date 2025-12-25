import * as XLSX from "xlsx";
import { Transaction } from "@/types/transaction";

// Helper: Remove commas and ensure it's a valid number
const cleanAmount = (value: any): number => {
  if (typeof value === "number") return value;
  if (!value) return 0;
  // Remove commas and cast to float
  const str = String(value).replace(/,/g, "").trim();
  return parseFloat(str) || 0;
};

// Helper: Handle Excel Dates (serial numbers) or String Dates
const cleanDate = (value: any): string => {
  if (!value) return "";
  
  // 1. Handle Excel Serial Numbers (e.g., 45385)
  if (typeof value === "number") {
    const dateObj = new Date(Math.round((value - 25569) * 86400 * 1000));
    return dateObj.toISOString().split("T")[0];
  }

  // 2. Handle DD/MM/YYYY Strings (India/UK format)
  const str = String(value).trim();
  if (str.includes("/")) {
    const [part1, part2, part3] = str.split("/");
    // Heuristic: If first part > 12, it's definitely Day. Assume DD/MM/YYYY.
    // Excel usually exports dates consistently.
    const day = part1.length === 4 ? part3 : part1;
    const year = part1.length === 4 ? part1 : part3;
    const month = part2;
    
    // Return YYYY-MM-DD
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return str;
};

export async function parseExcel(file: File): Promise<Transaction[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  
  // Use "header: 1" to get raw arrays. This is safer than relying on specific column names like "Value Date"
  // which might change slightly between bank exports.
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

  // Skip the header row (slice(1)) and map
  const transactions: Transaction[] = [];

  rows.slice(1).forEach((row, index) => {
    // ADJUST INDICES: Look at your Excel file to be sure.
    // Based on your previous code: Date is likely Col 0, Debit Col 1, Credit Col 2?
    // If your headers are distinct, we can switch back to key-based, but cleaner logic is:
    
    // Attempt to find data by column index (safer for raw exports)
    const rawDate = row[0];   // Col A
    // Check if Debit is in Col B (1) or C (2)
    // Your ledger had: Date | Debit | Credit
    // Your bank had: Date | (Empty) | Debit | Credit ... varies.
    
    // Let's rely on the previous logic: if headers were working, use row keys?
    // Actually, raw index is safer if you know the structure.
    // Let's stick to the Keys if you prefer, but we must apply "cleanAmount"
  });

  // Re-implementing using your object-key style but with CLEANERS:
  const jsonRows = XLSX.utils.sheet_to_json<any>(sheet);
  
  return jsonRows.map((row, index) => {
    // Normalize keys: handling "Debit", "debit", "DEBIT" variations
    const getVal = (keyPart: string) => {
      const key = Object.keys(row).find(k => k.toLowerCase().includes(keyPart.toLowerCase()));
      return key ? row[key] : null;
    };

    const dateVal = getVal("date"); // Matches "Date", "Value Date", "Tx Date"
    const debitVal = getVal("debit") || getVal("withdrawal");
    const creditVal = getVal("credit") || getVal("deposit");

    const debit = cleanAmount(debitVal);
    const credit = cleanAmount(creditVal);
    
    // Determine type for your Transaction interface
    // (Assuming your Transaction type has 'type' and 'amount' fields, 
    // or if it strictly separates debit/credit, adjust accordingly)
    
    // If you need strictly the Transaction[] format we used in the UI:
    const amount = debit > 0 ? debit : credit;
    const type = debit > 0 ? "DEBIT" : "CREDIT";

    return {
      id: `row-${index}`,
      date: cleanDate(dateVal),
      debit: debit,   // Keep these if your interface asks for them
      credit: credit, // Keep these if your interface asks for them
      amount: amount, // For the reconciler logic
      type: type,     // For the reconciler logic
      raw: JSON.stringify(row)
    };
  }).filter(tx => tx.amount > 0); // Remove empty rows
}