import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

const db = admin.firestore();

export async function stripeWebhook(req: Request, res: Response): Promise<void> {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('Error handling webhook:', error);
    res.status(500).json({ error: error.message });
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const uid = session.metadata?.uid;
  const customerId = session.customer as string;

  if (!uid) {
    console.error('No uid in checkout session metadata');
    return;
  }

  // Update user with Stripe customer ID
  await db.collection('users').doc(uid).update({
    stripeCustomerId: customerId,
    updatedAt: new Date().toISOString(),
  });

  console.log(`Checkout completed for user ${uid}`);
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string;

  // Find user by Stripe customer ID
  const usersSnapshot = await db
    .collection('users')
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    console.error(`No user found for customer ${customerId}`);
    return;
  }

  const userDoc = usersSnapshot.docs[0];
  const status = subscription.status;

  // Update user plan based on subscription status
  const plan = ['active', 'trialing'].includes(status) ? 'pro' : 'free';

  await userDoc.ref.update({
    plan,
    limits: plan === 'pro' 
      ? { propCardsPerDay: Infinity, savedPropsMax: Infinity, exportsPerDay: Infinity }
      : { propCardsPerDay: 5, savedPropsMax: 15, exportsPerDay: 1 },
    updatedAt: new Date().toISOString(),
  });

  console.log(`Subscription updated for user ${userDoc.id}: plan=${plan}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const customerId = subscription.customer as string;

  const usersSnapshot = await db
    .collection('users')
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    console.error(`No user found for customer ${customerId}`);
    return;
  }

  const userDoc = usersSnapshot.docs[0];

  await userDoc.ref.update({
    plan: 'free',
    limits: {
      propCardsPerDay: 5,
      savedPropsMax: 15,
      exportsPerDay: 1,
    },
    updatedAt: new Date().toISOString(),
  });

  console.log(`Subscription deleted for user ${userDoc.id}`);
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  console.log(`Payment succeeded for invoice ${invoice.id}`);
  // Additional logic if needed (e.g., send receipt email)
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  console.log(`Payment failed for invoice ${invoice.id}`);
  // Additional logic (e.g., notify user, suspend account)
}
