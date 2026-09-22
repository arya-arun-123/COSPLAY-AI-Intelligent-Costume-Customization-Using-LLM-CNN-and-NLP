import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import sharp from "sharp";

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

const MIME_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export async function saveGeneratedImage(imageBase64, mimeType = 'image/png') {
  if (!imageBase64) {
    throw new Error('Generated image data is missing.');
  }

  const extension = MIME_EXTENSIONS[mimeType] || 'png';
  const directory = path.join(UPLOADS_DIR, 'generated-designs');

  await fs.mkdir(directory, { recursive: true });

  const filename = `design-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;
  const filePath = path.join(directory, filename);

  await fs.writeFile(filePath, Buffer.from(imageBase64, 'base64'));

  return `/uploads/generated-designs/${filename}`;
}


export async function saveDesignArtwork(imageBase64, mimeType = "image/png") {
  if (!imageBase64) {
    throw new Error("Design artwork data is missing.");
  }

  const directory = path.join(UPLOADS_DIR, "design-artwork");
  await fs.mkdir(directory, { recursive: true });

  const inputBuffer = Buffer.from(imageBase64, "base64");

  const resized = await sharp(inputBuffer)
    .resize(768, 768, { fit: "cover", position: "center" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = resized;
  const samples = [];
  const samplePoints = [[8, 8], [info.width - 9, 8], [8, info.height - 9], [info.width - 9, info.height - 9]];

  for (const [x, y] of samplePoints) {
    const index = (y * info.width + x) * 4;
    samples.push([data[index], data[index + 1], data[index + 2]]);
  }

  const background = samples.reduce((sum, rgb) => [sum[0] + rgb[0], sum[1] + rgb[1], sum[2] + rgb[2]], [0, 0, 0]).map((value) => value / samples.length);

  for (let i = 0; i < data.length; i += 4) {
    const distance = Math.sqrt(
      Math.pow(data[i] - background[0], 2) +
      Math.pow(data[i + 1] - background[1], 2) +
      Math.pow(data[i + 2] - background[2], 2)
    );

    if (distance < 38) {
      data[i + 3] = 0;
    } else if (distance < 70) {
      data[i + 3] = Math.round(((distance - 38) / 32) * 255);
    }
  }

  const artworkBuffer = await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  }).png().toBuffer();

  const filename = "artwork-" + Date.now() + "-" + crypto.randomBytes(6).toString("hex") + ".png";
  const filePath = path.join(directory, filename);

  await fs.writeFile(filePath, artworkBuffer);

  return "/uploads/design-artwork/" + filename;
}

