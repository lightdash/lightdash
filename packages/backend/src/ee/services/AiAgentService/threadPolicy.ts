import {
    isSemanticStudioThread,
    type AiThreadCreatedFrom,
} from '@lightdash/common';
import { type TurnCard } from '../ai/types/aiAgent';
import { studioTurnCard } from '../SemanticStudioService/studioTurnCard';

/** What a kind of thread does differently on every turn, whichever project it is on. */
export type ThreadPolicy = {
    /** Runs SQL without asking, whichever request started the turn. */
    autoApproveSql: boolean;
    /** Whether fast decisions route the turn; they are for analytics turns. */
    usesFastDecisions: boolean;
    /** Whether the turn waits on the agent's attached MCP servers. */
    waitsOnMcpServers: boolean;
    /** Offers questions as choices without the ask-user flag. */
    asksWithoutFlag: boolean;
    turnCard: TurnCard | null;
};

const DEFAULT_THREAD_POLICY: ThreadPolicy = {
    autoApproveSql: false,
    usesFastDecisions: true,
    waitsOnMcpServers: true,
    asksWithoutFlag: false,
    turnCard: null,
};

// A Studio thread only edits models, takes no MCP tools, and offers each change as a choice on a card.
const STUDIO_THREAD_POLICY: ThreadPolicy = {
    autoApproveSql: true,
    usesFastDecisions: false,
    waitsOnMcpServers: false,
    asksWithoutFlag: true,
    turnCard: studioTurnCard,
};

export const getThreadPolicy = (
    threadCreatedFrom: AiThreadCreatedFrom,
): ThreadPolicy =>
    isSemanticStudioThread(threadCreatedFrom)
        ? STUDIO_THREAD_POLICY
        : DEFAULT_THREAD_POLICY;
