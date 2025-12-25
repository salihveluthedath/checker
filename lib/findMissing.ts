import * as XLSX from "xlsx";
import { Transaction } from "@/types/transaction";

// --- HELPER 1: CLEAN NUMBERS (Fixes the "67 vs 67,675" bug) ---
const parseAmount = (value: any): number => {
  if (typeof value === "number") return value; // Already a number
  if (!value) return 0;

  // 1. Convert to string
  let str = String(value);
  
  // 2. Remove all commas (Handle "1,00,000.00" -> "100000.00")
  str = str.replace(/,/g, ""); 
  
  // 3. Remove currency symbols or text if any
  str = str.replace(/[^\d.-]/g, ""); 

  return parseFloat(str) || 0;
};

// --- HELPER 2: CLEAN DATES (Fixes the "02/04" Feb vs April bug) ---
const parseDate = (value: any): string => {
  if (!value) return "Invalid Date";

  // Handle Excel Serial Numbers (e.g., 45385)
  if (typeof value === 'number') {
    const dateObj = new Date(Math.round((value - 25569) * 86400 * 1000));
    return dateObj.toISOString().split('T')[0];
  }

  const str = String(value).trim();

  // Handle "DD/MM/YYYY" (Indian/UK format)
  // Logic: Split by slash or dash
  if (str.match(/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/)) {
    const parts = str.split(/[/-]/);
    const part1 = parseInt(parts[0]);
    const part2 = parseInt(parts[1]);
    const year = parts[2];

    // Assumption: If first part > 12, it's definitely Day. 
    // If your data is CONSISTENTLY DD/MM, force day = part1.
    const day = part1;
    const month = part2; 

    // Return YYYY-MM-DD for consistency
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Fallback for standard ISO or other formats
  try {
    return new Date(str).toISOString().split('T')[0];
  } catch (e) {
    return str;
  }
};

export const parseExcel = async (file: File): Promise<Transaction[]> => {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Get raw data (array of arrays)
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
  
  const transactions: Transaction[] = [];

  // Skip header (start at index 1)
  jsonData.slice(1).forEach((row, index) => {
    // ADJUST THESE INDICES based on your specific Excel columns
    // Based on your screenshots: Date(0), Debit(1), Credit(2)
    
    const rawDate = row[0];
    const rawDebit = row[1];
    const rawCredit = row[2];

    const amountDebit = parseAmount(rawDebit);
    const amountCredit = parseAmount(rawCredit);

    let amount = 0;
    let type: "DEBIT" | "CREDIT" = "DEBIT";

    if (amountDebit > 0) {
      amount = amountDebit;
      type = "DEBIT";
    } else if (amountCredit > 0) {
      amount = amountCredit;
      type = "CREDIT";
    }

    if (amount > 0) {
      transactions.push({
        id: `tx-${index}-${Math.random()}`,
        date: parseDate(rawDate),