/**
 * Reusable, brand-styled email templates (Priority 4). Table-based, inline-styled HTML for
 * broad client compatibility, echoing the studio's cream/ink/gold identity and the selvage
 * divider. Each builder returns { subject, html, text }.
 */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const INK = '#1C1917';
const CREAM = '#FAF8F5';
const GOLD = '#8A6D45';

interface LayoutInput {
  preheader: string;
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  footnote?: string;
}

function selvage(): string {
  return `<div style="height:7px;width:72px;margin:16px 0 0;background-image:repeating-linear-gradient(90deg,${GOLD} 0 9px,transparent 9px 16px),repeating-linear-gradient(90deg,rgba(28,25,23,.55) 0 9px,transparent 9px 16px);background-size:16px 2px,16px 2px;background-position:0 0,8px 4px;background-repeat:repeat-x"></div>`;
}

function layout(input: LayoutInput): string {
  const body = input.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:rgba(28,25,23,.72)">${p}</p>`)
    .join('');
  const cta = input.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px"><tr><td style="border-radius:999px;background:${INK}">
         <a href="${input.cta.url}" style="display:inline-block;padding:15px 34px;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:${CREAM};text-decoration:none">${input.cta.label}</a>
       </td></tr></table>`
    : '';
  const footnote = input.footnote
    ? `<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:rgba(28,25,23,.45)">${input.footnote}</p>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#EFEAE2;font-family:Helvetica,Arial,sans-serif">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${input.preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFEAE2;padding:32px 16px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${CREAM};border:1px solid rgba(28,25,23,.08);border-radius:6px;overflow:hidden">
      <tr><td style="padding:36px 40px 8px">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:600;letter-spacing:.14em;color:${INK}">PODDAR</div>
        <div style="font-size:9px;letter-spacing:.42em;color:${GOLD};margin-top:3px">CREATION · STUDIO</div>
      </td></tr>
      <tr><td style="padding:20px 40px 40px">
        <div style="font-size:11px;letter-spacing:.32em;color:${GOLD};text-transform:uppercase">${input.eyebrow}</div>
        <h1 style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:30px;line-height:1.15;color:${INK}">${input.heading}</h1>
        ${selvage()}
        <div style="margin-top:22px">${body}${cta}${footnote}</div>
      </td></tr>
      <tr><td style="padding:20px 40px 30px;border-top:1px solid rgba(28,25,23,.08)">
        <div style="font-size:11px;line-height:1.6;color:rgba(28,25,23,.4)">Poddar Creation · Wholesale Dyed Fabrics · Surat<br>You are receiving this because an account or enquiry used this address.</div>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function toText(heading: string, paragraphs: string[], cta?: { label: string; url: string }): string {
  const lines = [heading, '', ...paragraphs.map(stripTags)];
  if (cta) lines.push('', `${cta.label}: ${cta.url}`);
  lines.push('', '— Poddar Creation Studio · Surat');
  return lines.join('\n');
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, '');

export function verifyEmailTemplate(p: { name: string; url: string }): RenderedEmail {
  const paragraphs = [
    `Welcome, ${escapeHtml(p.name)}.`,
    'Please confirm this email address to activate your Poddar Creation Studio account. The link expires in 24 hours.',
  ];
  return {
    subject: 'Confirm your email · Poddar Creation Studio',
    html: layout({ preheader: 'Confirm your email to activate your account.', eyebrow: 'Account', heading: 'Confirm your email', paragraphs, cta: { label: 'Confirm email', url: p.url }, footnote: 'If you didn’t create an account, you can ignore this message.' }),
    text: toText('Confirm your email', paragraphs, { label: 'Confirm email', url: p.url }),
  };
}

export function welcomeTemplate(p: { name: string }): RenderedEmail {
  const paragraphs = [
    `Welcome to the studio, ${escapeHtml(p.name)}.`,
    'Explore eleven constructions and hundreds of shades, build swatch books, and request quotations. Pricing unlocks once our team approves your account.',
  ];
  return {
    subject: 'Welcome to Poddar Creation Studio',
    html: layout({ preheader: 'Your studio account is ready.', eyebrow: 'Welcome', heading: 'The showroom that never closes', paragraphs }),
    text: toText('Welcome to Poddar Creation Studio', paragraphs),
  };
}

export function resetPasswordTemplate(p: { name: string; url: string }): RenderedEmail {
  const paragraphs = [
    `Hello ${escapeHtml(p.name)},`,
    'We received a request to reset your password. This link expires in one hour and can be used once.',
  ];
  return {
    subject: 'Reset your password · Poddar Creation Studio',
    html: layout({ preheader: 'Reset your studio password.', eyebrow: 'Security', heading: 'Reset your password', paragraphs, cta: { label: 'Reset password', url: p.url }, footnote: 'If you didn’t request this, no action is needed — your password stays unchanged.' }),
    text: toText('Reset your password', paragraphs, { label: 'Reset password', url: p.url }),
  };
}

export function inviteTemplate(p: { inviterName: string; role: string; url: string }): RenderedEmail {
  const paragraphs = [
    `${escapeHtml(p.inviterName)} has invited you to join the Poddar Creation Studio workspace as <strong>${escapeHtml(p.role)}</strong>.`,
    'Accept the invitation to set your password and sign in. This link expires in 7 days.',
  ];
  return {
    subject: `You’re invited to Poddar Creation Studio`,
    html: layout({ preheader: 'Accept your workspace invitation.', eyebrow: 'Invitation', heading: 'Join the workspace', paragraphs, cta: { label: 'Accept invitation', url: p.url } }),
    text: toText('Join the workspace', paragraphs, { label: 'Accept invitation', url: p.url }),
  };
}

export function buyerApprovedTemplate(p: { name: string; url: string }): RenderedEmail {
  const paragraphs = [
    `Good news, ${escapeHtml(p.name)}.`,
    'Your account is approved. Pricing is now visible across the catalogue, and you can request quotations directly from any fabric or swatch book.',
  ];
  return {
    subject: 'Your account is approved · Poddar Creation Studio',
    html: layout({ preheader: 'Pricing is now unlocked for your account.', eyebrow: 'Account', heading: 'You’re approved', paragraphs, cta: { label: 'Enter the showroom', url: p.url } }),
    text: toText('You’re approved', paragraphs, { label: 'Enter the showroom', url: p.url }),
  };
}

export function quoteSharedTemplate(p: { fromName: string; url: string; items: string[] }): RenderedEmail {
  const list = p.items.length
    ? `<ul style="margin:0 0 16px;padding-left:18px;color:rgba(28,25,23,.72);font-size:14px;line-height:1.8">${p.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`
    : '';
  const paragraphs = [`${escapeHtml(p.fromName)} shared a Poddar Creation swatch selection with you.`, list];
  return {
    subject: `${p.fromName} shared a swatch selection with you`,
    html: layout({ preheader: 'A swatch selection was shared with you.', eyebrow: 'Shared', heading: 'A swatch selection for you', paragraphs, cta: { label: 'View selection', url: p.url } }),
    text: toText('A swatch selection for you', [`${p.fromName} shared a selection.`, ...p.items], { label: 'View selection', url: p.url }),
  };
}

export function quoteReceivedTemplate(p: { name: string; subject: string }): RenderedEmail {
  const paragraphs = [
    `Thank you, ${escapeHtml(p.name)}.`,
    `We’ve received your quotation request for <strong>${escapeHtml(p.subject)}</strong>. Our sales team will respond within one working day.`,
  ];
  return {
    subject: 'We’ve received your quotation request',
    html: layout({ preheader: 'Your quotation request has been received.', eyebrow: 'Quotation', heading: 'Request received', paragraphs }),
    text: toText('Request received', paragraphs),
  };
}

export function quoteStatusTemplate(p: { name: string; subject: string; status: string; url: string }): RenderedEmail {
  const nice: Record<string, string> = { ASSIGNED: 'assigned to a sales specialist', QUOTED: 'quoted — pricing is ready', WON: 'confirmed', LOST: 'closed' };
  const paragraphs = [
    `Hello ${escapeHtml(p.name)},`,
    `Your quotation for <strong>${escapeHtml(p.subject)}</strong> has been ${nice[p.status] ?? p.status.toLowerCase()}.`,
  ];
  return {
    subject: `Update on your quotation · ${p.subject}`,
    html: layout({ preheader: 'There’s an update on your quotation.', eyebrow: 'Quotation', heading: 'Your quotation was updated', paragraphs, cta: { label: 'View in your portal', url: p.url } }),
    text: toText('Your quotation was updated', paragraphs, { label: 'View in your portal', url: p.url }),
  };
}

export function noticeTemplate(p: { eyebrow: string; heading: string; paragraphs: string[]; cta?: { label: string; url: string } }): RenderedEmail {
  return {
    subject: p.heading,
    html: layout({ preheader: p.heading, eyebrow: p.eyebrow, heading: p.heading, paragraphs: p.paragraphs, cta: p.cta }),
    text: toText(p.heading, p.paragraphs, p.cta),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
