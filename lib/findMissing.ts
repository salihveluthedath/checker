import * as XLSX from "xlsx";
import { Transaction } from "@/types/transaction";

// --- HELPER 1: CLEAN NUMBERS ---
const cleanAmount = (value: any): number => {
  if (typeof value === "number") return value;
  if (!value) return 0;
  // Remove commas and cast to float
  const str = String(value).replace(/,/g, "").trim();
  return parseFloat(str) || 0;
};

// --- HELPER 2: CLEAN DATES ---
const cleanDate = (value: any): string => {
  if (!value) return "";
  
  // 1. Handle Excel Serial Numbers (e.g., 45385)
  if (typeof value === "number") {
    // Excel base date is Dec 30, 1899
    const dateObj = new Date(Math.round((value - 25569) * 86400 * 1000));
    return dateObj.toISOString().split("T")[0];
  }

  // 2. Handle DD/MM/YYYY Strings or YYYY-MM-DD
  const str = String(value).trim();
  
  // If it matches DD/MM/YYYY or similar
  if (str.includes("/")) {
    const [part1, part2, part3] = str.split("/");
    
    // Heuristic: If first part is 4 digits, it's YYYY/MM/DD. Otherwise DD/MM/YYYY.
    const isYearFirst = part1.length === 4;
    
    const year = isYearFirst ? part1 : part3;
    const month = part2;
    const day = isYearFirst ? part3 : part1;
    
    // Return YYYY-MM-DD
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // Fallback: try standard date parse
  try {
      const d = new Date(str);
      if(!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  } catch (e) {
      // ignore
  }
  
  return str;
};

export async function parseExcel(file: File): Promise<Transaction[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  
  // Get data as objects (headers used as keys)
  const jsonRows = XLSX.utils.sheet_to_json<any>(sheet);
  
  return jsonRows.map((row, index) => {
    // Helper to find value case-insensitively (e.g. finds "Debit", "debit", "DEBIT Amount")
    const getVal = (keyParts: string[]) => {
      const keys = Object.keys(row);
      // Find a key that contains ANY of the keyParts
      const foundKey = keys.find(k => 
        keyParts.some(part => k.toLowerCase().includes(part.toLowerCase()))
      );
      return foundKey ? row[foundKey] : null;
    };

    // 1. Map Fields
    const dateVal = getVal(["date", "time"]); 
    const debitVal = getVal(["debit", "withdrawal", "dr"]);
    const creditVal = getVal(["credit", "deposit", "cr"]);
    const descVal = getVal(["description", "narration", "particulars", "details"]);

    // 2. Clean Data
    const debit = cleanAmount(debitVal);
    const credit = cleanAmount(creditVal);
    
    // 3. Determine Amount & Type
    // If both exist (rare), take the larger one, or rely on logic. 
    // Usually only one is > 0.
    const amount = debit > 0 ? debit : credit;
    const type: "DEBIT" | "CREDIT" = debit > 0 ? "DEBIT" : "CREDIT";

    return {
      id: `row-${index}-${Date.now()}`, // Unique ID
      date: cleanDate(dateVal),
      amount: amount,
      type: type,
      description: descVal ? String(descVal).trim() : "No Description",
      // Optional: keep raw debit/credit if your UI needs them specifically
      // debit: debit,
      // credit: credit,
    };
  }).filter(tx => tx.amount > 0); // Remove empty rows or header artifacts
}