export interface Transaction {
  id: string;
  partyName: string;
  date: string;
  amount: number;
  voucherNo?: string; // <--- Ensure this exists
}

export interface MatchResult extends Transaction {
  status: 'Matched' | 'Pending';
  matchMethod?: 'Primary (Exact)' | 'Secondary (Tolerance)' | null;
  ledgerRef?: string;
  correctedVoucherNo?: string; // <--- CRITICAL: Ensure this exists
}

export interface ReconciliationSummary {
  matchedCount: number;
  pendingCount: number;
  totalAmountCleared: number;
  results: MatchResult[];
}