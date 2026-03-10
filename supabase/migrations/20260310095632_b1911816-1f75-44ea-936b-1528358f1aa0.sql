ALTER TABLE public.trainers
ADD COLUMN bank_account_number text DEFAULT '',
ADD COLUMN bank_sort_code text DEFAULT '';