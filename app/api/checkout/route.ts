import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  // 1) auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });

  // 2) plan
  const body = await req.json().catch(() => ({}));
  const plan = body.plan; // 'monthly' | 'lifetime'
  if (plan !== 'monthly' && plan !== 'lifetime') {
    return NextResponse.json({ error: 'invalid_plan' }, { status: 400 });
  }

  // 3) block if already premium
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('is_premium, stripe_customer_id')
    .eq('id', user.id)
    .single();
  if (pErr || !profile) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 403 });
  }
  if (profile.is_premium) {
    return NextResponse.json({ error: 'already_premium' }, { status: 400 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const priceId = plan === 'monthly'
    ? process.env.STRIPE_PRICE_MONTHLY!
    : process.env.STRIPE_PRICE_LIFETIME!;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: plan === 'monthly' ? 'subscription' : 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      // Ties the completed session back to this user in the webhook —
      // do NOT rely on customer email matching instead of this.
      client_reference_id: user.id,
      customer: profile.stripe_customer_id ?? undefined,
      customer_email: profile.stripe_customer_id ? undefined : user.email ?? undefined,
      success_url: `${siteUrl}/premium?checkout=success`,
      cancel_url: `${siteUrl}/premium?checkout=cancelled`,
      metadata: { user_id: user.id, plan },
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error('CHECKOUT SESSION FAILED:', e.message);
    return NextResponse.json({ error: 'stripe_error', detail: e.message }, { status: 500 });
  }
}