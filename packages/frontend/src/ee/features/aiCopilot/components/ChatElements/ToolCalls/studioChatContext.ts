import { createContext } from 'react';

/** True inside the Studio chat: a narrow side panel where a tool card shows one line and keeps the rest in a menu, and a turn's card stands in for its reply. */
export const InStudioChatContext = createContext(false);

/** Sends a message to the agent in the surrounding Studio chat; null outside one or while it is busy. */
export const StudioAskContext = createContext<
    ((message: string) => void) | null
>(null);
