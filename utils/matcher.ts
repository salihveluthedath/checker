import { Transaction, MatchResult, ReconciliationSummary } from '@/types/reconciliation';

// Helper to check date difference in days
const getDaysDiff = (d1: string, d2: string): number => {
  if (!d1 || !d2) return 999;
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
};

// Main Exported Function
export const reconcileData = (
  ageDueList: Transaction[],
  ledgerList: Transaction[]
): ReconciliationSummary => {
  
  // Clone ledger list to keep track of consumed entries
  const availableLedger = ledgerList.map(l => ({ ...l, isUsed: false }));
  
  let matchedCount = 0;
  let pendingCount = 0;
  let totalAmountCleared = 0;

  // Initialize results with Age Due items
  const results: MatchResult[] = ageDueList.map(item => ({
    ...item,
    status: 'Pending',
    matchMethod: null,
    correctedVoucherNo: undefined // Initialize as undefined
  }));

  // --- PASS 1: EXACT MATCH (Exact Amount & Exact Date) ---
  results.forEach(item => {
    // Skip if already matched
    if (item.status === 'Matched') return;

    const matchIndex = availableLedger.findIndex(
      l => !l.isUsed && 
           // Float safety check for amounts
           Math.abs(l.amount - item.amount) < 0.01 && 
           l.date === item.date
    );

    if (matchIndex !== -1) {
      const ledgerItem = availableLedger[matchIndex];
      ledgerItem.isUsed = true; // Mark ledger entry as used

      // Update Result
      item.status = 'Matched';
      item.matchMethod = 'Primary (Exact)';
      item.ledgerRef = ledgerItem.id;
      
      // COPY THE VOUCHER NUMBER FROM LEDGER
      item.correctedVoucherNo = ledgerItem.voucherNo; 
      
      matchedCount++;
      totalAmountCleared += item.amount;
    } 
  });

  // --- PASS 2: TOLERANCE MATCH (Exact Amount & Date ± 1 Day) ---
  results.forEach(item => {
    if (item.status === 'Matched') return;

    const matchIndex = availableLedger.findIndex(
      l => !l.isUsed && 
           Math.abs(l.amount - item.amount) < 0.01 && 
           getDaysDiff(l.date, item.date) <= 1
    );

    if (matchIndex !== -1) {
      const ledgerItem = availableLedger[matchIndex];
      ledgerItem.isUsed = true;

      item.status = 'Matched';
      item.matchMethod = 'Secondary (Tolerance)';
      item.ledgerRef = ledgerItem.id;
      
      // COPY THE VOUCHER NUMBER FROM LEDGER
      item.correctedVoucherNo = ledgerItem.voucherNo;

      matchedCount++;
      totalAmountCleared += item.amount;
    } else {
      // If still not found after Pass 2, it remains Pending
      pendingCount++;
    }
  });

  return {
    matchedCount,
    pendingCount,
    totalAmountCleared,
    results
  };
};