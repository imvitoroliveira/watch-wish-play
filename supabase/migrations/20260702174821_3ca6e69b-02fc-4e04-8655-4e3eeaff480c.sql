ALTER TABLE public.payment_transactions RENAME COLUMN cakto_transaction_id TO provider_transaction_id;
ALTER TABLE public.payment_transactions ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'abacatepay';
CREATE INDEX IF NOT EXISTS idx_payment_transactions_provider ON public.payment_transactions(provider);