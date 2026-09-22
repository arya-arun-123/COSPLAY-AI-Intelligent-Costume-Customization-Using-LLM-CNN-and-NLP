// Cloudflare Workers AI provider (FLUX.2 [klein] 4B).
// Same interface as geminiService.js:
//   generateDesignImage({ garmentType, creativePrompt, referenceImageBase64, referenceImageMimeType })
//   -> { imageBase64, mimeType }
//
// Required env vars:
//   CLOUDFLARE_ACCOUNT_ID
//   CLOUDFLARE_API_TOKEN          (token with Workers AI permission)
// Optional:
//   CLOUDFLARE_IMAGE_SIZE         (default 1024; 512 uses ~4x fewer free Neurons)

const MODEL = '@cf/black-forest-labs/flux-2-klein-4b';

// Cloudflare accepts reference images up to 512x512 (max 4). We send at most one.
const MAX_REFERENCE_PX = 512;

const GARMENT_NAMES = {
  TSHIRT: 't-shirt',
  SHIRT: 'shirt',
  HOODIE: 'hoodie',
  JEANS: 'jeans',
};

function sniffMime(buf) {
  if (buf.length > 3 && buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (
    buf.length > 11 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return 'image/png';
}

// Loaded lazily so text-only requests work even if "sharp" is not installed.
async function shrinkReference(base64) {
  let sharp;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch {
    throw new Error(
      'Reference images require the "sharp" package. Run: npm install sharp'
    );
  }

  return sharp(Buffer.from(base64, 'base64'))
    .rotate() // respect EXIF orientation
    .resize(MAX_REFERENCE_PX, MAX_REFERENCE_PX, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}

export async function generateDesignImage({
  garmentType,
  creativePrompt,
  referenceImageBase64,
}) {
  // Read env at call time so load order (dotenv) never matters.
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      'CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be configured'
    );
  }

  const size = String(parseInt(process.env.CLOUDFLARE_IMAGE_SIZE, 10) || 1024);
  const garment =
    GARMENT_NAMES[garmentType] || String(garmentType || 'garment').toLowerCase();

  const prompt = [
    `A realistic image of a customized ${garment}, shown clearly and in full.`,
    `Design instructions: ${creativePrompt}`,
    referenceImageBase64
      ? "Use the provided reference image as visual guidance for the garment and apply the user's design instructions."
      : '',
    'Do not add logos or branding unless explicitly requested in the design instructions.',
  ]
    .filter(Boolean)
    .join('\n');

  // FLUX.2 models on Workers AI take multipart/form-data (even for text only).
  // Do NOT set Content-Type manually: fetch adds the multipart boundary itself.
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('width', size);
  form.append('height', size);

  if (referenceImageBase64) {
    const small = await shrinkReference(referenceImageBase64);
    form.append(
      'input_image_0',
      new Blob([small], { type: 'image/png' }),
      'reference.png'
    );
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');

    let providerCode = null;
    let providerMessage = '';

    try {
      const parsed = JSON.parse(detail);
      providerCode = parsed.errors?.[0]?.code ?? null;
      providerMessage = parsed.errors?.[0]?.message ?? '';
    } catch {
      providerMessage = detail;
    }

    const error = new Error(
      providerMessage || `Cloudflare image request failed (${res.status})`
    );

    error.providerCode = providerCode;
    error.providerStatus = res.status;

    throw error;
  }

  // Handle both response styles: JSON { result: { image: base64 } } or raw image bytes.
  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim();
  let imageBuffer;

  if (contentType === 'application/json') {
    const json = await res.json();

    if (json.success === false) {
      const msg = (json.errors || []).map((e) => e.message).join('; ');
      throw new Error(`Cloudflare image request failed: ${msg || 'unknown error'}`);
    }

    const b64 = json.result?.image;
    if (!b64) {
      throw new Error('Cloudflare did not return a generated image');
    }
    imageBuffer = Buffer.from(b64, 'base64');
  } else {
    imageBuffer = Buffer.from(await res.arrayBuffer());
  }

  if (!imageBuffer.length) {
    throw new Error('Cloudflare did not return a generated image');
  }

  return {
    imageBase64: imageBuffer.toString('base64'),
    mimeType: contentType.startsWith('image/') ? contentType : sniffMime(imageBuffer),
  };
}
