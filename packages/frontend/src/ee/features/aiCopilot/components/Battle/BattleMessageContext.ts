import { createContext, useContext } from 'react';

type BattleMessageContextValue = {
    winnerMessageUuids: ReadonlySet<string>;
};

export const BattleMessageContext =
    createContext<BattleMessageContextValue | null>(null);

export const useBattleMessage = (messageUuid: string) => {
    const context = useContext(BattleMessageContext);
    return {
        isBattle: context !== null,
        isWinner: context?.winnerMessageUuids.has(messageUuid) ?? false,
    };
};
