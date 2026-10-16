import { getSessionRole } from "@/core/auth/session";
import { loadPrizeImage } from "@/modules/scratch/server/prize-image-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ filename: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  if (!(await getSessionRole())) {
    return new Response(null, { status: 401 });
  }

  const { filename } = await context.params;
  const image = await loadPrizeImage(filename);
  if (!image) return new Response(null, { status: 404 });

  return new Response(image.body, {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.body.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
