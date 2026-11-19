import { createContext } from 'react';

/** True inside a narrow side panel, where a tool card shows one line and keeps the rest in a menu. */
export const QuietCardsContext = createContext(false);

/** Sends a message to the agent in the surrounding Studio chat; null outside one or while it is busy. */
export const StudioAskContext = createContext<
    ((message: string) => void) | null
>(null);
