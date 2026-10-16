import "server-only";

import { eq } from "drizzle-orm";
import { getPlayerName } from "@/core/auth/player-name";

import { db, schema } from "@/db";
import {
  defaultHomeNote,
  type HomeNote,
} from "@/core/site-settings/contracts";

export function getDefaultHomeNote(): HomeNote {
  return { ...defaultHomeNote, signature: `最爱${getPlayerName()}的管理员` };
}

export function getHomeNote(): HomeNote {
  const settings = db
    .select({
      content: schema.siteSettings.homeNote,
      signature: schema.siteSettings.homeNoteSignature,
    })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.id, 1))
    .get();

  if (!settings) return getDefaultHomeNote();
  // 兼容数据库历史默认落款；用户自定义内容保持原样。
  return settings.signature === defaultHomeNote.signature
    ? { ...settings, signature: getDefaultHomeNote().signature }
    : settings;
}

export function saveHomeNote(note: HomeNote) {
  db.insert(schema.siteSettings)
    .values({
      id: 1,
      homeNote: note.content,
      homeNoteSignature: note.signature,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.siteSettings.id,
      set: {
        homeNote: note.content,
        homeNoteSignature: note.signature,
        updatedAt: new Date(),
      },
    })
    .run();
}
