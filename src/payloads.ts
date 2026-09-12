/**
 * Pure payload builders and validators for QRForge.
 *
 * Every builder returns the payload string ready for QR encoding and throws a
 * ValidationError with a user-facing message on invalid input. No DOM access
 * happens here — the module is fully testable in Node.
 */

export class ValidationError extends Error {
  /** Optional DOM field id the error should be attached to (used by main.ts). */
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEL_ALLOWED_PATTERN = /^[0-9+\-().\s]*$/;
const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

function trim(value: string | undefined): string {
  return (value ?? '').trim();
}

function requireNonEmpty(value: string, message: string, field?: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ValidationError(message, field);
  return trimmed;
}

/** Parses a URL, prepending https:// when the scheme is missing; requires http/https. */
function toHttpUrl(input: string, message: string, field?: string): URL {
  const trimmed = input.trim();
  const withScheme = SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ValidationError(message, field);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError(message, field);
  }
  return url;
}

/** Validates and normalizes a URL for the URL QR type (empty input gets its own hint). */
export function normalizeUrl(input: string): string {
  requireNonEmpty(input, 'Enter a URL to generate a QR code', 'url-input');
  return toHttpUrl(input, 'Enter a valid URL (http or https)', 'url-input').toString();
}

/** Validates and normalizes a scheme-less or full URL (used for vCard websites). */
export function normalizeWebsite(input: string): string {
  return toHttpUrl(input, 'Enter a valid website URL', 'vcard-website').toString();
}

/** Text QR type: the payload is the raw text; emptiness is rejected here. */
export function buildTextPayload(input: string): string {
  return requireNonEmpty(input, 'Enter content to generate a QR code', 'text-input');
}

export type WifiEncryption = 'WPA' | 'WEP' | 'nopass';

/**
 * Escapes the special characters (\ ; , :) per the ZXing Wi-Fi QR convention.
 */
function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

/** Builds a WIFI: payload. Password is required for WPA/WEP and omitted for open networks. */
export function buildWifiPayload(options: {
  ssid: string;
  password?: string;
  encryption: WifiEncryption;
  hidden?: boolean;
}): string {
  const { encryption, hidden = false } = options;
  const ssid = requireNonEmpty(options.ssid, 'Enter a network name (SSID)', 'wifi-ssid');
  const password = trim(options.password);

  if (encryption !== 'nopass' && !password) {
    throw new ValidationError('Enter the Wi-Fi password', 'wifi-password');
  }

  let payload = `WIFI:T:${encryption};S:${escapeWifi(ssid)};`;
  if (encryption !== 'nopass') payload += `P:${escapeWifi(password)};`;
  if (hidden) payload += 'H:true;';
  return `${payload};`;
}

/** Validates an email address; returns the trimmed address. */
function requireEmail(input: string, field: string): string {
  const address = requireNonEmpty(input, 'Enter an email address', field);
  if (!EMAIL_PATTERN.test(address)) throw new ValidationError('Enter a valid email address', field);
  return address;
}

/** Builds a mailto: payload with optional subject and body. */
export function buildEmailPayload(options: {
  to: string;
  subject?: string;
  body?: string;
}): string {
  const to = requireEmail(options.to, 'email-to');
  const params = new URLSearchParams();
  const subject = trim(options.subject);
  const body = trim(options.body);
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const query = params.toString();
  return query ? `mailto:${to}?${query}` : `mailto:${to}`;
}

/** Validates a phone number; returns the digits-only tel URI value (no scheme). */
function requirePhone(input: string, field: string): string {
  const raw = requireNonEmpty(input, 'Enter a phone number', field);
  if (!TEL_ALLOWED_PATTERN.test(raw) || !/\d/.test(raw)) {
    throw new ValidationError('Enter a valid phone number', field);
  }
  return raw.replace(/\s+/g, '');
}

/** Builds a tel: payload; spaces are stripped from the URI. */
export function buildPhonePayload(input: string): string {
  return `tel:${requirePhone(input, 'phone-number')}`;
}

/** Builds an SMSTO: payload; the message is optional. */
export function buildSmsPayload(options: { number: string; message?: string }): string {
  const number = requirePhone(options.number, 'sms-number');
  const message = trim(options.message);
  return `SMSTO:${number}:${message}`;
}

export interface VcardInput {
  fullName: string;
  organization?: string;
  jobTitle?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
}

/** Builds a vCard 3.0 payload; only lines with values are included. */
export function buildVcardPayload(input: VcardInput): string {
  const fullName = requireNonEmpty(input.fullName, 'Enter at least a full name', 'vcard-fullname');

  const website = trim(input.website);
  if (website) normalizeWebsite(website);

  const email = trim(input.email);
  if (email && !EMAIL_PATTERN.test(email)) {
    throw new ValidationError('Enter a valid email address', 'vcard-email');
  }

  // vCard N: split — first word is the given name, the remainder is the family name.
  const words = fullName.split(/\s+/);
  const firstName = words[0] ?? '';
  const lastName = words.slice(1).join(' ');

  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${lastName};${firstName};;;`, `FN:${fullName}`];

  const organization = trim(input.organization);
  if (organization) lines.push(`ORG:${organization}`);

  const jobTitle = trim(input.jobTitle);
  if (jobTitle) lines.push(`TITLE:${jobTitle}`);

  const phone = trim(input.phone);
  if (phone) lines.push(`TEL;TYPE=CELL:${requirePhone(phone, 'vcard-phone')}`);

  if (email) lines.push(`EMAIL:${email}`);

  if (website) lines.push(`URL:${normalizeWebsite(website)}`);

  const address = trim(input.address);
  if (address) lines.push(`ADR:;;${address};;;`);

  lines.push('END:VCARD');
  return lines.join('\n');
}
