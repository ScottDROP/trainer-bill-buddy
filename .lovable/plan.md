

# Implementation Plan: DropGym Invoicing Tool

## Prerequisite: Supabase Connection

This project requires Supabase for database, storage, and edge functions. **No Supabase connection exists yet.** We need to connect to Supabase first before implementing the database schema and backend features.

I will connect Supabase, then build the full application in phases.

---

## Phase 1: Supabase Setup

### Database Tables (migrations)
- **company_settings**: name, address, vat_number, company_number, email, bank_details, logo_url
- **locations**: id, name, code (maps to CSV column headers)
- **trainers**: id, full_name, aliases (text[]), email, company_name, invoicing_address, vat_number, company_number, default_hourly_rate, payment_terms
- **pay_runs**: id, month, year, status (uploaded/matched/reviewed/invoiced), csv_file_path, created_at
- **pay_run_rows**: id, pay_run_id (FK), trainer_name_csv, matched_trainer_id (FK nullable), hourly_rate_csv, total_sessions, total_cost, match_status, validation_warnings (jsonb)
- **pay_run_line_items**: id, pay_run_row_id (FK), location_name, sessions, rate, amount
- **invoices**: id, pay_run_row_id (FK), trainer_id (FK), invoice_number, invoice_date, service_period_start, service_period_end, subtotal, vat_amount, total_due, status (draft/final), pdf_file_path

### Storage Buckets
- `csv-uploads` (private)
- `invoices` (private)

### RLS Policies
- All tables accessible to authenticated users (internal admin tool)

---

## Phase 2: Frontend — Layout & Core Pages

### Sidebar Layout
- Sidebar navigation with: Dashboard, Trainers, Locations, Upload Pay Run, Settings
- Clean admin dashboard aesthetic

### Pages to Build

1. **Dashboard (`/`)** — Summary cards (recent pay runs, pending reviews, invoice count), quick actions
2. **Settings (`/settings`)** — Form to manage DropGym company details
3. **Locations (`/locations`)** — CRUD table for gym locations
4. **Trainer Directory (`/trainers`)** — Searchable table, add/edit forms with all profile fields including alias management
5. **Upload Pay Run (`/upload`)** — Month/year picker, CSV dropzone, parse and save
6. **Match & Review (`/pay-runs/:id/review`)** — Table of CSV rows with match status indicators, validation warnings, manual trainer assignment dropdown
7. **Invoice Preview (`/pay-runs/:id/invoices`)** — List of draft invoices, click to preview with full invoice layout (sender, recipient, line items, totals, VAT)
8. **Export (`/pay-runs/:id/export`)** — Generate/download PDFs individually or as ZIP

---

## Phase 3: CSV Parsing & Matching Logic

- Client-side CSV parsing (Papa Parse or manual)
- Column detection: identify `[Location] Sessions` and `[Location] Cost` pattern
- Matching engine: exact name → alias match → unmatched
- Validation: totals match, profile completeness, rate mismatch warnings

---

## Phase 4: PDF Generation

- Edge function `generate-invoice-pdf` using a library to create professional invoices
- British currency formatting (£X,XXX.XX)
- ZIP download for batch export

---

## Technical Approach
- **Types**: Shared TypeScript types in `src/types/` mirroring DB schema
- **Data Layer**: Supabase client queries via React Query hooks in `src/hooks/`
- **Utilities**: CSV parser, currency formatter, invoice number generator in `src/lib/`
- **Components**: Reusable form components, invoice preview component, validation badge component

---

## Step 1 (this implementation round)
Connect Supabase, create all database tables and storage buckets, build the sidebar layout, dashboard, settings page, locations page, and trainer directory with full CRUD. This gives a working foundation before tackling CSV upload and invoicing.

