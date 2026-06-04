import { type AiPromptContextItem } from '@lightdash/common';

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

const getPromptContextItemKey = (item: AiPromptContextItem) =>
    item.type === 'chart'
        ? `chart:${item.chartUuid}`
        : `dashboard:${item.dashboardUuid}`;

const getPromptContextItemLabel = (item: AiPromptContextItem) => {
    if (item.displayName) return item.displayName;
    if (item.type === 'chart') return item.chartSlug ?? 'Chart';
    return item.dashboardSlug ?? 'Dashboard';
};

export const getPromptContextItemHref = (
    item: AiPromptContextItem,
    projectUuid: string,
) =>
    item.type === 'chart'
        ? `/projects/${projectUuid}/saved/${item.chartUuid}`
        : `/projects/${projectUuid}/dashboards/${item.dashboardUuid}`;

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
        const nextMatch = candidates
            .filter(({ key }) => !matchedKeys.has(key))
            .map((candidate) => ({
                ...candidate,
                start: message.indexOf(candidate.label, cursor),
            }))
            .filter(({ start }) => start >= 0)
            .sort((a, b) => {
                if (a.start !== b.start) return a.start - b.start;
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
