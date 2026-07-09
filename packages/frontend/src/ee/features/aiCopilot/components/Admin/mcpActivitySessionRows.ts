import { type McpActivityItem } from '@lightdash/common';

export type McpSessionHeaderRow = {
    type: 'session';
    groupKey: string;
    sessionId: string | null;
    clientName: string | null;
    clientVersion: string | null;
    callCount: number;
    errorCount: number;
    latestCallAt: string;
};

export type McpCallRow = {
    type: 'call';
    groupKey: string;
    call: McpActivityItem;
};

export type McpActivityRow = McpSessionHeaderRow | McpCallRow;

type SessionGroup = {
    key: string;
    calls: McpActivityItem[];
};

// The server emits session-grouped queries with segments already
// contiguous, so grouping consecutive keys reconstructs them exactly;
// rows without a server group (e.g. from older cached pages) fall back
// to standalone one-call groups
const getGroupKey = (call: McpActivityItem): string =>
    call.sessionGroup?.key ?? `call:${call.uuid}`;

const groupConsecutiveByKey = (calls: McpActivityItem[]): SessionGroup[] =>
    calls.reduce<SessionGroup[]>((groups, call) => {
        const key = getGroupKey(call);
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.key === key) {
            lastGroup.calls.push(call);
            return groups;
        }
        return [...groups, { key, calls: [call] }];
    }, []);

export const buildSessionRows = (
    calls: McpActivityItem[],
    collapsedGroups: ReadonlySet<string>,
): McpActivityRow[] =>
    groupConsecutiveByKey(calls).flatMap<McpActivityRow>((group) => {
        const [firstCall] = group.calls;
        const { sessionGroup, sessionId } = firstCall;
        const callCount = sessionGroup?.callCount ?? group.calls.length;
        // A lone sessionless call reads better as a plain chronological row
        // than as a one-call "No session ID" group
        const isHeaderless =
            !sessionGroup || (sessionId === null && callCount === 1);
        if (isHeaderless) {
            return group.calls.map<McpCallRow>((call) => ({
                type: 'call',
                groupKey: group.key,
                call,
            }));
        }
        const latestCall = group.calls.reduce((latest, call) =>
            call.createdAt > latest.createdAt ? call : latest,
        );
        const header: McpSessionHeaderRow = {
            type: 'session',
            groupKey: group.key,
            sessionId,
            clientName: latestCall.clientName,
            clientVersion: latestCall.clientVersion,
            callCount,
            errorCount:
                sessionGroup?.errorCount ??
                group.calls.filter((call) => call.status === 'error').length,
            latestCallAt: latestCall.createdAt,
        };
        if (collapsedGroups.has(group.key)) {
            return [header];
        }
        return [
            header,
            ...group.calls.map<McpCallRow>((call) => ({
                type: 'call',
                groupKey: group.key,
                call,
            })),
        ];
    });

export const buildFlatRows = (calls: McpActivityItem[]): McpActivityRow[] =>
    calls.map((call) => ({ type: 'call', groupKey: call.uuid, call }));
