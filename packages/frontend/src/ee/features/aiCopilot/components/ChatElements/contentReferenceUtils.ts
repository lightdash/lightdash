import { assertUnreachable, type AiPromptContextItem } from '@lightdash/common';

export type ContentReferenceSegment =
    | {
          type: 'text';
          text: string;
      }
    | {
          type: 'reference';
          item: AiPromptContextItem;
          key: string;
          label: string;
      };

export const getPromptContextItemKey = (item: AiPromptContextItem) => {
    switch (item.type) {
        case 'chart':
            return `chart:${item.chartUuid}`;
        case 'dashboard':
            return `dashboard:${item.dashboardUuid}`;
        case 'thread':
            return `thread:${item.threadUuid}`;
        case 'file':
            return `file:${item.path}`;
        case 'repository':
            return `repository:${item.fullName}`;
        default:
            return assertUnreachable(item, 'Unknown AiPromptContextItem type');
    }
};

const getPromptContextItemLabel = (item: AiPromptContextItem) => {
    switch (item.type) {
        case 'chart':
            return item.displayName ?? item.chartSlug ?? 'Chart';
        case 'dashboard':
            return item.displayName ?? item.dashboardSlug ?? 'Dashboard';
        case 'thread':
            return item.displayName ?? 'Conversation';
        case 'file':
            return item.path;
        case 'repository':
            return item.fullName;
        default:
            return assertUnreachable(item, 'Unknown AiPromptContextItem type');
    }
};

export const getPromptContextItemHref = (
    item: AiPromptContextItem,
    projectUuid: string,
): string | null => {
    switch (item.type) {
        case 'chart':
            return `/projects/${projectUuid}/saved/${item.chartUuid}`;
        case 'dashboard':
            return `/projects/${projectUuid}/dashboards/${item.dashboardUuid}`;
        // A pinned thread can live in another project, so there is no
        // reliable in-project URL to offer.
        case 'thread':
            return null;
        // File / repository references point at source the agent reads, not at
        // an in-app route, so there is no link to offer.
        case 'file':
        case 'repository':
            return null;
        default:
            return assertUnreachable(item, 'Unknown AiPromptContextItem type');
    }
};

export const buildContentReferenceSegments = (
    message: string,
    context: AiPromptContextItem[],
): { matchedKeys: Set<string>; segments: ContentReferenceSegment[] } => {
    const candidates = context
        .map((item, index) => ({
            item,
            index,
            key: getPromptContextItemKey(item),
            label: getPromptContextItemLabel(item),
        }))
        .filter(({ label }) => label.length > 0);

    const matchedKeys = new Set<string>();
    const segments: ContentReferenceSegment[] = [];
    let cursor = 0;

    while (cursor < message.length) {
        // Match every occurrence of a reference, not just the first — the same
        // file/repo/chart can be tagged multiple times in one message. We still
        // record each key in matchedKeys (a Set) so the caller knows which
        // pinned items were referenced inline.
        const nextMatch = candidates
            .map((candidate) => ({
                ...candidate,
                start: message.indexOf(candidate.label, cursor),
            }))
            .filter(({ start }) => start >= 0)
            .sort((a, b) => {
                if (a.start !== b.start) return a.start - b.start;
                // When two references share a label and position (e.g. a file
                // and a repository both named "owner/name"), prefer the one not
                // yet matched so each distinct reference claims an occurrence,
                // rather than the first reference claiming them all.
                const aMatched = matchedKeys.has(a.key) ? 1 : 0;
                const bMatched = matchedKeys.has(b.key) ? 1 : 0;
                if (aMatched !== bMatched) return aMatched - bMatched;
                if (a.label.length !== b.label.length) {
                    return b.label.length - a.label.length;
                }
                return a.index - b.index;
            })[0];

        if (!nextMatch) {
            segments.push({ type: 'text', text: message.slice(cursor) });
            break;
        }

        if (nextMatch.start > cursor) {
            segments.push({
                type: 'text',
                text: message.slice(cursor, nextMatch.start),
            });
        }

        matchedKeys.add(nextMatch.key);
        segments.push({
            type: 'reference',
            item: nextMatch.item,
            key: nextMatch.key,
            label: nextMatch.label,
        });
        cursor = nextMatch.start + nextMatch.label.length;
    }

    return { matchedKeys, segments };
};
