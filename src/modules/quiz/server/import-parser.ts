import type { QuizDraftInput, QuizQuestionDraft } from "../contracts/quiz";
import { QuizServiceError } from "./error";

const MAX_QUESTIONS = 100;
const MAX_OPTIONS = 10;

function fail(line: number, message: string): never {
  throw new QuizServiceError("INVALID_QUIZ_FILE", `第 ${line} 行：${message}`);
}

export function parseQuizDocument(source: string): QuizDraftInput {
  const lines = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  let title = "";
  const description: string[] = [];
  const questions: QuizQuestionDraft[] = [];
  let current: QuizQuestionDraft | null = null;
  let block: "reference" | "explanation" | "message" | null = null;
  let blockLines: string[] = [];

  const flushBlock = () => {
    if (!current || !block) return;
    const content = blockLines.join("\n").trim();
    if (block === "reference") current.referenceAnswer = content;
    else if (block === "explanation") current.explanation = content;
    else current.message = content;
    block = null;
    blockLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    const lineNumber = index + 1;
    const questionMatch = trimmed.match(/^##\s+\[(single|text)\]\s+(.+)$/i);

    if (questionMatch) {
      flushBlock();
      if (questions.length >= MAX_QUESTIONS) fail(lineNumber, `题目不能超过 ${MAX_QUESTIONS} 道`);
      current = {
        type: questionMatch[1].toLowerCase() as "single" | "text",
        prompt: questionMatch[2].trim(),
        options: [],
        referenceAnswer: "",
        explanation: "",
        message: "",
      };
      questions.push(current);
      continue;
    }

    if (/^#\s+/.test(trimmed) && !/^##/.test(trimmed)) {
      if (current) fail(lineNumber, "题版标题必须写在所有题目之前");
      if (title) fail(lineNumber, "只能设置一个题版标题");
      title = trimmed.replace(/^#\s+/, "").trim();
      continue;
    }

    if (!current) {
      if (trimmed.startsWith(">")) description.push(trimmed.replace(/^>\s?/, ""));
      else if (trimmed) fail(lineNumber, "题目前只允许填写标题和以 > 开头的说明");
      continue;
    }

    if (/^###\s+参考答案(?:（选填）|\(选填\))?\s*$/.test(trimmed)) {
      flushBlock();
      if (current.type !== "text") fail(lineNumber, "只有文字题可以填写参考答案");
      block = "reference";
      continue;
    }
    if (/^###\s+解析(?:（选填）|\(选填\))?\s*$/.test(trimmed)) {
      flushBlock();
      block = "explanation";
      continue;
    }
    if (/^###\s+留言(?:内容)?(?:（选填）|\(选填\))?\s*$/.test(trimmed)) {
      flushBlock();
      block = "message";
      continue;
    }

    const optionMatch = trimmed.match(/^-\s+\[([ xX])\]\s+(.+)$/);
    if (optionMatch) {
      flushBlock();
      if (current.type !== "single") fail(lineNumber, "文字题不能包含选项");
      if (current.options.length >= MAX_OPTIONS) fail(lineNumber, `每道题不能超过 ${MAX_OPTIONS} 个选项`);
      current.options.push({
        content: optionMatch[2].trim(),
        isCorrect: optionMatch[1].toLowerCase() === "x",
      });
      continue;
    }

    if (block) blockLines.push(raw);
    else if (trimmed) fail(lineNumber, "无法识别这一行，请检查导入格式");
  }
  flushBlock();

  if (!title) throw new QuizServiceError("INVALID_QUIZ_FILE", "缺少以 # 开头的题版标题");
  if (!questions.length) throw new QuizServiceError("INVALID_QUIZ_FILE", "文件中没有题目");
  for (const [index, question] of questions.entries()) {
    if (question.type === "single") {
      if (question.options.length < 2) {
        throw new QuizServiceError("INVALID_QUIZ_FILE", `第 ${index + 1} 题至少需要两个选项`);
      }
      if (question.options.filter((option) => option.isCorrect).length !== 1) {
        throw new QuizServiceError("INVALID_QUIZ_FILE", `第 ${index + 1} 题必须且只能有一个 [x] 正确选项`);
      }
    }
  }

  return {
    title,
    description: description.join("\n").trim(),
    rewardTicketTypeId: null,
    rewardQuantity: 0,
    rewardNote: "",
    questions,
  };
}
