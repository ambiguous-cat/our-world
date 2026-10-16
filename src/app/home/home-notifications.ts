export type HomeNotification =
  | {
      type: "ticket_grant";
      id: number;
      title: string;
      description: string;
      createdAt: string;
    }
  | {
      type: "quiz_published";
      id: number;
      title: string;
      description: string;
      createdAt: string;
    };
