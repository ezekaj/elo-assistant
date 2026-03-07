# Z.E Digital Tech - Contact Form Email Setup

This guide explains how to set up the contact form email system to:
1. Send notifications to **contact@zedigital.tech**
2. Send automatic confirmation emails to users

## Overview

The contact form uses:
- **Resend** - Modern email API (free tier: 100 emails/day, 3,000/month)
- **Vercel Serverless Functions** - API endpoint for handling submissions

## Setup Steps

### 1. Create a Resend Account

1. Go to [resend.com](https://resend.com) and sign up
2. Verify your email address

### 2. Verify Your Domain

To send emails from `noreply@zedigital.tech`, you need to verify the domain:

1. In Resend dashboard, go to **Domains** → **Add Domain**
2. Enter `zedigital.tech`
3. Add the DNS records Resend provides:
   - **MX record** (for receiving)
   - **TXT record** (for SPF)
   - **CNAME record** (for DKIM)

Example DNS records (values will be different for your account):
```
Type: MX
Name: send
Value: feedback-smtp.us-east-1.amazonses.com
Priority: 10

Type: TXT
Name: @
Value: v=spf1 include:amazonses.com ~all

Type: CNAME
Name: resend._domainkey
Value: [provided by Resend]
```

4. Wait for verification (usually 5-15 minutes)

### 3. Create an API Key

1. In Resend dashboard, go to **API Keys**
2. Click **Create API Key**
3. Name it something like `zedigital-contact-form`
4. Copy the key (starts with `re_`)

### 4. Deploy to Vercel

#### Option A: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy (from project root)
vercel

# Add environment variable
vercel env add RESEND_API_KEY
# Paste your API key when prompted
# Select all environments (Production, Preview, Development)

# Deploy to production
vercel --prod
```

#### Option B: Deploy via GitHub

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and import the repository
3. In project settings, go to **Environment Variables**
4. Add:
   - Name: `RESEND_API_KEY`
   - Value: `re_xxxxxxxxxx` (your API key)
5. Deploy

### 5. Test the Form

1. Go to your deployed site
2. Fill out the contact form
3. Check:
   - `contact@zedigital.tech` receives the notification
   - The user receives the confirmation email

## Email Templates

### Notification Email (to contact@zedigital.tech)
- Professional dark theme matching site design
- Shows sender name, email, service type, and message
- Quick reply button

### Confirmation Email (to user)
- Branded auto-reply from noreply@zedigital.tech
- Confirms receipt of message
- Lists next steps
- Professional design matching Z.E Digital Tech branding

## Troubleshooting

### "Email service not configured"
- Make sure `RESEND_API_KEY` environment variable is set in Vercel

### "Failed to send email"
- Check that your domain is verified in Resend
- Verify your API key is correct
- Check Resend logs for detailed error messages

### Emails not being received
- Check spam folder
- Verify domain DNS records are correct
- Wait up to 24 hours for DNS propagation

## Rate Limits

**Resend Free Tier:**
- 100 emails/day
- 3,000 emails/month

For higher volumes, upgrade to Resend Pro ($20/month for 50,000 emails).

## Security Notes

- Never commit your API key to Git
- The API key should only be stored in Vercel environment variables
- The `/api/contact` endpoint has built-in validation

## Local Development

For local testing, create a `.env.local` file:

```env
RESEND_API_KEY=re_your_api_key_here
```

Then run:
```bash
vercel dev
```

This runs both the Vite dev server and the API functions locally.

---

Need help? Contact the developer or check [Resend documentation](https://resend.com/docs).
