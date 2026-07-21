'use strict';

/**
 * Transactional email for Beautique.
 *
 * Every message is recorded in data/email-log.json. If RESEND_API_KEY is set,
 * the message is also delivered through Resend; otherwise the app runs in
 * "dev mail" mode and simply logs to the console (OTP flows surface the code
 * in the UI so the demo stays usable without any configuration).
 */

const store = require('./store');

let resendClient = null;

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function getResendClient() {
  if (resendClient) {
    return resendClient;
  }
  if (!isConfigured()) {
    return null;
  }
  try {
    const { Resend } = require('resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
  } catch (error) {
    console.error('[Beautique Email] Resend client load failed:', error.message || error);
    return null;
  }
  return resendClient;
}

function sendWithResend(message) {
  const client = getResendClient();
  if (!client) {
    return Promise.resolve(null);
  }
  const fromAddress = process.env.EMAIL_FROM || 'Beautique <hello@beautique.com>';
  return client.emails
    .send({ from: fromAddress, to: message.to, subject: message.subject, text: message.body })
    .then((result) => {
      /* The Resend SDK resolves (doesn't throw) even when delivery is
         rejected — e.g. sandbox mode only allows sending to the address
         your Resend account is registered with. Surface that here instead
         of silently pretending it worked. */
      if (result && result.error) {
        console.error('[Beautique Email] Resend rejected the send:', result.error.message || result.error);
      }
      return result;
    })
    .catch((err) => {
      console.error('[Beautique Email] Resend send failed:', err && err.message ? err.message : err);
    });
}

/**
 * Picks a writing tone from the recipient's mail provider — a small
 * personalization touch carried over from the original implementation.
 */
function getDomainVariant(email) {
  const domain = (email || '').toLowerCase();
  if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live')) return 'professional';
  if (domain.includes('yahoo')) return 'warm';
  if (domain.includes('gmail') || domain.includes('googlemail')) return 'friendly';
  return 'modern';
}

const GREETINGS = {
  professional: (name) => 'Hello ' + name + ',',
  warm: (name) => 'Hi ' + name + ',',
  friendly: (name) => 'Hey ' + name + ',',
  modern: (name) => 'Hello ' + name + ','
};

const SIGN_OFF = '\n\nWarm regards,\nThe Beautique Team';

function buildEmail(type, email, data) {
  const variant = getDomainVariant(email);
  const greet = GREETINGS[variant](data.firstName || 'there');
  const orderNumber = data.orderNumber || '';
  const total = data.total || '0.00';

  let subject;
  let body;

  switch (type) {
    case 'otp':
      subject = 'Your Beautique verification code';
      body = greet + '\n\nYour one-time verification code is:\n\n    ' + data.otp +
        '\n\nIt expires in 10 minutes. If you did not request this code, you can safely ignore this email.';
      break;

    case 'password_reset':
      subject = 'Reset your Beautique password';
      body = greet + '\n\nWe received a request to reset your password. Your reset code is:\n\n    ' + data.otp +
        '\n\nIt expires in 10 minutes. If you did not request this, you can safely ignore this email — your password will stay the same.';
      break;

    case 'order_confirmation':
      subject = 'Order ' + orderNumber + ' is confirmed';
      body = greet + '\n\nThank you for your order! Order ' + orderNumber + ' is confirmed and the total is $' + total + '.' +
        (data.itemsSummary ? '\n\nYour items:\n' + data.itemsSummary : '') +
        '\n\nWe are preparing everything for delivery and will keep you posted.';
      break;

    case 'order_status':
      subject = 'Order ' + orderNumber + ' update: ' + data.status;
      body = greet + '\n\nGood news — your order ' + orderNumber + ' is now marked as "' + data.status + '".' +
        '\n\nYou can review the details anytime from your Beautique profile.';
      break;

    case 'order_cancellation':
      subject = 'Order ' + orderNumber + ' has been cancelled';
      body = greet + '\n\nYour order ' + orderNumber + ' has been cancelled. A refund of $' + total +
        ' will be processed shortly.\n\nIf you need anything else, just reply to this email.';
      break;

    case 'follow_up':
      subject = 'Thank you for shopping with Beautique';
      body = greet + '\n\nThank you for your order — we hope you love it. We will send another update as soon as it ships.';
      break;

    case 'review_notification':
      subject = 'New review: ' + data.productName + ' (' + data.rating + '/5)';
      body = greet + '\n\nA new review just came in.\n\nProduct:  ' + data.productName +
        '\nReviewer: ' + data.reviewerName + '\nRating:   ' + data.rating + '/5\nComment:  ' +
        (data.comment || 'No comment provided.') + '\n\nSee it in the admin dashboard.';
      break;

    case 'contact_message':
      subject = 'New message from ' + (data.senderName || 'a visitor');
      body = greet + '\n\nA new contact message arrived.\n\nFrom:    ' + data.senderName + ' <' + data.senderEmail + '>' +
        '\nMessage:\n\n' + data.message;
      break;

    default:
      subject = 'A note from Beautique';
      body = greet + '\n\nA new update is ready for you.';
  }

  return { type, to: email, subject, body: body + SIGN_OFF, variant };
}

async function sendEmail(type, email, data) {
  const message = buildEmail(type, email, data || {});
  const history = await store.read('emailLog');
  history.push({
    id: Date.now(),
    type: message.type,
    to: message.to,
    subject: message.subject,
    variant: message.variant,
    delivered: isConfigured(),
    createdAt: new Date().toISOString()
  });
  await store.write('emailLog', history);
  console.log('[Beautique Email] ' + (isConfigured() ? '' : '(dev mode) ') + message.subject + ' -> ' + message.to);
  if (!isConfigured() && type === 'otp') {
    console.log('[Beautique Email] (dev mode) OTP for ' + message.to + ': ' + data.otp);
  }
  await sendWithResend(message);
  return message;
}

module.exports = {
  sendEmail,
  buildEmail,
  isConfigured
};
