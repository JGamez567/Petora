import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import Stripe from 'stripe';

// Webhooks have no user session — this route ALWAYS uses the service-role
// client, per the invariant that protected profile columns (is_premium,
// stripe_customer_id) can only be written server-side with elevated access.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Idempotency: Stripe retries deliveries and can send the same event more than
// once. We record each processed event.id in stripe_events and skip duplicates,
// so a retry can never double-apply a change. Returns true if this event was
// already handled.
async function alreadyProcessed(eventId: string): Promise<boolean> {
  // Try to claim the event by inserting its id. If it's already there, the
  // insert conflicts and we know it was handled.
  const { error } = await admin.from('stripe_events').insert({ id: eventId });
  if (!error) return false;                 // fresh insert → not processed before
  if (error.code === '23505') return true;  // unique_violation → duplicate delivery
  // Any other error: log and treat as NOT processed so we don't silently drop a
  // real event (better to risk a harmless re-apply than to miss a purchase).
  console.error('WEBHOOK: idempotency check error:', error.message);
  return false;
}

export async function POST(req: Request) {
  const body = await req.text(); // raw body required for signature check
  const sig = req.headers.get('stripe-signature');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (e: any) {
    console.error('WEBHOOK SIGNATURE VERIFICATION FAILED:', e.message);
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  // Skip anything we've already handled (Stripe retry / duplicate delivery).
  if (await alreadyProcessed(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const customerId =
          typeof session.customer === 'string' ? session.customer : session.customer?.id;

        if (!userId) {
          console.error('WEBHOOK: checkout.session.completed missing client_reference_id');
          break;
        }

        const { error } = await admin
          .from('profiles')
          .update({
            is_premium: true,
            ...(customerId ? { stripe_customer_id: customerId } : {}),
          })
          .eq('id', userId);

        if (error) console.error('WEBHOOK: failed to set is_premium true:', error.message);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
        if (!customerId) break;

        // Only affects monthly subscribers. Lifetime purchases have no
        // subscription object, so they're never touched by this event.
        const { error } = await admin
          .from('profiles')
          .update({ is_premium: false })
          .eq('stripe_customer_id', customerId);

        if (error) console.error('WEBHOOK: failed to set is_premium false:', error.message);
        break;
      }

      default:
        // ignore other event types
        break;
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    // If handling failed, remove the idempotency claim so Stripe's retry can try
    // again (otherwise the retry would be skipped as a "duplicate" and the change
    // would be lost).
    await admin.from('stripe_events').delete().eq('id', event.id);
    console.error('WEBHOOK HANDLER ERROR:', e.message);
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 });
  }
}