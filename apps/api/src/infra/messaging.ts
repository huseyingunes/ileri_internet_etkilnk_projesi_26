import { Global, Inject, Module } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { z } from 'zod';
import { withTimeout } from '../common/timeout.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/*
 * Outbound messaging ports (prompt: external services behind interfaces,
 * in-memory fakes in tests). Every call is bounded by EXTERNAL_CALL_TIMEOUT_MS.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<{ messageId: string }>;
}

export interface WhatsAppTemplateMessage {
  /** E.164 phone number. */
  to: string;
  /** Name of a template approved by Meta. */
  template: string;
  language: string;
  parameters: string[];
}

export interface WhatsAppSender {
  readonly enabled: boolean;
  sendTemplate(message: WhatsAppTemplateMessage): Promise<{ messageId: string }>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
export const WHATSAPP_SENDER = Symbol('WHATSAPP_SENDER');

export class MemoryEmailSender implements EmailSender {
  static readonly shared = new MemoryEmailSender();
  readonly outbox: EmailMessage[] = [];
  private counter = 0;

  send(message: EmailMessage): Promise<{ messageId: string }> {
    this.outbox.push(message);
    this.counter += 1;
    return Promise.resolve({ messageId: `memory-email-${String(this.counter)}` });
  }
}

export class SmtpEmailSender implements EmailSender {
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly from: string,
    private readonly timeoutMs: number,
  ) {
    const parsed = new URL(url);
    const secure = parsed.protocol === 'smtps:';
    this.transport = createTransport({
      host: parsed.hostname,
      port: parsed.port === '' ? (secure ? 465 : 587) : Number(parsed.port),
      secure,
      ...(parsed.username === ''
        ? {}
        : {
            auth: {
              user: decodeURIComponent(parsed.username),
              pass: decodeURIComponent(parsed.password),
            },
          }),
      connectionTimeout: timeoutMs,
      greetingTimeout: timeoutMs,
      socketTimeout: timeoutMs,
    });
  }

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const info = await withTimeout(
      'smtp.send',
      this.timeoutMs,
      this.transport.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        // Plain text only: user-provided content never becomes HTML.
        text: message.text,
      }),
    );
    return { messageId: info.messageId };
  }
}

export class MemoryWhatsAppSender implements WhatsAppSender {
  static readonly shared = new MemoryWhatsAppSender();
  readonly enabled = true;
  readonly outbox: WhatsAppTemplateMessage[] = [];
  private counter = 0;

  sendTemplate(message: WhatsAppTemplateMessage): Promise<{ messageId: string }> {
    this.outbox.push(message);
    this.counter += 1;
    return Promise.resolve({ messageId: `wamid.memory-${String(this.counter)}` });
  }
}

export class DisabledWhatsAppSender implements WhatsAppSender {
  readonly enabled = false;

  sendTemplate(): Promise<{ messageId: string }> {
    return Promise.reject(new Error('WhatsApp is disabled'));
  }
}

const sendResponseSchema = z.object({
  messages: z.tuple([z.object({ id: z.string().min(1).max(255) })], z.unknown()),
});

/** WhatsApp Cloud API: template messages only (free-form text needs an open session). */
export class CloudWhatsAppSender implements WhatsAppSender {
  readonly enabled = true;

  constructor(
    private readonly env: Env & { WHATSAPP_PHONE_NUMBER_ID: string; WHATSAPP_ACCESS_TOKEN: string },
  ) {}

  async sendTemplate(message: WhatsAppTemplateMessage): Promise<{ messageId: string }> {
    const url = `https://graph.facebook.com/${this.env.WHATSAPP_API_VERSION}/${this.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: message.to.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: message.template,
          language: { code: message.language },
          components: [
            {
              type: 'body',
              parameters: message.parameters.map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(this.env.EXTERNAL_CALL_TIMEOUT_MS),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`WhatsApp API responded ${String(response.status)}`);
    const parsed = sendResponseSchema.safeParse(body);
    if (!parsed.success) throw new Error('WhatsApp API returned no message id');
    return { messageId: parsed.data.messages[0].id };
  }
}

function whatsAppSender(env: Env): WhatsAppSender {
  if (env.WHATSAPP_DRIVER === 'memory') return MemoryWhatsAppSender.shared;
  const { WHATSAPP_PHONE_NUMBER_ID: phoneId, WHATSAPP_ACCESS_TOKEN: token } = env;
  if (env.WHATSAPP_DRIVER === 'cloud' && phoneId !== undefined && token !== undefined) {
    return new CloudWhatsAppSender({
      ...env,
      WHATSAPP_PHONE_NUMBER_ID: phoneId,
      WHATSAPP_ACCESS_TOKEN: token,
    });
  }
  return new DisabledWhatsAppSender();
}

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      inject: [ENV],
      useFactory: (env: Env): EmailSender =>
        env.EMAIL_DRIVER === 'memory' || env.SMTP_URL === undefined
          ? MemoryEmailSender.shared
          : new SmtpEmailSender(env.SMTP_URL, env.EMAIL_FROM, env.EXTERNAL_CALL_TIMEOUT_MS),
    },
    { provide: WHATSAPP_SENDER, inject: [ENV], useFactory: whatsAppSender },
  ],
  exports: [EMAIL_SENDER, WHATSAPP_SENDER],
})
export class MessagingModule {}

export const InjectEmail = () => Inject(EMAIL_SENDER);
export const InjectWhatsApp = () => Inject(WHATSAPP_SENDER);
