/**
 * Thin wrapper around the `qrcode` library for QRForge.
 *
 * Library errors (e.g. capacity overflow) are surfaced as ValidationError so
 * the UI can render them like validation messages. Only `renderQrToCanvas` and
 * the clipboard/export helpers touch the DOM; the rest is testable in Node.
 */

import QRCode from 'qrcode';
import { ValidationError } from './payloads';

export type Ecc = 'L' | 'M' | 'Q' | 'H';

export interface QrRenderOptions {
  /** Canvas width in pixels (also used as the SVG width attribute). */
  size: number;
  /** Quiet zone in modules. */
  margin: number;
  errorCorrectionLevel: Ecc;
}

const ECC_VALUES: readonly Ecc[] = ['L', 'M', 'Q', 'H'];
const MIN_SIZE = 64;
const MAX_SIZE = 4096;
const MIN_MARGIN = 0;
const MAX_MARGIN = 16;

function wrapError(error: unknown): ValidationError {
  if (error instanceof ValidationError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new ValidationError(message || 'Could not generate QR code');
}

function validateText(text: string): void {
  if (!text.trim()) throw new ValidationError('Enter content to generate a QR code');
}

function validateOptions(options: QrRenderOptions): void {
  const { size, margin, errorCorrectionLevel } = options;
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    throw new ValidationError(`QR size must be between ${MIN_SIZE} and ${MAX_SIZE} px`);
  }
  if (!Number.isInteger(margin) || margin < MIN_MARGIN || margin > MAX_MARGIN) {
    throw new ValidationError(`Margin must be between ${MIN_MARGIN} and ${MAX_MARGIN} modules`);
  }
  if (!ECC_VALUES.includes(errorCorrectionLevel)) {
    throw new ValidationError('Invalid error correction level');
  }
}

/** Renders the QR code as SVG markup; rejects with ValidationError on bad input. */
export async function qrSvgString(text: string, options: QrRenderOptions): Promise<string> {
  validateText(text);
  validateOptions(options);
  try {
    return await QRCode.toString(text, {
      type: 'svg',
      width: options.size,
      margin: options.margin,
      errorCorrectionLevel: options.errorCorrectionLevel,
    });
  } catch (error) {
    throw wrapError(error);
  }
}

/** Renders the QR code onto a canvas element; browser-bound. */
export async function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  options: QrRenderOptions,
): Promise<void> {
  validateText(text);
  validateOptions(options);
  try {
    await QRCode.toCanvas(canvas, text, {
      width: options.size,
      margin: options.margin,
      errorCorrectionLevel: options.errorCorrectionLevel,
    });
  } catch (error) {
    throw wrapError(error);
  }
}

/** Creates an SVG blob for download. */
export function svgBlob(svg: string): Blob {
  return new Blob([svg], { type: 'image/svg+xml' });
}

/** Exports a canvas as a PNG blob; browser-bound. */
export async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  // OffscreenCanvas-style convertToBlob may exist on some runtimes; the standard
  // DOM type only guarantees toBlob, so probe for it defensively.
  type WithConvertToBlob = HTMLCanvasElement & {
    convertToBlob?: (options?: { type?: string }) => Promise<Blob>;
  };
  const maybe = canvas as WithConvertToBlob;
  if (typeof maybe.convertToBlob === 'function') {
    return maybe.convertToBlob({ type: 'image/png' });
  }
  if (typeof canvas.toBlob === 'function') {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new ValidationError('Could not export PNG'))),
        'image/png',
      );
    });
  }
  throw new ValidationError('PNG export is not supported in this browser');
}

/** Triggers a browser download for a blob; browser-bound. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Copies a canvas image to the clipboard as PNG; browser-bound. */
export async function copyPngToClipboard(canvas: HTMLCanvasElement): Promise<void> {
  const clipboard = navigator.clipboard;
  if (!clipboard || typeof clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
    throw new ValidationError('Copying images is not supported in this browser');
  }
  let blob: Blob;
  try {
    blob = await canvasToPngBlob(canvas);
    await clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('Could not copy the image to the clipboard');
  }
}
