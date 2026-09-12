import { describe, expect, it } from 'vitest';
import { qrSvgString, svgBlob } from './qr';
import { ValidationError } from './payloads';

const OPTS = { size: 256, margin: 4, errorCorrectionLevel: 'M' as const };

describe('qrSvgString', () => {
  it('returns SVG markup', async () => {
    const svg = await qrSvgString('https://example.com', OPTS);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('rejects empty text', async () => {
    await expect(qrSvgString('', OPTS)).rejects.toThrow(ValidationError);
  });

  it('rejects overlong text with a ValidationError', async () => {
    const overlong = 'x'.repeat(4000);
    await expect(qrSvgString(overlong, OPTS)).rejects.toThrow(ValidationError);
  });

  it('validates render options', async () => {
    await expect(
      qrSvgString('hi', { size: 10, margin: 4, errorCorrectionLevel: 'M' }),
    ).rejects.toThrow(ValidationError);
    await expect(
      qrSvgString('hi', { size: 256, margin: 40, errorCorrectionLevel: 'M' }),
    ).rejects.toThrow(ValidationError);
    await expect(
      qrSvgString('hi', { size: 256, margin: 4, errorCorrectionLevel: 'X' as 'H' }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('svgBlob', () => {
  it('creates an SVG blob', () => {
    const blob = svgBlob('<svg></svg>');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/svg+xml');
  });
});
