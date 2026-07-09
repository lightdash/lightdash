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
    sessionId: string | null;
    calls: McpActivityItem[];
};

// Contiguous runs only: a session whose calls interleave in time with
// another session's shows as separate blocks. Exact grouping needs
// server-side session pagination.
const groupContiguousBySession = (calls: McpActivityItem[]): SessionGroup[] =>
    calls.reduce<SessionGroup[]>((groups, call) => {
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.sessionId === call.sessionId) {
            lastGroup.calls.push(call);
            return groups;
        }
        return [...groups, { sessionId: call.sessionId, calls: [call] }];
    }, []);

// Keyed by the first call's uuid so keys stay stable while infinite scroll
// appends older pages (a run only ever grows at its tail).
const getGroupKey = (group: SessionGroup): string =>
    `${group.sessionId ?? 'no-session'}:${group.calls[0].uuid}`;

export const buildSessionRows = (
    calls: McpActivityItem[],
    collapsedGroups: ReadonlySet<string>,
): McpActivityRow[] =>
    groupContiguousBySession(calls).flatMap<McpActivityRow>((group) => {
        const groupKey = getGroupKey(group);
        const latestCall = group.calls.reduce((latest, call) =>
            call.createdAt > latest.createdAt ? call : latest,
        );
        const header: McpSessionHeaderRow = {
            type: 'session',
            groupKey,
            sessionId: group.sessionId,
            clientName: latestCall.clientName,
            clientVersion: latestCall.clientVersion,
            callCount: group.calls.length,
            errorCount: group.calls.filter((call) => call.status === 'error')
                .length,
            latestCallAt: latestCall.createdAt,
        };
        if (collapsedGroups.has(groupKey)) {
            return [header];
        }
        return [
            header,
            ...group.calls.map<McpCallRow>((call) => ({
                type: 'call',
                groupKey,
                call,
            })),
        ];
    });

export const buildFlatRows = (calls: McpActivityItem[]): McpActivityRow[] =>
    calls.map((call) => ({ type: 'call', groupKey: call.uuid, call }));
