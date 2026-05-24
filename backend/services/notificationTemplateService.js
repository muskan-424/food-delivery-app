function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function titleCaseStatus(raw) {
  const s = String(raw || "")
    .replace(/_/g, " ")
    .trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Updated";
}

export function renderNotificationTemplates(notification, user) {
  const type = String(notification?.type || "system");
  if (type === "order_status") {
    const orderNumber =
      notification?.metadata?.orderNumber ||
      notification?.metadata?.orderNo ||
      "";
    const toStatus = titleCaseStatus(notification?.metadata?.to || "");
    const subject = `Order ${orderNumber || ""} ${toStatus}`.trim();
    const message = orderNumber
      ? `Order ${orderNumber} is now ${toStatus}.`
      : String(notification?.body || "Your order status has changed.");
    return {
      subject,
      smsText: message,
      emailHtml: `<div style="font-family:Arial,sans-serif"><h3>${escHtml(subject)}</h3><p>${escHtml(
        message
      )}</p><p style="color:#666;font-size:12px">Thanks, ${escHtml(
        user?.name || "Customer"
      )}</p></div>`,
    };
  }

  const subject = String(notification?.title || "Notification");
  const body = String(notification?.body || "");
  return {
    subject,
    smsText: `${subject}: ${body}`.trim(),
    emailHtml: `<div style="font-family:Arial,sans-serif"><h3>${escHtml(subject)}</h3><p>${escHtml(
      body
    )}</p></div>`,
  };
}

