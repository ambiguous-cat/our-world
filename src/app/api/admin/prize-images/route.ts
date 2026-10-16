import {
  handleAdminRequest,
  readFormDataBody,
} from "@/modules/scratch/server/admin-http";
import { AdminServiceError } from "@/modules/scratch/server/admin-error";
import { savePrizeImage } from "@/modules/scratch/server/prize-image-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleAdminRequest(async () => {
    const formData = await readFormDataBody(request);
    const image = formData.get("image");
    if (!(image instanceof File)) {
      throw new AdminServiceError("IMAGE_REQUIRED", "请选择要上传的图片");
    }
    return savePrizeImage(image);
  });
}
