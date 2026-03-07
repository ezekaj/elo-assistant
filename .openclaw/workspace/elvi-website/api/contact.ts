/**
 * Contact Form API Endpoint
 * Handles form submissions, sends notification to Z.E Digital Tech,
 * and sends auto-reply confirmation to the user.
 *
 * Deploy with Vercel: This file works as a Vercel Serverless Function
 *
 * Required Environment Variables:
 * - RESEND_API_KEY: Your Resend API key (get from resend.com)
 *
 * Setup Instructions:
 * 1. Create account at resend.com (free tier: 100 emails/day)
 * 2. Verify your domain (zedigital.tech) in Resend dashboard
 * 3. Create API key in Resend dashboard
 * 4. Add RESEND_API_KEY to Vercel environment variables
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// Types
interface ContactFormData {
  name: string;
  email: string;
  service: string;
  message: string;
}

interface EmailResponse {
  id?: string;
  error?: string;
}

// Service type labels for readable emails
const SERVICE_LABELS: Record<string, string> = {
  engineering: 'Precision Engineering',
  modernization: 'Digital Modernization',
  data: 'Data Architecture',
  interface: 'Interface Systems',
  advisory: 'Strategic Advisory',
};

// Send email using Resend API
async function sendEmail(options: {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<EmailResponse> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Failed to send email');
  }

  return data;
}

// Generate notification email HTML (sent to Z.E Digital Tech)
function generateNotificationEmail(data: ContactFormData): string {
  const serviceLabel = SERVICE_LABELS[data.service] || data.service;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Contact Form Submission</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #111111; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px;">

          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px; border-bottom: 1px solid rgba(255,255,255,0.1);">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-family: monospace; font-size: 11px; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.2em;">New Transmission</span>
                    <h1 style="margin: 8px 0 0 0; font-size: 24px; font-weight: 600; color: #ffffff;">Contact Form Submission</h1>
                  </td>
                  <td align="right" style="vertical-align: top;">
                    <span style="font-family: monospace; font-size: 10px; color: #666666;">${new Date().toISOString()}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 32px 40px;">

              <!-- Contact Info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px; background-color: rgba(59,130,246,0.1); border-left: 3px solid #3b82f6;">
                    <span style="font-family: monospace; font-size: 10px; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.1em;">From</span>
                    <p style="margin: 8px 0 0 0; font-size: 16px; font-weight: 600; color: #ffffff;">${data.name}</p>
                    <a href="mailto:${data.email}" style="color: #3b82f6; text-decoration: none; font-size: 14px;">${data.email}</a>
                  </td>
                </tr>
              </table>

              <!-- Service Type -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td>
                    <span style="font-family: monospace; font-size: 10px; color: #666666; text-transform: uppercase; letter-spacing: 0.1em;">Service Requested</span>
                    <p style="margin: 8px 0 0 0; font-size: 14px; color: #ffffff; background: rgba(255,255,255,0.05); padding: 12px 16px; border-radius: 4px;">${serviceLabel}</p>
                  </td>
                </tr>
              </table>

              <!-- Message -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-family: monospace; font-size: 10px; color: #666666; text-transform: uppercase; letter-spacing: 0.1em;">Message</span>
                    <div style="margin: 12px 0 0 0; padding: 20px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px;">
                      <p style="margin: 0; font-size: 14px; color: #cccccc; line-height: 1.6; white-space: pre-wrap;">${data.message}</p>
                    </div>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; border-top: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3);">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-family: monospace; font-size: 10px; color: #444444;">Z.E DIGITAL TECH • CONTACT FORM</span>
                  </td>
                  <td align="right">
                    <a href="mailto:${data.email}" style="display: inline-block; padding: 10px 20px; background: #3b82f6; color: #ffffff; text-decoration: none; font-size: 12px; font-family: monospace; text-transform: uppercase; letter-spacing: 0.1em; border-radius: 2px;">Reply</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Generate auto-reply email HTML (sent to user)
function generateAutoReplyEmail(data: ContactFormData): string {
  const serviceLabel = SERVICE_LABELS[data.service] || data.service;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>We've Received Your Message</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0a; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #111111; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px;">

          <!-- Header with Logo -->
          <tr>
            <td style="padding: 40px 40px 32px 40px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1);">
              <div style="margin-bottom: 16px;">
                <span style="font-size: 32px; font-weight: bold; color: #ffffff; letter-spacing: -0.02em;">Z.E</span>
                <span style="font-size: 32px; font-weight: 300; color: #3b82f6; letter-spacing: -0.02em;"> Digital</span>
              </div>
              <span style="font-family: monospace; font-size: 10px; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.3em;">Engineering Sovereignty</span>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 40px;">

              <!-- Greeting -->
              <h1 style="margin: 0 0 24px 0; font-size: 28px; font-weight: 500; color: #ffffff; line-height: 1.3;">
                Transmission Received, ${data.name.split(' ')[0]}.
              </h1>

              <p style="margin: 0 0 24px 0; font-size: 15px; color: #999999; line-height: 1.7;">
                Thank you for reaching out to Z.E Digital Tech. We've successfully received your inquiry regarding <strong style="color: #ffffff;">${serviceLabel}</strong>.
              </p>

              <p style="margin: 0 0 32px 0; font-size: 15px; color: #999999; line-height: 1.7;">
                Our team is reviewing your message and will respond within <strong style="color: #3b82f6;">24 hours</strong>. We appreciate your interest in working with us.
              </p>

              <!-- Summary Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 32px;">
                <tr>
                  <td style="padding: 24px; background: rgba(59,130,246,0.05); border: 1px solid rgba(59,130,246,0.2); border-radius: 4px;">
                    <span style="font-family: monospace; font-size: 10px; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.15em;">Your Submission</span>

                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px;">
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                          <span style="font-size: 12px; color: #666666;">Service</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); text-align: right;">
                          <span style="font-size: 13px; color: #ffffff;">${serviceLabel}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="font-size: 12px; color: #666666;">Submitted</span>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="font-size: 13px; color: #ffffff;">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- What's Next -->
              <h3 style="margin: 0 0 16px 0; font-size: 14px; font-weight: 600; color: #ffffff; text-transform: uppercase; letter-spacing: 0.1em;">What Happens Next</h3>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width: 32px; vertical-align: top;">
                          <span style="display: inline-block; width: 24px; height: 24px; background: rgba(59,130,246,0.2); border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; color: #3b82f6;">1</span>
                        </td>
                        <td style="padding-left: 12px;">
                          <span style="font-size: 14px; color: #cccccc;">Our team reviews your requirements</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width: 32px; vertical-align: top;">
                          <span style="display: inline-block; width: 24px; height: 24px; background: rgba(59,130,246,0.2); border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; color: #3b82f6;">2</span>
                        </td>
                        <td style="padding-left: 12px;">
                          <span style="font-size: 14px; color: #cccccc;">We'll reach out via email within 24 hours</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 0;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="width: 32px; vertical-align: top;">
                          <span style="display: inline-block; width: 24px; height: 24px; background: rgba(59,130,246,0.2); border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; color: #3b82f6;">3</span>
                        </td>
                        <td style="padding-left: 12px;">
                          <span style="font-size: 14px; color: #cccccc;">Schedule a discovery call to discuss your project</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px; border-top: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.3);">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin: 0 0 8px 0; font-size: 13px; color: #666666;">Need immediate assistance?</p>
                    <a href="mailto:contact@zedigital.tech" style="color: #3b82f6; text-decoration: none; font-size: 14px;">contact@zedigital.tech</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 24px;">
                    <span style="font-family: monospace; font-size: 10px; color: #444444; text-transform: uppercase; letter-spacing: 0.1em;">© ${new Date().getFullYear()} Z.E Digital Tech • Engineering Sovereignty</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- Unsubscribe Note -->
        <p style="margin: 24px 0 0 0; font-size: 11px; color: #444444; text-align: center;">
          This is an automated confirmation. Please do not reply to this email.<br>
          You received this because you submitted a contact form on zedigital.tech
        </p>

      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Main handler
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  // Validate API key exists
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY environment variable is not set');
    return res.status(500).json({
      success: false,
      message: 'Email service not configured'
    });
  }

  try {
    const { name, email, service, message } = req.body as ContactFormData;

    // Basic validation
    if (!name || !email || !service || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }

    const formData: ContactFormData = { name, email, service, message };

    // Email configuration
    // Use verified domain when available, otherwise use Resend's default
    const fromEmail = process.env.VERIFIED_DOMAIN
      ? `Z.E Digital Tech <noreply@${process.env.VERIFIED_DOMAIN}>`
      : 'Z.E Digital Tech <onboarding@resend.dev>';

    const toEmail = process.env.CONTACT_EMAIL || 'contact@zedigital.tech';

    // Send notification email to Z.E Digital Tech
    await sendEmail({
      from: fromEmail,
      to: toEmail,
      subject: `New Contact: ${name} - ${SERVICE_LABELS[service] || service}`,
      html: generateNotificationEmail(formData),
      replyTo: email,
    });

    // Send auto-reply confirmation to the user
    await sendEmail({
      from: fromEmail,
      to: email,
      subject: 'We\'ve Received Your Message | Z.E Digital Tech',
      html: generateAutoReplyEmail(formData),
    });

    return res.status(200).json({
      success: true,
      message: 'Message sent successfully'
    });

  } catch (error) {
    console.error('Contact form error:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to send message'
    });
  }
}
