// ============================================================
// Cloudflare Workers AI provider
// FLUX.2 [klein] 4B
// ============================================================
//
// Same interface as geminiService.js:
//
// generateDesignImage({
//   garmentType,
//   creativePrompt,
//   referenceImageBase64,
//   referenceImageMimeType
// })
//
// Returns:
//
// {
//   imageBase64,
//   mimeType
// }
//
// Required env vars:
//
//   CLOUDFLARE_ACCOUNT_ID
//   CLOUDFLARE_API_TOKEN
//
// Optional:
//
//   CLOUDFLARE_IMAGE_SIZE
//
// Default image size:
//   1024
//
// ============================================================

const MODEL =
  '@cf/black-forest-labs/flux-2-klein-4b';

// Cloudflare accepts reference images up to
// 512x512. We send at most one reference image.
const MAX_REFERENCE_PX = 512;

// ============================================================
// GARMENT NAMES
// ============================================================

const GARMENT_NAMES = {
  TSHIRT: 't-shirt',
  SHIRT: 'shirt',
  HOODIE: 'hoodie',
  JEANS: 'jeans',
};

// ============================================================
// DETECT IMAGE MIME TYPE
// ============================================================

function sniffMime(buf) {
  if (
    buf.length > 3 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50
  ) {
    return 'image/png';
  }

  if (
    buf.length > 2 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8
  ) {
    return 'image/jpeg';
  }

  if (
    buf.length > 11 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return 'image/png';
}

// ============================================================
// RESIZE REFERENCE IMAGE
// ============================================================
//
// Loaded lazily so text-only requests can work even when
// sharp is not installed.
//

async function shrinkReference(base64) {
  let sharp;

  try {
    ({ default: sharp } =
      await import('sharp'));
  } catch {
    throw new Error(
      'Reference images require the "sharp" package. Run: npm install sharp'
    );
  }

  return sharp(
    Buffer.from(base64, 'base64')
  )
    .rotate()
    .resize(
      MAX_REFERENCE_PX,
      MAX_REFERENCE_PX,
      {
        fit: 'inside',
        withoutEnlargement: true,
      }
    )
    .png()
    .toBuffer();
}

// ============================================================
// EXTRACT CLOUDFLARE ERROR MESSAGE
// ============================================================

function extractCloudflareErrorMessage(
  detail
) {
  if (!detail) {
    return '';
  }

  // ----------------------------------------------------------
  // Try to parse JSON response
  // ----------------------------------------------------------

  try {
    const parsed =
      JSON.parse(detail);

    if (
      Array.isArray(parsed.errors) &&
      parsed.errors.length > 0
    ) {
      return parsed.errors
        .map(
          (error) =>
            error?.message ||
            error?.code ||
            ''
        )
        .filter(Boolean)
        .join('; ');
    }

    if (
      parsed.error &&
      typeof parsed.error === 'string'
    ) {
      return parsed.error;
    }

    if (
      parsed.message &&
      typeof parsed.message === 'string'
    ) {
      return parsed.message;
    }
  } catch {
    // Response wasn't JSON.
    // Continue with plain text handling.
  }

  return String(detail).trim();
}

// ============================================================
// CONVERT CLOUDFLARE ERROR INTO USER-FRIENDLY ERROR
// ============================================================

function createCloudflareError(
  status,
  detail
) {
  const message =
    extractCloudflareErrorMessage(
      detail
    );

  const normalizedMessage =
    message.toLowerCase();

  // ----------------------------------------------------------
  // SAFETY / CONTENT FILTER
  // ----------------------------------------------------------

  if (
    normalizedMessage.includes(
      'flagged'
    ) ||
    normalizedMessage.includes(
      'safety'
    ) ||
    normalizedMessage.includes(
      'content policy'
    ) ||
    normalizedMessage.includes(
      'moderation'
    )
  ) {
    return new Error(
      'We could not generate this design because the selected prompt or reference image was rejected by the image-generation safety filter. Please try changing the design description or using a different reference image.'
    );
  }

  // ----------------------------------------------------------
  // BAD REQUEST
  // ----------------------------------------------------------

  if (status === 400) {
    return new Error(
      'The image-generation request could not be processed. Please try changing your design prompt or reference image.'
    );
  }

  // ----------------------------------------------------------
  // AUTHENTICATION
  // ----------------------------------------------------------

  if (
    status === 401 ||
    status === 403
  ) {
    return new Error(
      'The image-generation service is not authorized correctly. Please check the Cloudflare API configuration.'
    );
  }

  // ----------------------------------------------------------
  // RATE LIMIT
  // ----------------------------------------------------------

  if (status === 429) {
    return new Error(
      'The image-generation service is temporarily busy. Please wait a moment and try again.'
    );
  }

  // ----------------------------------------------------------
  // SERVER ERROR
  // ----------------------------------------------------------

  if (status >= 500) {
    return new Error(
      'The image-generation service is temporarily unavailable. Please try again in a moment.'
    );
  }

  // ----------------------------------------------------------
  // GENERIC ERROR
  // ----------------------------------------------------------

  return new Error(
    `Cloudflare image generation failed (${status}). Please try again.`
  );
}

// ============================================================
// GENERATE DESIGN IMAGE
// ============================================================

export async function generateDesignImage({
  garmentType,
  creativePrompt,
  referenceImageBase64,
  referenceImageMimeType,
}) {
  // ----------------------------------------------------------
  // Read environment variables at call time
  // ----------------------------------------------------------

  const accountId =
    process.env.CLOUDFLARE_ACCOUNT_ID;

  const apiToken =
    process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      'CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be configured'
    );
  }

  // ----------------------------------------------------------
  // Image size
  // ----------------------------------------------------------

  const configuredSize =
    parseInt(
      process.env.CLOUDFLARE_IMAGE_SIZE,
      10
    );

  const size = String(
    configuredSize || 1024
  );

  // ----------------------------------------------------------
  // Garment name
  // ----------------------------------------------------------

  const garment =
    GARMENT_NAMES[garmentType] ||
    String(
      garmentType || 'garment'
    ).toLowerCase();

  // ----------------------------------------------------------
  // Clean prompt
  // ----------------------------------------------------------

  const cleanCreativePrompt =
    String(
      creativePrompt || ''
    ).trim();

  // ----------------------------------------------------------
  // Build generation prompt
  // ----------------------------------------------------------

  const promptParts = [
    `Create a realistic clothing product image of a customized ${garment}.`,
    'Show the complete garment clearly, centered, and suitable for a clothing product presentation.',
    cleanCreativePrompt
      ? `Design instructions: ${cleanCreativePrompt}`
      : '',
    referenceImageBase64
      ? 'Use the provided reference image as visual guidance for the requested design.'
      : '',
    'Do not add logos or branding unless explicitly requested in the design instructions.',
  ];

  const prompt =
    promptParts
      .filter(Boolean)
      .join('\n');

  // ----------------------------------------------------------
  // Create multipart form
  // ----------------------------------------------------------

  const form =
    new FormData();

  form.append(
    'prompt',
    prompt
  );

  form.append(
    'width',
    size
  );

  form.append(
    'height',
    size
  );

  // ----------------------------------------------------------
  // Add reference image
  // ----------------------------------------------------------

  if (referenceImageBase64) {
    const small =
      await shrinkReference(
        referenceImageBase64
      );

    form.append(
      'input_image_0',
      new Blob(
        [small],
        {
          type:
            'image/png',
        }
      ),
      'reference.png'
    );
  }

  // ----------------------------------------------------------
  // Cloudflare endpoint
  // ----------------------------------------------------------

  const url =
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`;

  // ----------------------------------------------------------
  // Request
  // ----------------------------------------------------------

  let res;

  try {
    res = await fetch(
      url,
      {
        method: 'POST',

        headers: {
          Authorization:
            `Bearer ${apiToken}`,
        },

        body: form,
      }
    );
  } catch (error) {
    console.error(
      '[Cloudflare] Network error:',
      error
    );

    throw new Error(
      'Unable to connect to the image-generation service. Please try again.'
    );
  }

  // ----------------------------------------------------------
  // Handle HTTP errors
  // ----------------------------------------------------------

  if (!res.ok) {
    const detail =
      await res
        .text()
        .catch(
          () => ''
        );

    console.error(
      `[Cloudflare] Image request failed (${res.status}):`,
      detail.slice(0, 1000)
    );

    throw createCloudflareError(
      res.status,
      detail
    );
  }

  // ----------------------------------------------------------
  // Read response type
  // ----------------------------------------------------------

  const contentType =
    (
      res.headers.get(
        'content-type'
      ) || ''
    )
      .split(';')[0]
      .trim();

  let imageBuffer;

  // ==========================================================
  // JSON RESPONSE
  // ==========================================================

  if (
    contentType ===
    'application/json'
  ) {
    const json =
      await res.json();

    // --------------------------------------------------------
    // Cloudflare returned an application-level error
    // --------------------------------------------------------

    if (
      json.success === false
    ) {
      const detail =
        JSON.stringify(
          json
        );

      console.error(
        '[Cloudflare] AI response error:',
        detail.slice(0, 1000)
      );

      throw createCloudflareError(
        400,
        detail
      );
    }

    // --------------------------------------------------------
    // Generated image
    // --------------------------------------------------------

    const b64 =
      json.result?.image;

    if (!b64) {
      throw new Error(
        'Cloudflare did not return a generated image.'
      );
    }

    imageBuffer =
      Buffer.from(
        b64,
        'base64'
      );
  }

  // ==========================================================
  // RAW IMAGE RESPONSE
  // ==========================================================

  else {
    imageBuffer =
      Buffer.from(
        await res.arrayBuffer()
      );
  }

  // ----------------------------------------------------------
  // Validate image
  // ----------------------------------------------------------

  if (
    !imageBuffer ||
    !imageBuffer.length
  ) {
    throw new Error(
      'Cloudflare did not return a generated image.'
    );
  }

  // ----------------------------------------------------------
  // Return image
  // ----------------------------------------------------------

  return {
    imageBase64:
      imageBuffer.toString(
        'base64'
      ),

    mimeType:
      contentType.startsWith(
        'image/'
      )
        ? contentType
        : sniffMime(
          imageBuffer
        ),
  };
}