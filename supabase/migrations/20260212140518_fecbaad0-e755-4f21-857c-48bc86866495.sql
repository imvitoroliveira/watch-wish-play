
-- Table for storing push subscriptions per client device
CREATE TABLE public.user_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_username text NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_username, endpoint)
);

ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Block direct public access - only service role (edge functions) can access
CREATE POLICY "No direct public access to push subscriptions"
  ON public.user_push_subscriptions
  FOR ALL
  USING (false);

-- Table for notification history/queue
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'global' CHECK (type IN ('global', 'expiration', 'catalog', 'roleta')),
  title text NOT NULL,
  body text NOT NULL,
  target_user text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Block direct public access - edge functions handle all notification logic
CREATE POLICY "No direct public access to notifications"
  ON public.notifications
  FOR ALL
  USING (false);
