import { createContext, useContext } from 'react';

type BattleMessageContextValue = {
    winnerMessageUuids: ReadonlySet<string>;
    /** Display name of the fast-decision provider on this side, e.g. JEV or Luna. */
    decisionName: string;
};

export const BattleMessageContext =
    createContext<BattleMessageContextValue | null>(null);

export const useBattleMessage = (messageUuid: string) => {
    const context = useContext(BattleMessageContext);
    return {
        isBattle: context !== null,
        isWinner: context?.winnerMessageUuids.has(messageUuid) ?? false,
        decisionName: context?.decisionName ?? 'JEV',
    };
};
