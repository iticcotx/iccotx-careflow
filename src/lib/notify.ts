/**
 * Optional "a new submission landed" email. Silently no-ops unless RESEND_API_KEY,
 * NOTIFY_FROM and NOTIFY_TO are all set, so it is safe to leave unconfigured on staging.
 * Swap the fetch for Postmark/SendGrid/MailChannels if you use something else.
 */

import type { Env } from './runtime';

export async function notifyNewSubmission(
  env: Env,
  args: { kind: 'Application' | 'Enquiry'; who: string; summary: string; dashboardUrl: string }
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.NOTIFY_FROM || !env.NOTIFY_TO) return;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.NOTIFY_FROM,
        to: env.NOTIFY_TO.split(',').map((s) => s.trim()),
        subject: `New ${args.kind.toLowerCase()}: ${args.who}`,
        text: `${args.summary}\n\nOpen the dashboard: ${args.dashboardUrl}`,
      }),
    });
  } catch {
    // Never let a notification failure fail the applicant's submission.
  }
}
