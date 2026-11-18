import { type ApiSuccess } from '../../types/api/success';
import {
    type AiAgentReviewClassifierConfidence,
    type AiAgentRootCause,
    type AiAgentTurnSignal,
} from './aiAgentReviewClassifierTypes';
import { type AiThreadCreatedFrom } from './requestTypes';

/**
 * `mine`: the caller's own threads in one project, following the project
 * thread list. `all`: every thread in the projects the caller administers,
 * following the AI admin thread list.
 */
export type AiAgentThreadHistoryScope = 'mine' | 'all';

export type AiAgentThreadHistoryFilters = {
    /** Required in the `mine` scope. Narrows the `all` scope to one project. */
    projectUuid?: string;
    agentUuid?: string;
    /** `all` scope only. */
    userUuid?: string;
    createdFrom?: AiThreadCreatedFrom;
    /** ISO date, inclusive, on the thread's creation time. */
    dateFrom?: string;
    /** ISO date, inclusive, on the thread's creation time. */
    dateTo?: string;
    /** True: only threads with a failed turn. False: only threads with none. */
    hasError?: boolean;
    /** Only threads with a turn rated -1 (thumbs down), 0 or 1 (thumbs up). */
    humanScore?: number;
    /** `all` scope, organization AI admins only. */
    signal?: AiAgentTurnSignal;
    /** `all` scope, organization AI admins only. */
    rootCause?: AiAgentRootCause;
};

export type AiAgentThreadHistoryTurnClassification = {
    promptUuid: string;
    signal: AiAgentTurnSignal;
    /** Null when the review classifier assigned none, or it is not surfaced. */
    rootCause: AiAgentRootCause | null;
    confidence: AiAgentReviewClassifierConfidence;
};

/**
 * `not_classified` means the review classifier has no result for the thread or
 * turn. It does not mean the thread or turn went well.
 */
export type AiAgentThreadHistoryClassification =
    | { status: 'not_classified' }
    | {
          status: 'classified';
          turns: AiAgentThreadHistoryTurnClassification[];
      };

export type AiAgentThreadHistorySummary = {
    threadUuid: string;
    projectUuid: string;
    agentUuid: string;
    agentName: string;
    title: string | null;
    createdAt: string;
    createdFrom: AiThreadCreatedFrom;
    user: { uuid: string; name: string } | null;
    /** Start of the first prompt, cut to a preview length. */
    firstPrompt: string | null;
    turnCount: number;
    errorCount: number;
    upvoteCount: number;
    downvoteCount: number;
    /** Null when the caller cannot read review classifier results. */
    classification: AiAgentThreadHistoryClassification | null;
};

export type AiAgentThreadHistoryList = {
    threads: AiAgentThreadHistorySummary[];
    /** Pass as `cursor` to read the next page. Null on the last page. */
    nextCursor: string | null;
};

export type AiAgentThreadHistorySearchMatch = {
    /** Null when the thread title matched rather than a turn. */
    promptUuid: string | null;
    createdAt: string | null;
    matchedIn: ('title' | 'prompt' | 'response' | 'feedback' | 'error')[];
    /** Matching text with the matched words wrapped in `**`. */
    snippet: string;
};

export type AiAgentThreadHistorySearchResult = AiAgentThreadHistorySummary & {
    rank: number;
    matchedTurnCount: number;
    /** Best matching turns first. */
    matches: AiAgentThreadHistorySearchMatch[];
};

export type AiAgentThreadHistorySearchResults = {
    threads: AiAgentThreadHistorySearchResult[];
    nextCursor: string | null;
};

export type AiAgentThreadHistoryToolCall = {
    toolCallId: string;
    name: string;
    args: string;
    /** Sanitized: query rows and field values are removed. */
    result: string | null;
    resultOmitted: string | null;
    isError: boolean;
};

export type AiAgentThreadHistoryTurn = {
    index: number;
    promptUuid: string;
    createdAt: string;
    prompt: string;
    response: string | null;
    errorMessage: string | null;
    humanScore: number | null;
    humanFeedback: string | null;
    /** True when the prompt, response or a tool call was cut to fit. */
    truncated: boolean;
    /** Null when the caller cannot read review classifier results. */
    classification: AiAgentThreadHistoryClassification | null;
    /** Present only when tool calls were requested. */
    toolCalls?: AiAgentThreadHistoryToolCall[];
};

export type AiAgentThreadHistoryTranscript = {
    thread: AiAgentThreadHistorySummary;
    turns: AiAgentThreadHistoryTurn[];
    /** Pass as `turnOffset` to read the next turns. Null after the last turn. */
    nextTurnOffset: number | null;
};

export type ApiAiAgentThreadHistoryListResponse =
    ApiSuccess<AiAgentThreadHistoryList>;
export type ApiAiAgentThreadHistorySearchResponse =
    ApiSuccess<AiAgentThreadHistorySearchResults>;
export type ApiAiAgentThreadHistoryTranscriptResponse =
    ApiSuccess<AiAgentThreadHistoryTranscript>;
