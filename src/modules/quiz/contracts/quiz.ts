export type QuizStatus = "draft" | "published" | "closed" | "archived";
export type QuizQuestionType = "single" | "text";

export type QuizOptionDraft = {
  content: string;
  isCorrect: boolean;
};

export type QuizQuestionDraft = {
  type: QuizQuestionType;
  prompt: string;
  options: QuizOptionDraft[];
  referenceAnswer: string;
  explanation: string;
  message: string;
};

export type QuizDraftInput = {
  title: string;
  description: string;
  rewardTicketTypeId: number | null;
  rewardQuantity: number;
  rewardNote: string;
  questions: QuizQuestionDraft[];
};

export type QuizEditorQuestion = QuizQuestionDraft & { id: number };

export type QuizAttemptAnswer = {
  questionId: number;
  questionType: QuizQuestionType;
  prompt: string;
  selectedOptionId: number | null;
  selectedOptionText: string | null;
  textAnswer: string | null;
  isCorrect: boolean | null;
  options: Array<{ id: number; content: string; isCorrect: boolean }>;
  referenceAnswer: string | null;
  explanation: string | null;
  message: string | null;
};

export type QuizAttemptView = {
  id: number;
  quizId: number;
  attemptNumber: number;
  singleCorrectCount: number;
  singleQuestionCount: number;
  reward: null | { ticketName: string; quantity: number; note: string };
  submittedAt: string;
  answers: QuizAttemptAnswer[];
};

export type AdminQuizView = {
  id: number;
  title: string;
  description: string;
  status: QuizStatus;
  rewardTicketTypeId: number | null;
  rewardQuantity: number;
  rewardNote: string;
  publishedAt: string | null;
  updatedAt: string;
  questions: QuizEditorQuestion[];
  attempts: QuizAttemptView[];
};

export type RewardTicketChoice = {
  id: number;
  name: string;
  isGrantEnabled: boolean;
};

export type AdminQuizWorkspace = {
  quizzes: AdminQuizView[];
  rewardTickets: RewardTicketChoice[];
};

export type PlayerQuizQuestion = {
  id: number;
  type: QuizQuestionType;
  prompt: string;
  options: Array<{ id: number; content: string }>;
};

export type PlayerQuizView = {
  id: number;
  title: string;
  description: string;
  status: "published" | "closed";
  reward: { ticketName: string; quantity: number } | null;
  rewardAvailable: boolean;
  questions: PlayerQuizQuestion[];
  attempts: QuizAttemptView[];
};

export type PlayerQuizWorkspace = { quizzes: PlayerQuizView[] };

export type PlayerQuizPublishNotice = {
  quizId: number;
  title: string;
  description: string;
  createdAt: string;
};

export type PlayerQuizPublishNoticesResponse = {
  notices: PlayerQuizPublishNotice[];
};
