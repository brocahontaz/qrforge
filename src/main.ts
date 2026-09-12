/**
 * QRForge UI wiring: type switching, live validation + preview, options,
 * PNG/SVG export, PNG clipboard copy, and reset.
 */

import './styles.css';
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
import {
  qrSvgString,
  renderQrToCanvas,
  canvasToPngBlob,
  svgBlob,
  downloadBlob,
  copyPngToClipboard,
} from './qr';

type QrType = 'url' | 'text' | 'wifi' | 'email' | 'phone' | 'sms' | 'vcard';
type Ecc = 'L' | 'M' | 'Q' | 'H';

const FIRST_FIELD: Record<QrType, string> = {
  url: 'url-input',
  text: 'text-input',
  wifi: 'wifi-ssid',
  email: 'email-to',
  phone: 'phone-number',
  sms: 'sms-number',
  vcard: 'vcard-fullname',
};

const ECC_VALUES: readonly Ecc[] = ['L', 'M', 'Q', 'H'];

const canvas = document.getElementById('qr-canvas') as HTMLCanvasElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;
const form = document.getElementById('qr-form') as HTMLFormElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
const pngBtn = document.getElementById('png-btn') as HTMLButtonElement;
const svgBtn = document.getElementById('svg-btn') as HTMLButtonElement;
const sizeSelect = document.getElementById('opt-size') as HTMLSelectElement;
const eccSelect = document.getElementById('opt-ecc') as HTMLSelectElement;
const marginInput = document.getElementById('opt-margin') as HTMLInputElement;
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
const typeRadios = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="qr-type"]'));

let activeType: QrType = 'url';
let lastPayload: string | null = null;
let lastSvg: string | null = null;
let lastSize = 512;
let renderToken = 0;

const val = (id: string): string => (document.getElementById(id) as HTMLInputElement).value.trim();
const isChecked = (id: string): boolean =>
  (document.getElementById(id) as HTMLInputElement).checked;

function readOptions(): { size: number; margin: number; ecc: Ecc } {
  const size = Number(sizeSelect.value);
  const ecc = ECC_VALUES.includes(eccSelect.value as Ecc) ? (eccSelect.value as Ecc) : 'M';
  const rawMargin = Math.round(Number(marginInput.value));
  const margin = Number.isFinite(rawMargin) ? Math.min(10, Math.max(0, rawMargin)) : 4;
  return { size, margin, ecc };
}

function buildPayload(type: QrType): string {
  switch (type) {
    case 'url':
      return normalizeUrl(val('url-input'));
    case 'text':
      return buildTextPayload(val('text-input'));
    case 'wifi':
      return buildWifiPayload({
        ssid: val('wifi-ssid'),
        password: val('wifi-password'),
        encryption: val('wifi-encryption') as 'WPA' | 'WEP' | 'nopass',
        hidden: isChecked('wifi-hidden'),
      });
    case 'email':
      return buildEmailPayload({
        to: val('email-to'),
        subject: val('email-subject'),
        body: val('email-body'),
      });
    case 'phone':
      return buildPhonePayload(val('phone-number'));
    case 'sms':
      return buildSmsPayload({ number: val('sms-number'), message: val('sms-message') });
    case 'vcard':
      return buildVcardPayload({
        fullName: val('vcard-fullname'),
        organization: val('vcard-org'),
        jobTitle: val('vcard-title'),
        phone: val('vcard-phone'),
        email: val('vcard-email'),
        website: val('vcard-website'),
        address: val('vcard-address'),
      });
  }
}

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function clearFieldErrors(): void {
  for (const el of form.querySelectorAll<HTMLParagraphElement>('.field-error')) {
    el.hidden = true;
    el.textContent = '';
  }
}

function showFieldError(field: string | undefined, message: string): void {
  if (!field) return;
  const errorEl = document.getElementById(`error-${field}`);
  if (errorEl instanceof HTMLParagraphElement) {
    errorEl.hidden = false;
    errorEl.textContent = message;
  }
}

function setButtons(enabled: boolean): void {
  copyBtn.disabled = !enabled;
  pngBtn.disabled = !enabled;
  svgBtn.disabled = !enabled;
}

function clearCanvas(): void {
  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
}

/** Live render: validates the active payload, then draws canvas + SVG. */
async function render(): Promise<void> {
  const token = ++renderToken;
  const { size, margin, ecc } = readOptions();
  clearFieldErrors();

  let payload: string | null = null;
  try {
    payload = buildPayload(activeType);
  } catch (error) {
    payload = null;
    if (error instanceof ValidationError) {
      setStatus(error.message);
      showFieldError(error.field, error.message);
    } else {
      setStatus('Something went wrong');
    }
  }

  if (payload === null) {
    lastPayload = null;
    lastSvg = null;
    setButtons(false);
    clearCanvas();
    return;
  }

  try {
    const svg = await qrSvgString(payload, { size, margin, errorCorrectionLevel: ecc });
    if (token !== renderToken) return;
    await renderQrToCanvas(canvas, payload, { size, margin, errorCorrectionLevel: ecc });
    if (token !== renderToken) return;
    lastPayload = payload;
    lastSvg = svg;
    lastSize = size;
    setStatus('Ready to scan');
    setButtons(true);
  } catch (error) {
    if (token !== renderToken) return;
    lastPayload = null;
    lastSvg = null;
    setButtons(false);
    clearCanvas();
    setStatus(error instanceof ValidationError ? error.message : 'Could not generate QR code');
  }
}

/** Composites the QR canvas onto a white background so exports stay scannable. */
function compositeOnWhite(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new ValidationError('PNG export is not supported in this browser');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(source, 0, 0);
  return out;
}

function withWhiteBackground(svg: string): string {
  return svg.replace(/(<svg[^>]*>)/, '$1<rect width="100%" height="100%" fill="#ffffff"/>');
}

function setType(type: QrType, focusFirst = true): void {
  activeType = type;
  for (const el of form.querySelectorAll<HTMLElement>('fieldset[data-type]')) {
    el.hidden = el.dataset.type !== type;
  }
  for (const radio of typeRadios) radio.checked = radio.value === type;
  if (focusFirst) document.getElementById(FIRST_FIELD[type])?.focus();
}

copyBtn.addEventListener('click', async () => {
  try {
    await copyPngToClipboard(compositeOnWhite(canvas));
    setStatus('Copied PNG to clipboard');
  } catch (error) {
    setStatus(error instanceof ValidationError ? error.message : 'Could not copy image');
  }
});

pngBtn.addEventListener('click', async () => {
  if (lastPayload === null) return;
  try {
    const blob = await canvasToPngBlob(compositeOnWhite(canvas));
    downloadBlob(blob, `qrforge-${activeType}-${lastSize}.png`);
    setStatus('Downloaded PNG');
  } catch (error) {
    setStatus(error instanceof ValidationError ? error.message : 'Could not export PNG');
  }
});

svgBtn.addEventListener('click', () => {
  if (lastSvg === null) return;
  downloadBlob(svgBlob(withWhiteBackground(lastSvg)), `qrforge-${activeType}-${lastSize}.svg`);
  setStatus('Downloaded SVG');
});

for (const radio of typeRadios) {
  radio.addEventListener('change', () => {
    if (radio.checked) setType(radio.value as QrType);
    render();
  });
}

for (const el of [sizeSelect, eccSelect, marginInput]) {
  el.addEventListener('change', render);
}

form.addEventListener('input', render);
form.addEventListener('change', render);

resetBtn.addEventListener('click', () => {
  form.reset();
  sizeSelect.value = '512';
  eccSelect.value = 'M';
  marginInput.value = '4';
  setType('url', false);
  setStatus('Reset — enter content to create another QR code');
  render();
  document.getElementById(FIRST_FIELD.url)?.focus();
});

setType('url', false);
render();
