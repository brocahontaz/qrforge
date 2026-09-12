import { describe, expect, it } from 'vitest';
import {
  normalizeUrl,
  buildTextPayload,
  buildWifiPayload,
  buildEmailPayload,
  buildPhonePayload,
  buildSmsPayload,
  buildVcardPayload,
  ValidationError,
} from './payloads';

describe('normalizeUrl', () => {
  it('prepends https:// when the scheme is missing', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com/');
  });

  it('accepts http and https URLs', () => {
    expect(normalizeUrl('http://example.com/path')).toBe('http://example.com/path');
    expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
  });

  it('rejects non-http(s) protocols', () => {
    expect(() => normalizeUrl('javascript:alert(1)')).toThrow(ValidationError);
    expect(() => normalizeUrl('ftp://example.com')).toThrow(ValidationError);
  });

  it('rejects garbage and empty input', () => {
    expect(() => normalizeUrl('not a url')).toThrow(ValidationError);
    expect(() => normalizeUrl('')).toThrow(ValidationError);
  });
});

describe('buildTextPayload', () => {
  it('returns the raw text', () => {
    expect(buildTextPayload('Hello')).toBe('Hello');
  });

  it('rejects empty text', () => {
    expect(() => buildTextPayload('   ')).toThrow(ValidationError);
  });
});

describe('buildWifiPayload', () => {
  it('escapes special characters in WPA payloads', () => {
    expect(
      buildWifiPayload({ ssid: 'a;b,c:d"e\\f', password: 'p:1', encryption: 'WPA', hidden: false }),
    ).toBe('WIFI:T:WPA;S:a\\;b\\,c\\:d\\"e\\\\f;P:p\\:1;;');
  });

  it('builds WEP payloads', () => {
    expect(
      buildWifiPayload({ ssid: 'net', password: '12345', encryption: 'WEP', hidden: false }),
    ).toBe('WIFI:T:WEP;S:net;P:12345;;');
  });

  it('omits the password for open networks', () => {
    expect(
      buildWifiPayload({ ssid: 'net', password: '', encryption: 'nopass', hidden: false }),
    ).toBe('WIFI:T:nopass;S:net;;');
  });

  it('marks hidden networks only when hidden', () => {
    expect(buildWifiPayload({ ssid: 'net', password: 'p', encryption: 'WPA', hidden: true })).toBe(
      'WIFI:T:WPA;S:net;P:p;H:true;;',
    );
  });

  it('rejects missing SSID and password', () => {
    expect(() =>
      buildWifiPayload({ ssid: '', password: 'p', encryption: 'WPA', hidden: false }),
    ).toThrow(ValidationError);
    expect(() =>
      buildWifiPayload({ ssid: 'net', password: '', encryption: 'WPA', hidden: false }),
    ).toThrow(ValidationError);
  });
});

describe('buildEmailPayload', () => {
  it('builds mailto with subject and body', () => {
    expect(
      buildEmailPayload({ to: 'ada@example.com', subject: 'Hello World', body: 'Line 1' }),
    ).toBe('mailto:ada@example.com?subject=Hello+World&body=Line+1');
  });

  it('builds a plain mailto', () => {
    expect(buildEmailPayload({ to: 'ada@example.com' })).toBe('mailto:ada@example.com');
  });

  it('rejects invalid addresses', () => {
    expect(() => buildEmailPayload({ to: 'not-an-email' })).toThrow(ValidationError);
    expect(() => buildEmailPayload({ to: '' })).toThrow(ValidationError);
  });
});

describe('buildPhonePayload', () => {
  it('strips spaces from the tel URI', () => {
    expect(buildPhonePayload('+1 555 123 4567')).toBe('tel:+15551234567');
  });

  it('rejects invalid numbers', () => {
    expect(() => buildPhonePayload('call me')).toThrow(ValidationError);
    expect(() => buildPhonePayload('---')).toThrow(ValidationError);
    expect(() => buildPhonePayload('')).toThrow(ValidationError);
  });
});

describe('buildSmsPayload', () => {
  it('builds SMSTO with a message', () => {
    expect(buildSmsPayload({ number: '+1 555 123 4567', message: 'Hi' })).toBe(
      'SMSTO:+15551234567:Hi',
    );
  });

  it('builds SMSTO without a message', () => {
    expect(buildSmsPayload({ number: '+15551234567' })).toBe('SMSTO:+15551234567:');
  });

  it('rejects invalid numbers', () => {
    expect(() => buildSmsPayload({ number: 'abc' })).toThrow(ValidationError);
  });
});

describe('buildVcardPayload', () => {
  it('includes only lines with values', () => {
    const payload = buildVcardPayload({ fullName: 'Ada Lovelace', phone: '+1 555 123 4567' });
    expect(payload).toContain('BEGIN:VCARD');
    expect(payload).toContain('VERSION:3.0');
    expect(payload).toContain('N:Lovelace;Ada;;;');
    expect(payload).toContain('FN:Ada Lovelace');
    expect(payload).toContain('TEL;TYPE=CELL:+15551234567');
    expect(payload).toContain('END:VCARD');
    expect(payload).not.toContain('ORG:');
    expect(payload).not.toContain('TITLE:');
    expect(payload).not.toContain('EMAIL:');
    expect(payload).not.toContain('URL:');
    expect(payload).not.toContain('ADR:;;');
  });

  it('splits multi-word family names', () => {
    const payload = buildVcardPayload({ fullName: 'Ada Mary King Lovelace' });
    expect(payload).toContain('N:Mary King Lovelace;Ada;;;');
  });

  it('validates embedded email and website', () => {
    expect(() => buildVcardPayload({ fullName: 'Ada', email: 'bad' })).toThrow(ValidationError);
    expect(() => buildVcardPayload({ fullName: 'Ada', website: 'not a url' })).toThrow(
      ValidationError,
    );
  });

  it('normalizes scheme-less websites', () => {
    expect(buildVcardPayload({ fullName: 'Ada', website: 'example.com' })).toContain(
      'URL:https://example.com/',
    );
  });

  it('rejects missing full name', () => {
    expect(() => buildVcardPayload({ fullName: '  ' })).toThrow(ValidationError);
  });
});
