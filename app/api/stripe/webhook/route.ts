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

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

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
    console.error('WEBHOOK HANDLER ERROR:', e.message);
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 });
  }
}