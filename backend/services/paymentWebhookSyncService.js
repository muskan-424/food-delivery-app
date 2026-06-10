import paymentModel from "../models/paymentModel.js";
import orderModel from "../models/orderModel.js";
import { sendPaymentReceiptEmailIfNeeded } from "./orderReceiptEmailService.js";
import {
  ensureEscrowForOrder,
  onEscrowPaymentCaptured,
} from "./escrowService.js";

/**
 * Apply provider-reported status to our Payment + Order (used by webhooks and tests).
 * @param {string} status - 'success' | 'failed' | 'cancelled'
 */
export async function applyPaymentProviderStatus(payment, { status, transactionId, providerPaymentId }) {
  if (providerPaymentId && !payment.providerPaymentId) {
    payment.providerPaymentId = providerPaymentId;
  }

  if (status === "success") {
    payment.status = "success";
    payment.paidAt = payment.paidAt || new Date();
    if (transactionId) payment.transactionId = transactionId;

    const order = await orderModel.findById(payment.orderId);
    if (order) {
      order.payment = {
        status: "paid",
        method: payment.paymentMethod,
        transactionId: transactionId || payment.transactionId,
        paidAt: new Date(),
      };
      await order.save();
    }
  } else if (status === "failed") {
    payment.status = "failed";
    payment.failureReason = payment.failureReason || "Provider reported failure";
  } else if (status === "cancelled") {
    payment.status = "cancelled";
  }

  await payment.save();
  if (status === "success") {
    await ensureEscrowForOrder({
      orderId: payment.orderId,
      userId: payment.userId,
      amount: payment.amount,
      currency: payment.currency || "INR",
    });
    await onEscrowPaymentCaptured({
      orderId: payment.orderId,
      razorpayOrderId: providerPaymentId || payment.providerPaymentId,
      razorpayPaymentId: transactionId || payment.transactionId,
      actor: { kind: "system", id: "webhook" },
    });
    void sendPaymentReceiptEmailIfNeeded(payment._id).catch((e) =>
      console.error("payment receipt email (webhook):", e)
    );
  }
  return payment;
}

export async function findPaymentForWebhook({ providerPaymentId, paymentId }) {
  if (paymentId) {
    const p = await paymentModel.findById(paymentId);
    if (p) return p;
  }
  if (providerPaymentId) {
    return paymentModel.findOne({ providerPaymentId });
  }
  return null;
}
