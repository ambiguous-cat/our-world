import { handleQuizRequest } from "@/modules/quiz/server/http";
import { QuizServiceError } from "@/modules/quiz/server/error";
import { parseQuizDocument } from "@/modules/quiz/server/import-parser";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 1024 * 1024;

export async function POST(request: Request) {
  return handleQuizRequest("admin", async () => {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_FILE_SIZE + 64 * 1024) {
      throw new QuizServiceError("FILE_TOO_LARGE", "导入文件不能超过 1 MB", 413);
    }
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new QuizServiceError("INVALID_FILE", "无法读取上传文件");
    }
    const file = formData.get("file");
    if (!(file instanceof File)) throw new QuizServiceError("FILE_REQUIRED", "请选择导入文件");
    if (file.size < 1 || file.size > MAX_FILE_SIZE) {
      throw new QuizServiceError("FILE_TOO_LARGE", "导入文件必须在 1 B 到 1 MB 之间", 413);
    }
    if (!/\.(md|txt)$/i.test(file.name)) {
      throw new QuizServiceError("INVALID_FILE_TYPE", "只支持 .md 或 .txt 文件");
    }
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    } catch {
      throw new QuizServiceError("INVALID_ENCODING", "文件必须使用 UTF-8 编码");
    }
    return { draft: parseQuizDocument(content) };
  });
}
