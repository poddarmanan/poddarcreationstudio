import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import { AppError } from '../core/errors';

/** A shade and its metres, as a fabric order gives them. */
export interface OrderLine {
  fabricId: string;
  colourId: string;
  metres: number;
}

/** What Razorpay knows of an order. */
export interface GatewayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

/** The two calls the studio makes to Razorpay, kept behind an interface so they can be faked in tests. */
export interface RazorpayGateway {
  createOrder(input: { amount: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<GatewayOrder>;
  fetchOrder(id: string): Promise<GatewayOrder>;
}

/**
 * Razorpay's Orders API, over HTTPS with the key pair as basic auth.
 *
 *   RAZORPAY_KEY_ID       the key id (rzp_live_… or rzp_test_…); also given to the browser
 *   RAZORPAY_KEY_SECRET   the key secret; never leaves the server
 */
export class RazorpayApi implements RazorpayGateway {
  constructor(private readonly keyId: string, private readonly secret: string) {}

  private async call(path: string, init?: RequestInit): Promise<GatewayOrder> {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers: { Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.secret}`).toString('base64')}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw AppError.unavailable('The payment service did not answer. Please try again.');
    return (await res.json()) as GatewayOrder;
  }

  createOrder(input: { amount: number; currency: string; receipt: string; notes: Record<string, string> }) {
    return this.call('/orders', { method: 'POST', body: JSON.stringify(input) });
  }

  fetchOrder(id: string) {
    return this.call(`/orders/${encodeURIComponent(id)}`);
  }
}

/**
 * Paying for a fabric order with Razorpay. The amount is always worked out here, from the
 * catalogue's prices and the metres ordered — never taken from the browser. Paying runs:
 *
 *   1. `start`   prices the lines and opens a Razorpay order for that amount;
 *   2. the browser runs Razorpay Checkout for that order;
 *   3. `confirm` checks the signature Checkout returns (HMAC-SHA256 of "order_id|payment_id"
 *      with the key secret), and that the order Razorpay holds is for what these lines cost.
 *
 * Only then is the quote recorded as paid.
 */
export class PaymentService {
  constructor(
    private readonly db: PrismaClient,
    private readonly gateway: RazorpayGateway | null,
    private readonly keyId: string | null,
    private readonly secret: string | null,
  ) {}

  /** Whether Razorpay is set up on this server. */
  get ready() {
    return !!(this.gateway && this.keyId && this.secret);
  }

  get publicKey() {
    return this.keyId;
  }

  /** What the lines cost, in paise, at the catalogue's price by the metre. */
  async priceOf(lines: OrderLine[]): Promise<number> {
    if (!lines.length) throw AppError.validation('Nothing to pay for');
    const fabrics = await this.db.fabric.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.fabricId))] } }, select: { id: true, price: true } });
    const colours = await this.db.colour.findMany({ where: { id: { in: lines.map((l) => l.colourId) } }, select: { id: true, fabricId: true } });
    let rupees = 0;
    for (const l of lines) {
      const fabric = fabrics.find((f) => f.id === l.fabricId);
      const colour = colours.find((c) => c.id === l.colourId);
      if (!fabric || !colour || colour.fabricId !== fabric.id) throw AppError.validation('A shade in this order is not in the catalogue');
      if (!Number.isFinite(l.metres) || l.metres <= 0 || l.metres > 1_000_000) throw AppError.validation('Metres must be a positive number');
      rupees += fabric.price * l.metres;
    }
    return Math.round(rupees * 100);
  }

  /** Opens a Razorpay order for what the lines cost. */
  async start(userId: string, lines: OrderLine[]) {
    if (!this.ready || !this.gateway) throw AppError.unavailable('Online payment is being set up. Please choose another method for now.');
    const amount = await this.priceOf(lines);
    if (amount < 100) throw AppError.validation('The amount is too small to pay online');
    const metres = lines.reduce((s, l) => s + l.metres, 0);
    const order = await this.gateway.createOrder({
      amount,
      currency: 'INR',
      receipt: `pc-${Date.now().toString(36)}`,
      notes: { userId, metres: String(metres), shades: String(lines.length) },
    });
    return { orderId: order.id, amount: order.amount, currency: order.currency, keyId: this.keyId as string };
  }

  /** The signature Checkout returns for a completed payment, checked in constant time. */
  signatureValid(orderId: string, paymentId: string, signature: string) {
    if (!this.secret) return false;
    const expected = createHmac('sha256', this.secret).update(`${orderId}|${paymentId}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Checks a completed payment against the lines it pays for; returns what to record on the quote. */
  async confirm(lines: OrderLine[], payment: { orderId: string; paymentId: string; signature: string }) {
    if (!this.ready || !this.gateway) throw AppError.unavailable('Online payment is not set up on this server');
    if (!this.signatureValid(payment.orderId, payment.paymentId, payment.signature)) throw AppError.validation('The payment could not be verified');
    const [order, amount] = await Promise.all([this.gateway.fetchOrder(payment.orderId), this.priceOf(lines)]);
    if (order.amount !== amount) throw AppError.validation('The payment does not match this order');
    return { paymentStatus: 'PAID', paymentRef: payment.paymentId, paidAmount: order.amount };
  }
}
