import {
    assertUnreachable,
    dataAppContextKey,
    dataAppElementContextKey,
    dataAppRestoreContextKey,
    type AiPromptContextInput,
    type AiPromptContextItem,
} from '@lightdash/common';
import { dataAppHref } from '../../../../../features/apps/utils/appUrls';

// Element references never render inline; they always show as pills.
// Restore items live on hidden turns and are rendered as build cards.
type InlineReferenceItem = Exclude<
    AiPromptContextItem,
    { type: 'data_app_element' | 'data_app_restore' }
>;

const isInlineReferenceItem = (
    item: AiPromptContextItem,
): item is InlineReferenceItem =>
    item.type !== 'data_app_element' && item.type !== 'data_app_restore';

export type ContentReferenceSegment =
    | {
          type: 'text';
          text: string;
      }
    | {
          type: 'reference';
          item: InlineReferenceItem;
          key: string;
          label: string;
      };

export const getPromptContextItemKey = (
    item: AiPromptContextItem | AiPromptContextInput[number],
) => {
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
        case 'external_source':
            return `external_source:${item.sourceUuid}`;
        case 'pull_request':
            return `pull_request:${item.prUrl}`;
        case 'proposed_change':
            return `proposed_change:${item.fingerprint}`;
        case 'review_finding':
            return `review_finding:${item.fingerprint}`;
        case 'preview_environment':
            return `preview_environment:${item.previewProjectUuid}`;
        case 'data_app_element':
            return dataAppElementContextKey(item);
        case 'data_app_restore':
            return dataAppRestoreContextKey(item);
        case 'data_app':
            return dataAppContextKey(item.appUuid);
        default:
            return assertUnreachable(item, 'Unknown AiPromptContextItem type');
    }
};

export const getDataAppContextItemName = (
    item: Pick<
        Extract<AiPromptContextItem, { type: 'data_app' }>,
        'displayName' | 'appSlug'
    >,
): string => item.displayName ?? item.appSlug ?? 'Data app';

export const getDataAppContextItemLabel = (
    item: Extract<AiPromptContextItem, { type: 'data_app' }>,
): string => {
    const name = getDataAppContextItemName(item);
    return item.pinnedVersion === null
        ? name
        : `${name} v${item.pinnedVersion}`;
};

const getProposedChangeLabel = (
    item: Extract<AiPromptContextItem, { type: 'proposed_change' }>,
): string =>
    item.payload.changeKind === 'project_context'
        ? item.payload.entry.content
        : item.payload.recommendation.title;

const getPromptContextItemLabel = (item: InlineReferenceItem) => {
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
        case 'external_source':
            return item.displayName;
        case 'pull_request':
            return item.title ?? `PR #${item.prNumber ?? ''}`.trim();
        case 'proposed_change':
            return getProposedChangeLabel(item);
        case 'review_finding':
            return item.title;
        case 'preview_environment':
            return item.projectName ?? 'Preview environment';
        case 'data_app':
            return getDataAppContextItemName(item);
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
        case 'external_source':
            return null;
        case 'pull_request':
            return item.prUrl;
        case 'preview_environment':
            return item.previewThreadUuid
                ? `/projects/${item.previewProjectUuid}/ai-agents/threads/${item.previewThreadUuid}`
                : `/projects/${item.previewProjectUuid}/home`;
        // Finding / proposed-change render as rich cards, not navigable chips.
        case 'review_finding':
        case 'proposed_change':
            return null;
        // An element reference points inside a running app, not at a route;
        // a restore is surfaced by its build card instead.
        case 'data_app_element':
        case 'data_app_restore':
            return null;
        case 'data_app':
            return dataAppHref(projectUuid, item.appUuid);
        default:
            return assertUnreachable(item, 'Unknown AiPromptContextItem type');
    }
};

// A label matches only when it sits on token boundaries — the characters on
// either side must not be word characters. This stops a path/slug label from
// matching inside a larger word (e.g. `orders` inside `reorders`). It does NOT
// try to tell a real inline mention from a coincidental standalone word equal to
// the label: the stored message is plain text with no mention offsets, so that
// residual ambiguity is unavoidable here, mitigated by labels being path-like.
const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

const isTokenBoundary = (character: string | undefined): boolean =>
    character === undefined || !WORD_CHARACTER.test(character);

const indexOfBoundedLabel = (
    message: string,
    label: string,
    fromIndex: number,
): number => {
    let from = fromIndex;
    while (from <= message.length) {
        const start = message.indexOf(label, from);
        if (start < 0) return -1;
        const before = start > 0 ? message[start - 1] : undefined;
        const after = message[start + label.length];
        if (isTokenBoundary(before) && isTokenBoundary(after)) {
            return start;
        }
        from = start + 1;
    }
    return -1;
};

export const buildContentReferenceSegments = (
    message: string,
    context: AiPromptContextItem[],
): { matchedKeys: Set<string>; segments: ContentReferenceSegment[] } => {
    const candidates = context
        .flatMap((item, index) =>
            isInlineReferenceItem(item)
                ? [
                      {
                          item,
                          index,
                          key: getPromptContextItemKey(item),
                          label: getPromptContextItemLabel(item),
                      },
                  ]
                : [],
        )
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
                start: indexOfBoundedLabel(message, candidate.label, cursor),
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
