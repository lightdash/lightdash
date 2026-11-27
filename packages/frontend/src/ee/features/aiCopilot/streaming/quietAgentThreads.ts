// Threads shown in a bubble on the page: what their agent saves is refreshed
// in place, and the page is never scrolled to it.
const quietThreadUuids = new Set<string>();

export const keepAgentThreadQuiet = (threadUuid: string) => {
    quietThreadUuids.add(threadUuid);
};

export const isAgentThreadQuiet = (threadUuid: string): boolean =>
    quietThreadUuids.has(threadUuid);
