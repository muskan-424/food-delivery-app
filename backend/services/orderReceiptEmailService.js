import orderModel from "../models/orderModel.js";
import paymentModel from "../models/paymentModel.js";
import { sendHtmlEmail, isSmtpConfigured } from "../utils/emailService.js";

function inr(n) {
  const x = Number(n) || 0;
  return `₹${x.toFixed(2)}`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildLineItemsHtml(order) {
  const rows = (order.items || [])
    .map(
      (it) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(it.name)} × ${escapeHtml(
        it.quantity
      )}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${inr(
        (Number(it.price) || 0) * (Number(it.quantity) || 0)
      )}</td>
    </tr>`
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>`;
}

function buildTotalsTable(order, { paymentLabel }) {
  const tip = Number(order.tipAmount) || 0;
  const fee = Number(order.serviceFeeAmount) || 0;
  const rows = [
    ["Items subtotal", inr(order.amount)],
    ["Delivery", inr(order.deliveryFee || 0)],
    ["Discounts", order.discount > 0 ? `−${inr(order.discount)}` : inr(0)],
  ];
  if (tip > 0) rows.push(["Tip", inr(tip)]);
  if (fee > 0) rows.push(["Service fee", inr(fee)]);
  if ((order.loyaltyRedeemInr || 0) > 0) {
    rows.push(["Loyalty", `−${inr(order.loyaltyRedeemInr)}`]);
  }
  rows.push(["<strong>Total</strong>", `<strong>${inr(order.finalAmount)}</strong>`]);
  rows.push(["Payment", escapeHtml(paymentLabel)]);

  return `<table style="width:100%;max-width:400px;margin-top:12px;font-size:14px;">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:4px 0;">${k}</td><td style="padding:4px 0;text-align:right;">${v}</td></tr>`
      )
      .join("")}
  </table>`;
}

/**
 * Sent for every successful placement when the customer email is present.
 */
export async function sendOrderPlacedEmail(order) {
  if (!isSmtpConfigured()) return false;
  const email = String(order.address?.email || "").trim();
  if (!email) return false;

  const method = order.payment?.method || "cash_on_delivery";
  const payStatus = order.payment?.status || "pending";
  let paymentLabel = "";
  if (method === "cash_on_delivery") {
    paymentLabel = "Cash on delivery — pay the rider";
  } else if (method === "razorpay" && payStatus !== "paid") {
    paymentLabel = "Online (Razorpay) — complete payment from My Orders if needed";
  } else if (payStatus === "paid") {
    paymentLabel = "Paid — thank you";
  } else {
    paymentLabel = `${method} (${payStatus})`;
  }

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
    <h2 style="color:#e64a2e;">Order confirmed</h2>
    <p>Hi ${escapeHtml(order.address?.name || "there")},</p>
    <p>Thanks for your order <strong>#${escapeHtml(order.orderNumber)}</strong>.</p>
    ${buildLineItemsHtml(order)}
    ${buildTotalsTable(order, { paymentLabel })}
    <p style="margin-top:20px;font-size:13px;color:#666;">
      This message was sent automatically. If you did not place this order, contact support.
    </p>
  </div>`;

  return sendHtmlEmail({
    to: email,
    subject: `Order confirmed · ${order.orderNumber}`,
    html,
  });
}

/**
 * Sent when a payment record reaches <code>success</code> (Razorpay verify, webhook, admin, etc.).
 * Idempotent via <code>payment.receiptEmailSentAt</code>.
 */
export async function sendPaymentReceiptEmailIfNeeded(paymentMaybe) {
  if (!isSmtpConfigured()) return false;
  const id = paymentMaybe?._id || paymentMaybe;
  if (!id) return false;

  const payment = await paymentModel.findById(id);
  if (!payment || payment.status !== "success" || payment.receiptEmailSentAt) {
    return false;
  }

  const order = await orderModel.findById(payment.orderId);
  if (!order) return false;

  const email = String(order.address?.email || "").trim();
  if (!email) return false;

  const txn = payment.transactionId || payment.providerPaymentId || "—";
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333;">
    <h2 style="color:#2e7d32;">Payment received</h2>
    <p>Hi ${escapeHtml(order.address?.name || "there")},</p>
    <p>We received <strong>${inr(
      payment.amount
    )}</strong> for order <strong>#${escapeHtml(order.orderNumber)}</strong>.</p>
    ${buildLineItemsHtml(order)}
    ${buildTotalsTable(order, {
      paymentLabel: `Paid via ${escapeHtml(payment.paymentMethod)} · ref ${escapeHtml(txn)}`,
    })}
    <p style="margin-top:20px;font-size:13px;color:#666;">Keep this email as your receipt.</p>
  </div>`;

  const ok = await sendHtmlEmail({
    to: email,
    subject: `Receipt · ${order.orderNumber}`,
    html,
  });
  if (ok) {
    payment.receiptEmailSentAt = new Date();
    await payment.save();
  }
  return ok;
}
