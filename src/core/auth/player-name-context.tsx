"use client";

import { createContext, useContext } from "react";

const PlayerNameContext = createContext("玩家");

export function PlayerNameProvider({ name, children }: {
  name: string;
  children: React.ReactNode;
}) {
  return <PlayerNameContext.Provider value={name}>{children}</PlayerNameContext.Provider>;
}

export function usePlayerName() {
  return useContext(PlayerNameContext);
}
