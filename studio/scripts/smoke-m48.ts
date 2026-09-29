import 'dotenv/config';
import assert from 'node:assert';
import { createHmac } from 'node:crypto';
import { prisma } from '../src/lib/prisma';
import { PaymentService, type GatewayOrder, type RazorpayGateway } from '../src/server/payment/razorpay.service';

/**
 * M48 — paying for a fabric order with Razorpay, without Razorpay.
 *
 * What is being protected: the amount is worked out on the server from the catalogue's prices,
 * a payment is recorded only with a valid Checkout signature, and a payment made for one order
 * cannot be passed off against a larger one. A fake gateway stands in for Razorpay's API.
 */
class FakeGateway implements RazorpayGateway {
  orders = new Map<string, GatewayOrder>();
  async createOrder(input: { amount: number; currency: string }) {
    const order = { id: `order_${this.orders.size + 1}`, amount: input.amount, currency: input.currency, status: 'created' };
    this.orders.set(order.id, order);
    return order;
  }
  async fetchOrder(id: string) {
    const o = this.orders.get(id);
    if (!o) throw new Error('no such order');
    return { ...o, status: 'paid' };
  }
}

async function main() {
  const SECRET = 'test_secret_m48';
  const gateway = new FakeGateway();
  const payments = new PaymentService(prisma, gateway, 'rzp_test_m48', SECRET);
  assert.equal(payments.ready, true);
  assert.equal(new PaymentService(prisma, null, null, null).ready, false);
  console.log('ready only with a key pair ✓');

  const fabric = await prisma.fabric.findFirstOrThrow({ include: { colours: { take: 2 } } });
  const [a, b] = fabric.colours;
  const lines = [
    { fabricId: fabric.id, colourId: a.id, metres: 250 },
    { fabricId: fabric.id, colourId: b.id, metres: 100 },
  ];
  const expected = fabric.price * 350 * 100;
  assert.equal(await payments.priceOf(lines), expected);
  console.log(`priced on the server: 350 m of ${fabric.name} at ₹${fabric.price} = ${expected} paise ✓`);

  await assert.rejects(payments.priceOf([{ fabricId: fabric.id, colourId: 'not-a-colour', metres: 10 }]));
  await assert.rejects(payments.priceOf([{ fabricId: fabric.id, colourId: a.id, metres: -5 }]));
  console.log('unknown shades and negative metres are refused ✓');

  const started = await payments.start('user-m48', lines);
  assert.equal(started.amount, expected);
  assert.equal(started.keyId, 'rzp_test_m48');
  console.log('a Razorpay order opens for the server price ✓');

  const paymentId = 'pay_m48';
  const signature = createHmac('sha256', SECRET).update(`${started.orderId}|${paymentId}`).digest('hex');
  const ok = await payments.confirm(lines, { orderId: started.orderId, paymentId, signature });
  assert.deepEqual(ok, { paymentStatus: 'PAID', paymentRef: paymentId, paidAmount: expected });
  console.log('a signed payment for these lines is recorded as paid ✓');

  await assert.rejects(payments.confirm(lines, { orderId: started.orderId, paymentId, signature: signature.replace(/.$/, (c) => (c === '0' ? '1' : '0')) }));
  console.log('a forged signature is refused ✓');

  const more = [{ ...lines[0], metres: 2500 }, lines[1]];
  await assert.rejects(payments.confirm(more, { orderId: started.orderId, paymentId, signature }));
  console.log('a payment cannot be passed off against a larger order ✓');

  console.log('\nM48 Razorpay payments: all checks passed');
}

main()
  .catch((err) => {
    console.error('FAILED', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
