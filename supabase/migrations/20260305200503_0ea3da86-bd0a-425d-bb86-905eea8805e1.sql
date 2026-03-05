
CREATE TABLE public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_username text NOT NULL,
  plan text NOT NULL,
  days integer NOT NULL,
  cakto_transaction_id text,
  status text NOT NULL DEFAULT 'pending',
  natv_activated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz
);

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct public access to payment_transactions"
  ON public.payment_transactions
  AS RESTRICTIVE
  FOR ALL
  USING (false);
