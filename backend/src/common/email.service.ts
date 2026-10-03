import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { promises as dnsPromises } from 'dns';
import { MailtrapClient } from 'mailtrap';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  private async sendViaMailtrap(params: {
    toEmail: string;
    subject: string;
    htmlContent?: string;
    textContent?: string;
    category?: string;
  }): Promise<boolean> {
    const token = this.configService.get<string>('MAILTRAP_TOKEN');
    if (
      !token ||
      token.includes('PLACEHOLDER') ||
      token === '<YOUR_API_TOKEN>'
    ) {
      return false;
    }

    const senderEmail =
      this.configService.get<string>('MAILTRAP_SENDER_EMAIL') ||
      'hello@demomailtrap.co';
    const senderName =
      this.configService.get<string>('MAILTRAP_SENDER_NAME') ||
      'Mailtrap Test';

    try {
      const client = new MailtrapClient({ token });
      const recipients = [{ email: params.toEmail }];

      const sendOptions: any = {
        from: { email: senderEmail, name: senderName },
        to: recipients,
        subject: params.subject,
        text: params.textContent || '',
        category: params.category || 'QA Notification',
      };

      if (params.htmlContent) {
        sendOptions.html = params.htmlContent;
      }

      const response = await client.send(sendOptions);

      this.logger.log(
        `Email dispatched to ${params.toEmail} via Mailtrap Sending API (message_ids: ${JSON.stringify((response as any)?.message_ids)}). Check logs at https://mailtrap.io/sending/email_logs`,
      );
      return true;
    } catch (err: any) {
      this.logger.error(
        `Mailtrap Sending API delivery failed: ${err.message || err}`,
      );
      return false;
    }
  }

  private async getGmailTransporter() {
    const smtpUser =
      this.configService.get<string>('SMTP_USER') ||
      this.configService.get<string>('GMAIL_USER');
    const smtpPass =
      this.configService.get<string>('SMTP_PASS') ||
      this.configService.get<string>('GMAIL_PASS');
    const smtpHost =
      this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const smtpPort = Number(this.configService.get<number>('SMTP_PORT')) || 587;

    if (smtpUser && smtpPass) {
      // Directly resolve smtpHost to pure IPv4 address.
      // Nodemailer's internal resolveHostname otherwise queries both IPv4 and IPv6 and
      // randomly selects an address, which picks Gmail IPv6 (2607:f8b0:...) and crashes
      // with ENETUNREACH on cloud containers (Render/Docker) that lack IPv6 routes.
      let resolvedHost = smtpHost;
      try {
        const ipv4List = await dnsPromises.resolve4(smtpHost);
        if (ipv4List && ipv4List.length > 0) {
          resolvedHost = ipv4List[0];
        }
      } catch (dnsErr: any) {
        this.logger.warn(
          `Direct IPv4 DNS lookup for ${smtpHost} failed: ${dnsErr.message}. Using hostname.`,
        );
      }

      return {
        transporter: nodemailer.createTransport({
          host: resolvedHost,
          port: smtpPort,
          secure: smtpPort === 465,
          servername: smtpHost,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
          tls: {
            servername: smtpHost,
            rejectUnauthorized: false,
          },
          connectionTimeout: 15000,
          greetingTimeout: 15000,
          socketTimeout: 20000,
        } as any),
        smtpUser,
      };
    }
    return null;
  }

  private async sendViaBrevo(params: {
    toEmail: string;
    subject: string;
    htmlContent: string;
    textContent: string;
    replyToEmail?: string;
  }): Promise<boolean> {
    const brevoApiKey =
      this.configService.get<string>('BREVO_API_KEY') ||
      this.configService.get<string>('SENDINBLUE_API_KEY');

    if (!brevoApiKey) return false;

    const senderEmail =
      this.configService.get<string>('BREVO_SENDER_EMAIL') ||
      this.configService.get<string>('SMTP_USER') ||
      this.configService.get<string>('GMAIL_USER') ||
      'infoprimeplate@gmail.com';
    const senderName = 'PrimePlate';

    try {
      const payload: any = {
        sender: { name: senderName, email: senderEmail },
        to: [{ email: params.toEmail }],
        subject: params.subject,
        htmlContent: params.htmlContent,
        textContent: params.textContent,
      };

      if (params.replyToEmail) {
        payload.replyTo = { email: params.replyToEmail };
      }

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': brevoApiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const resData = await response.json().catch(() => ({}));
        this.logger.log(
          `Email dispatched to ${params.toEmail} via Brevo HTTP API (msgId: ${resData?.messageId || 'ok'}).`,
        );
        return true;
      }

      const errText = await response.text();
      this.logger.error(
        `Brevo HTTP API delivery failed (${response.status}): ${errText}`,
      );
      return false;
    } catch (err: any) {
      this.logger.error(
        `Error sending email via Brevo HTTP API: ${err.message}`,
      );
      return false;
    }
  }

  async sendPasswordResetEmail(
    toEmail: string,
    rawToken: string,
  ): Promise<void> {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const cleanFrontendUrl = frontendUrl.replace(/\/+$/, '');
    const resetUrl = `${cleanFrontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    const subject = 'PrimePlate Password Reset';
    const textContent = `Someone requested a password reset for your PrimePlate account.

Reset Password: ${resetUrl}

This link expires in 15 minutes.

If you did not request this, you can ignore this email.`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <h2 style="color: #0f172a;">PrimePlate Password Reset</h2>
        <p>Someone requested a password reset for your PrimePlate account.</p>
        <div style="margin: 24px 0;">
          <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="font-size: 14px; color: #64748b;">This link expires in 15 minutes.</p>
        <p style="font-size: 14px; color: #64748b;">If you did not request this, you can ignore this email.</p>
      </div>
    `;

    // 1. Primary for QA / Mailtrap Sending API
    const mailtrapSent = await this.sendViaMailtrap({
      toEmail,
      subject,
      htmlContent,
      textContent,
      category: 'Password Reset',
    });
    if (mailtrapSent) return;

    // 2. Primary for Cloud Environments: Brevo HTTP REST API (Port 443 HTTPS - Never blocked by Render)
    const brevoSent = await this.sendViaBrevo({
      toEmail,
      subject,
      htmlContent,
      textContent,
    });
    if (brevoSent) return;

    // 2. Direct Gmail SMTP (Port 587 STARTTLS)
    const gmail = await this.getGmailTransporter();
    if (gmail) {
      try {
        await gmail.transporter.sendMail({
          from: `"PrimePlate" <${gmail.smtpUser}>`,
          to: toEmail,
          subject,
          text: textContent,
          html: htmlContent,
        });

        this.logger.log(
          `Password reset email delivered to ${toEmail} via Nodemailer Gmail SMTP (${gmail.smtpUser}).`,
        );
        return;
      } catch (smtpErr: any) {
        this.logger.error(
          `Gmail SMTP Password reset email delivery failed: ${smtpErr.message}`,
        );
      }
    }

    // 2. Secondary fallback: Resend API (if configured)
    const apiKey = this.configService.get<string>('EMAIL_PROVIDER_API_KEY');
    if (apiKey) {
      const fromEmail =
        this.configService.get<string>('EMAIL_FROM') ||
        'PrimePlate <infoprimeplate@gmail.com>';
      const resendFrom =
        !fromEmail ||
        fromEmail.includes('primeplate.com') ||
        fromEmail.includes('gmail.com') ||
        this.configService.get<string>('EMAIL_DOMAIN_VERIFIED') !== 'true'
          ? 'PrimePlate <onboarding@resend.dev>'
          : fromEmail;

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [toEmail],
            subject,
            html: htmlContent,
            text: textContent,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          if (
            response.status === 403 &&
            errBody.includes('testing emails to your own email address')
          ) {
            this.logger.warn(
              `Resend sandbox mode: cannot deliver password reset to external recipient (${toEmail}). Domain verification required in Resend dashboard.`,
            );
          } else {
            this.logger.error(
              `Resend API Email delivery failed (${response.status}): ${errBody}`,
            );
          }
        } else {
          this.logger.log(
            `Password reset email successfully dispatched to ${toEmail} via Resend.`,
          );
          return;
        }
      } catch (err: any) {
        this.logger.error(
          `Error sending password reset email via Resend: ${err.message}`,
        );
      }
    }

    // 3. Fallback log for development/testing
    this.logger.log(
      `[EmailService] Password reset link generated for ${toEmail}: ${resetUrl}`,
    );
  }

  async sendSupportTicketEmail(ticketData: {
    ticketNumber: string;
    studentName: string;
    studentEmail: string;
    razorpayOrderId: string;
    amount: number;
    issueType: string;
    description: string;
    utrReference?: string;
  }): Promise<void> {
    const supportEmail =
      this.configService.get<string>('SUPPORT_EMAIL') ||
      'infoprimeplate@gmail.com';

    const subject = `[SUPPORT TICKET] #${ticketData.ticketNumber} - ${ticketData.issueType}`;
    const textContent = `New Payment Support Ticket Raised:

Ticket Number: ${ticketData.ticketNumber}
Student: ${ticketData.studentName} (${ticketData.studentEmail})
Order ID: ${ticketData.razorpayOrderId}
Amount: ₹${ticketData.amount}
Issue Type: ${ticketData.issueType}
Bank UTR / Ref: ${ticketData.utrReference || 'N/A'}

Description:
${ticketData.description}`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #ea580c; margin-top: 0;">Payment Support Ticket #${ticketData.ticketNumber}</h2>
        <p>A new payment issue ticket has been submitted by student <strong>${ticketData.studentName}</strong>.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
          <tr><td style="padding: 8px; font-weight: bold; background: #f8fafc; width: 140px;">Ticket No:</td><td style="padding: 8px; font-family: monospace;">${ticketData.ticketNumber}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; background: #f8fafc;">Student:</td><td style="padding: 8px;">${ticketData.studentName} (${ticketData.studentEmail})</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; background: #f8fafc;">Order ID:</td><td style="padding: 8px; font-family: monospace;">${ticketData.razorpayOrderId}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; background: #f8fafc;">Amount:</td><td style="padding: 8px;">₹${ticketData.amount}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; background: #f8fafc;">Issue Type:</td><td style="padding: 8px;">${ticketData.issueType}</td></tr>
          <tr><td style="padding: 8px; font-weight: bold; background: #f8fafc;">Bank UTR / Ref:</td><td style="padding: 8px;">${ticketData.utrReference || 'N/A'}</td></tr>
        </table>

        <div style="background: #f1f5f9; padding: 12px; border-radius: 8px; margin-top: 12px;">
          <strong>Description:</strong>
          <p style="margin: 6px 0 0 0; white-space: pre-wrap;">${ticketData.description}</p>
        </div>
      </div>
    `;

    // 1. Primary for QA / Mailtrap Sending API
    const mailtrapSent = await this.sendViaMailtrap({
      toEmail: supportEmail,
      subject,
      htmlContent,
      textContent,
      category: 'Support Ticket',
    });
    if (mailtrapSent) return;

    // 2. Primary for Cloud Environments: Brevo HTTP REST API (Port 443 HTTPS - Never blocked by Render)
    const brevoSent = await this.sendViaBrevo({
      toEmail: supportEmail,
      subject,
      htmlContent,
      textContent,
      replyToEmail: ticketData.studentEmail,
    });
    if (brevoSent) return;

    // 2. Direct Gmail SMTP
    const gmail = await this.getGmailTransporter();
    if (gmail) {
      try {
        await gmail.transporter.sendMail({
          from: `"PrimePlate Support" <${gmail.smtpUser}>`,
          to: supportEmail,
          replyTo: ticketData.studentEmail,
          subject,
          text: textContent,
          html: htmlContent,
        });

        this.logger.log(
          `Support ticket email #${ticketData.ticketNumber} delivered to ${supportEmail} via Nodemailer Gmail SMTP (${gmail.smtpUser}).`,
        );
        return;
      } catch (smtpErr: any) {
        this.logger.error(`SMTP Email delivery failed: ${smtpErr.message}`);
      }
    }

    // 2. Secondary fallback: Resend API (if configured)
    const apiKey = this.configService.get<string>('EMAIL_PROVIDER_API_KEY');
    if (apiKey) {
      const fromEmail =
        this.configService.get<string>('EMAIL_FROM') ||
        'PrimePlate <infoprimeplate@gmail.com>';
      const resendFrom =
        !fromEmail ||
        fromEmail.includes('primeplate.com') ||
        fromEmail.includes('gmail.com') ||
        this.configService.get<string>('EMAIL_DOMAIN_VERIFIED') !== 'true'
          ? 'PrimePlate <onboarding@resend.dev>'
          : fromEmail;

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: resendFrom,
            to: [supportEmail],
            reply_to: ticketData.studentEmail,
            subject,
            html: htmlContent,
            text: textContent,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          if (
            response.status === 403 &&
            errBody.includes('testing emails to your own email address')
          ) {
            const ownerEmailMatch = errBody.match(/\(([^)]+)\)/);
            const ownerEmail = ownerEmailMatch
              ? ownerEmailMatch[1]
              : supportEmail;
            this.logger.warn(
              `Resend sandbox mode detected. Retrying delivery to registered owner (${ownerEmail})...`,
            );

            const retryResponse = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                from: resendFrom,
                to: [ownerEmail],
                subject: `[TESTING - INTENDED FOR ${supportEmail}] ${subject}`,
                html: htmlContent,
                text: textContent,
              }),
            });

            if (retryResponse.ok) {
              this.logger.log(
                `Support ticket email #${ticketData.ticketNumber} delivered to Resend account owner inbox (${ownerEmail}).`,
              );
              return;
            } else {
              const retryErr = await retryResponse.text();
              this.logger.error(`Resend sandbox retry failed: ${retryErr}`);
            }
          } else {
            this.logger.error(
              `Resend API Support Email delivery failed (${response.status}): ${errBody}`,
            );
          }
        } else {
          this.logger.log(
            `Support ticket email #${ticketData.ticketNumber} successfully delivered to ${supportEmail} via Resend.`,
          );
          return;
        }
      } catch (err: any) {
        this.logger.error(`Error sending support email: ${err.message}`);
      }
    }

    // 4. Fallback log
    this.logger.log(
      `[EmailService] Support ticket email #${ticketData.ticketNumber} logged for ${supportEmail}: ${subject}`,
    );
  }

  /**
   * Generic email dispatcher using Mailtrap Sending API with fallback to Brevo/Gmail
   */
  async sendEmail(options: {
    toEmail: string;
    subject: string;
    textContent: string;
    htmlContent?: string;
    category?: string;
  }): Promise<boolean> {
    const mailtrapSent = await this.sendViaMailtrap({
      toEmail: options.toEmail,
      subject: options.subject,
      textContent: options.textContent,
      htmlContent: options.htmlContent,
      category: options.category || 'General',
    });
    if (mailtrapSent) return true;

    const brevoSent = await this.sendViaBrevo({
      toEmail: options.toEmail,
      subject: options.subject,
      htmlContent: options.htmlContent || `<p>${options.textContent}</p>`,
      textContent: options.textContent,
    });
    if (brevoSent) return true;

    const gmail = await this.getGmailTransporter();
    if (gmail) {
      try {
        await gmail.transporter.sendMail({
          from: `"PrimePlate" <${gmail.smtpUser}>`,
          to: options.toEmail,
          subject: options.subject,
          text: options.textContent,
          html: options.htmlContent || `<p>${options.textContent}</p>`,
        });
        return true;
      } catch (err: any) {
        this.logger.error(`SMTP delivery failed: ${err.message}`);
      }
    }

    this.logger.log(
      `[EmailService] Generic email simulated to ${options.toEmail}: ${options.subject}`,
    );
    return false;
  }
}
