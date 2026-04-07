## Pilates Pay Run Feature

### 1. Database Tables
- **pilates_instructors** — full_name, email, company_name, bank_account_number, bank_sort_code, vat_number, invoicing_address, default_hourly_rate
- **pilates_invoices** — instructor_id, invoice_number, invoice_date, amount, description, location, file_path, status (pending/approved/paid), pay_run_month, pay_run_year

### 2. Storage
- New `pilates-invoices` bucket for uploaded PDF files

### 3. Edge Function
- `parse-pilates-invoice` — uses Lovable AI to extract invoice details (name, amount, date, invoice number, description, location) from uploaded PDFs

### 4. UI Components
- New "Pilates" tab in the Pay Runs page
- Drag & drop zone for multiple PDF invoices
- Table showing all uploaded invoices with extracted data (editable)
- Instructor management (add/edit pilates instructors)
- Xero CSV export button
- Telleroo CSV export button
- Month/year selector for pay run period

### 5. Exports
- Xero CSV in same format as trainer exports
- Telleroo CSV with bank details from pilates_instructors table
