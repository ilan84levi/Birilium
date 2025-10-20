# Contact Form Email Setup Guide

The Birilium Wallet now includes a contact form that allows users to send messages directly to biriliumcoin@gmail.com.

## Features

- Red "Contact Me" button in the sidebar
- Modal form with fields for:
  - Full Name (required)
  - Phone Number (optional)
  - Email Address (required)
  - Message (required)
- Email validation
- Success/error feedback
- Sends formatted emails to biriliumcoin@gmail.com

## How It Works

When a user submits the contact form:
1. Frontend validates the input
2. Sends POST request to `http://localhost:3001/api/contact`
3. Backend validates data and sends email via Gmail SMTP
4. User receives success confirmation

## Email Configuration

### Step 1: Enable Gmail App Password

For security, Gmail requires an "App Password" instead of your regular password:

1. Go to your Google Account: https://myaccount.google.com/
2. Click on "Security" in the left sidebar
3. Under "How you sign in to Google", enable "2-Step Verification" if not already enabled
4. Once 2-Step Verification is enabled, go back to Security
5. Under "How you sign in to Google", click "App passwords"
6. Select "Mail" and "Other (Custom name)"
7. Enter "Birilium Wallet" as the name
8. Click "Generate"
9. Copy the 16-character password (it will look like: `abcd efgh ijkl mnop`)

### Step 2: Configure Environment Variables

Edit your `.env` file in `Birilium/wallet/node-backend/.env`:

```bash
# Contact Form Email Configuration
CONTACT_EMAIL=biriliumcoin@gmail.com
CONTACT_EMAIL_PASSWORD=REDACTED_EMAIL_PASSWORD
```

**Important**: Use the App Password, NOT your regular Gmail password!

### Step 3: Test the Contact Form

1. Start the wallet application
2. Click the red "Contact Me" button in the sidebar
3. Fill out the form with test data
4. Click "Send Message"
5. Check biriliumcoin@gmail.com for the email

## Development Mode

If you don't configure the email password, the contact form will still work but will:
- Log submissions to the console instead of sending emails
- Return a success message with `dev_mode: true`

This is useful for testing without email configuration.

## Email Format

The email sent will look like:

```
Subject: Birilium Wallet Contact Form - [User's Name]

New Contact Form Submission

Name: John Doe
Phone: +1234567890
Email: john@example.com

Message:
Hi, I have a question about mining...

---
Sent from Birilium Wallet Contact Form
```

The reply-to address is automatically set to the user's email, so you can reply directly.

## Security

- Input validation on both frontend and backend
- Email format validation using regex
- Rate limiting applied (100 requests per 15 minutes per IP)
- No sensitive data exposure
- HTTPS recommended for production deployment

## Troubleshooting

**Error: "Authentication failed"**
- Make sure you're using an App Password, not your regular Gmail password
- Verify 2-Step Verification is enabled on your Google account
- Check that the password has no spaces (should be 16 characters)

**Error: "Failed to send message"**
- Check that the node backend is running on port 3001
- Verify CONTACT_EMAIL_PASSWORD is set in .env
- Check your internet connection
- Check node console logs for detailed error messages

**Contact form not visible**
- The red "Contact Me" button should be at the top of the sidebar
- Check browser console for JavaScript errors
- Verify all files (index.html, styles.css, renderer-wallet.js) were updated

## Files Modified

- `index.html` - Added contact button and modal
- `styles.css` - Added styling for button and modal
- `renderer-wallet.js` - Added event handlers and API call
- `node-backend/node.js` - Added `/api/contact` endpoint
- `node-backend/package.json` - Added nodemailer dependency
- `node-backend/.env.example` - Added email configuration template

## Production Deployment

For production (seed node deployment):

1. Use a dedicated email account (not your personal Gmail)
2. Enable App Passwords on that account
3. Set environment variables on the server
4. Consider using a transactional email service like SendGrid or AWS SES for better reliability
5. Monitor email delivery and rate limits

## Alternative Email Services

While Gmail works great for development and small-scale production, you can modify the code to use:

- **SendGrid**: More reliable for production, higher rate limits
- **AWS SES**: Very cost-effective for high volume
- **Mailgun**: Good balance of features and pricing
- **Custom SMTP**: Any SMTP server

To change the email service, modify the nodemailer transporter configuration in `node-backend/node.js:612`.
