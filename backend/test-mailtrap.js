// Quick script to verify Mailtrap Sending API configuration
require('dotenv').config();
const { MailtrapClient } = require('mailtrap');

const token = process.env.MAILTRAP_TOKEN;
const senderEmail = process.env.MAILTRAP_SENDER_EMAIL || 'hello@demomailtrap.co';
const senderName = process.env.MAILTRAP_SENDER_NAME || 'Mailtrap Test';

if (!token || token === '<YOUR_API_TOKEN>' || token.includes('PLACEHOLDER')) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Error: MAILTRAP_TOKEN is not configured in backend/.env!');
  console.log('Please set MAILTRAP_TOKEN=<your_actual_token> in backend/.env first.');
  console.log('Obtain your token at: https://mailtrap.io/sending/api-tokens');
  process.exit(1);
}

const client = new MailtrapClient({ token });

const recipientEmail = process.argv[2] || 'itharajunikhil61@gmail.com';

console.log(`🚀 Sending test email to ${recipientEmail} via Mailtrap...`);

client
  .send({
    from: {
      email: senderEmail,
      name: senderName,
    },
    to: [{ email: recipientEmail }],
    subject: 'You are awesome! (PrimePlate QA Test)',
    text: 'Congrats for sending test email with Mailtrap from PrimePlate QA!',
    category: 'Integration Test',
  })
  .then((res) => {
    console.log('\x1b[32m%s\x1b[0m', '✅ Email successfully sent via Mailtrap!');
    console.log('Response:', JSON.stringify(res, null, 2));
    console.log('\n🔍 View sent logs at: https://mailtrap.io/sending/email_logs');
  })
  .catch((err) => {
    console.error('\x1b[31m%s\x1b[0m', '❌ Mailtrap delivery failed:');
    console.error(err.message || err);
    console.log('\nCheck your logs and domain setup at: https://mailtrap.io/sending/email_logs');
  });
