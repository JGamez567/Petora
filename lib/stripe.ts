import Stripe from "stripe";

// Server-only Stripe client. Never import this from a client component.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);