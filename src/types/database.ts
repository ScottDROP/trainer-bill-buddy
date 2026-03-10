export interface CompanySettings {
  id: string;
  name: string;
  address: string;
  vat_number: string;
  company_number: string;
  email: string;
  bank_details: string;
  logo_url: string;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: string;
  name: string;
  code: string;
  created_at: string;
}

export interface Trainer {
  id: string;
  full_name: string;
  aliases: string[];
  email: string;
  company_name: string;
  invoicing_address: string;
  vat_number: string;
  company_number: string;
  default_hourly_rate: number;
  payment_terms: string;
  created_at: string;
  updated_at: string;
}

export interface PayRun {
  id: string;
  month: number;
  year: number;
  status: 'uploaded' | 'matched' | 'reviewed' | 'invoiced';
  csv_file_path: string;
  created_at: string;
  updated_at: string;
}

export interface PayRunRow {
  id: string;
  pay_run_id: string;
  trainer_name_csv: string;
  matched_trainer_id: string | null;
  hourly_rate_csv: number;
  total_sessions: number;
  total_cost: number;
  match_status: 'auto_matched' | 'alias_matched' | 'manual' | 'unmatched';
  validation_warnings: any[];
  created_at: string;
}

export interface PayRunLineItem {
  id: string;
  pay_run_row_id: string;
  location_name: string;
  sessions: number;
  rate: number;
  amount: number;
  created_at: string;
}

export interface Invoice {
  id: string;
  pay_run_row_id: string;
  trainer_id: string;
  invoice_number: string;
  invoice_date: string;
  service_period_start: string;
  service_period_end: string;
  subtotal: number;
  vat_amount: number;
  total_due: number;
  status: 'draft' | 'final';
  pdf_file_path: string;
  created_at: string;
  updated_at: string;
}
