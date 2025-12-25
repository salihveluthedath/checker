// lib/parseExcel.ts
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
    // Heuristic: If first part > 4 chars (likely year) or strictly 4 digits, assume YYYY/MM/DD
    // Otherwise assume DD/MM/YYYY
    const isYearFirst = part1.length === 4;
    
    const year = isYearFirst ? part1 : part3;
    const month = part2;
    const day = isYearFirst ? part3 : part1;
    
    // Return YYYY-MM-DD
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
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
    // Helper: Find value case-insensitively across multiple possible header names
    const getVal = (keyParts: string[]) => {
      const keys = Object.keys(row);
      const foundKey = keys.find(k => 
        keyParts.some(part => k.toLowerCase().includes(part.toLowerCase()))
      );
      return foundKey ? row[foundKey] : null;
    };

    // 1. Map Fields (Flexible matching for different bank formats)
    const dateVal = getVal(["date", "time"]); 
    const debitVal = getVal(["debit", "withdrawal", "dr"]);
    const creditVal = getVal(["credit", "deposit", "cr"]);
    // Added Description Mapping
    const descVal = getVal(["description", "narration", "particulars", "details"]);

    // 2. Clean Data
    const debit = cleanAmount(debitVal);
    const credit = cleanAmount(creditVal);
    
    // 3. Determine Amount & Type
    const amount = debit > 0 ? debit : credit;
    const type: "DEBIT" | "CREDIT" = debit > 0 ? "DEBIT" : "CREDIT";

    return {
      id: `row-${index}-${Date.now()}`,
      date: cleanDate(dateVal),
      amount: amount,
      type: type,
      description: descVal ? String(descVal).trim() : "No Description", // Critical for UI
      debit: debit,  // Optional: Keep if interface needs it
      credit: credit, // Optional: Keep if interface needs it
      raw: JSON.stringify(row)
    };
  }).filter(tx => tx.amount > 0); // Remove empty rows
}