import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { AdminServiceError } from "./admin-error";

const MAX_PRIZE_IMAGE_BYTES = 5 * 1024 * 1024;
const PRIZE_IMAGE_ROUTE_PREFIX = "/api/prize-images";
const PRIZE_IMAGE_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;

type SupportedPrizeImage = {
  extension: "jpg" | "png" | "webp";
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

function prizeImageDirectory() {
  const configured = process.env.PRIZE_UPLOAD_DIR?.trim();
  return (
    configured ||
    path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "data",
      "uploads",
      "prizes",
    )
  );
}

function detectedImageType(buffer: Buffer): SupportedPrizeImage | null {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return { extension: "png", contentType: "image/png" };
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }

  return null;
}

export async function savePrizeImage(file: File) {
  if (file.size <= 0) {
    throw new AdminServiceError("EMPTY_IMAGE", "请选择一张有内容的图片");
  }
  if (file.size > MAX_PRIZE_IMAGE_BYTES) {
    throw new AdminServiceError("IMAGE_TOO_LARGE", "图片大小不能超过 5 MB", 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const imageType = detectedImageType(buffer);
  if (!imageType) {
    throw new AdminServiceError(
      "UNSUPPORTED_IMAGE",
      "仅支持 PNG、JPG/JPEG 或 WebP 图片",
    );
  }
  if (file.type && file.type !== imageType.contentType) {
    throw new AdminServiceError(
      "INVALID_IMAGE_TYPE",
      "图片内容与文件类型不一致，请重新选择",
    );
  }

  const filename = `${randomUUID()}.${imageType.extension}`;
  const directory = prizeImageDirectory();
  await mkdir(/* turbopackIgnore: true */ directory, { recursive: true });
  await writeFile(
    /* turbopackIgnore: true */ path.join(directory, filename),
    buffer,
    { flag: "wx" },
  );

  return {
    imagePath: `${PRIZE_IMAGE_ROUTE_PREFIX}/${filename}`,
  };
}

export async function loadPrizeImage(filename: string) {
  if (!PRIZE_IMAGE_NAME_PATTERN.test(filename)) return null;

  const extension = path.extname(filename).slice(1);
  const contentType =
    extension === "png"
      ? "image/png"
      : extension === "webp"
        ? "image/webp"
        : "image/jpeg";

  try {
    return {
      body: await readFile(
        /* turbopackIgnore: true */ path.join(prizeImageDirectory(), filename),
      ),
      contentType,
    };
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? error.code
        : null;
    if (code === "ENOENT") return null;
    throw error;
  }
}
