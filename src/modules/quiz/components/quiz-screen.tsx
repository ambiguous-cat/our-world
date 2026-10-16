"use client";

import type { SessionRole } from "@/core/auth/contracts";
import type {
  AdminQuizWorkspace,
  PlayerQuizWorkspace,
} from "../contracts/quiz";
import { AdminQuizScreen } from "./admin-quiz-screen";
import { PlayerQuizScreen } from "./player-quiz-screen";

type Props =
  | { role: "admin"; initialData: AdminQuizWorkspace }
  | { role: "player"; initialData: PlayerQuizWorkspace };

export function QuizScreen(props: Props & { role: SessionRole }) {
  return props.role === "admin" ? (
    <AdminQuizScreen initialData={props.initialData} />
  ) : (
    <PlayerQuizScreen initialData={props.initialData} />
  );
}
