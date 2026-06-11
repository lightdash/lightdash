import {
    ChartSourceType,
    ContentType,
    type AiPromptContextInput,
    type AiPromptContextItem,
    type ApiContentResponse,
    type ApiProjectFilesResponse,
    type ChartKind,
    type SummaryContent,
} from '@lightdash/common';
import { Group, Text } from '@mantine-8/core';
import {
    IconCircleCheck,
    IconFile,
    IconLayoutDashboard,
} from '@tabler/icons-react';
import Mention, { type MentionOptions } from '@tiptap/extension-mention';
import { type DOMOutputSpec } from '@tiptap/pm/model';
import { PluginKey } from '@tiptap/pm/state';
import {
    ReactNodeViewRenderer,
    ReactRenderer,
    type Editor,
} from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { lightdashApi } from '../../../../../api';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../../../components/common/PolymorphicGroupButton';
import { getChartIcon } from '../../../../../components/common/ResourceIcon/utils';
import {
    SuggestionList,
    type SuggestionItem,
    type SuggestionListRef,
} from '../../../../../components/common/SuggestionList/SuggestionList';
import suggestionStyles from '../../../../../components/common/SuggestionList/SuggestionList.module.css';
import TruncatedText from '../../../../../components/common/TruncatedText';
import styles from './AgentChatInput.module.css';
import { ContentMentionNodeView } from './ContentMentionNodeView';

const CONTENT_MENTION_NAME = 'contentMention';
const MIN_CONTENT_SEARCH_QUERY_LENGTH = 2;

const contentMentionPluginKey = new PluginKey('contentMention');

const DOM_RECT_FALLBACK: DOMRect = {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON() {
        return {};
    },
};

type ContentMentionGroup = 'thread' | 'current' | 'dashboardTile' | 'search';

export type ContentMentionSuggestionItem = SuggestionItem & {
    contentType: ContentType.CHART | ContentType.DASHBOARD;
    uuid: string;
    slug: string | null;
    chartKind?: ChartKind | null;
    spaceName?: string | null;
    group: ContentMentionGroup;
    dashboardUuid?: string | null;
    dashboardSlug?: string | null;
    dashboardName?: string | null;
    verified?: boolean;
};

const FILE_MENTION_GROUP = 'file';
// `contentType` value marking a content-mention node as a file (vs chart /
// dashboard). The node carries the path in `label`; no context payload.
const FILE_MENTION_CONTENT_TYPE = 'file';
const MAX_FILE_SUGGESTIONS = 8;

// A dbt source file the user can `@`-mention. Unlike content mentions it carries
// no context payload — picking it inserts the path as plain text so the agent
// reads the file itself via its repoShell tool (the "path reference" approach).
export type FileMentionSuggestionItem = SuggestionItem & {
    kind: 'file';
    path: string;
    group: typeof FILE_MENTION_GROUP;
};

export type AnyMentionSuggestionItem =
    | ContentMentionSuggestionItem
    | FileMentionSuggestionItem;

const isFileMentionItem = (
    item: AnyMentionSuggestionItem,
): item is FileMentionSuggestionItem => 'kind' in item && item.kind === 'file';

// Keyed by group string (content groups + the file group) so the suggestion
// list can label every section it renders.
const groupLabels: Record<string, string> = {
    thread: 'Already mentioned',
    current: 'Current page',
    dashboardTile: 'Dashboard tiles',
    search: 'Search results',
    [FILE_MENTION_GROUP]: 'Files',
};

// The project's file list is the same for every keystroke in a thread, so fetch
// it once per project and filter client-side. Errors (non-GitHub project, no
// source-code access) resolve to an empty list — the Files group just doesn't
// appear.
const projectFilesCache = new Map<string, Promise<string[]>>();

const fetchProjectFiles = (projectUuid: string): Promise<string[]> => {
    const cached = projectFilesCache.get(projectUuid);
    if (cached) return cached;
    const request = lightdashApi<ApiProjectFilesResponse['results']>({
        version: 'v1',
        url: `/ee/projects/${projectUuid}/ai-writeback/project-files`,
        method: 'GET',
        body: undefined,
    })
        .then((results) => results.files)
        .catch((error: unknown) => {
            // An empty list (no Files group) is the intended fallback for
            // non-GitHub projects or missing source-code access — but log so a
            // genuine failure is still traceable rather than silently swallowed.
            console.error('Failed to load project files for @-mentions', error);
            return [] as string[];
        });
    projectFilesCache.set(projectUuid, request);
    return request;
};

const getProjectFileSuggestions = async (
    projectUuid: string | undefined,
    query: string,
): Promise<FileMentionSuggestionItem[]> => {
    if (!projectUuid) return [];
    const files = await fetchProjectFiles(projectUuid);
    const matched = query.trim()
        ? files.filter((path) => fuzzyContentMentionLabelMatch(path, query))
        : files;
    return matched.slice(0, MAX_FILE_SUGGESTIONS).map((path) => ({
        id: `file:${path}`,
        label: path,
        kind: 'file',
        path,
        group: FILE_MENTION_GROUP,
    }));
};

export const isContentMentionSuggestionActive = (editor: Editor | null) => {
    if (!editor) return false;
    const state = contentMentionPluginKey.getState(editor.state) as
        | { active?: boolean }
        | undefined;
    return state?.active === true;
};

const getContentMentionContentType = (value: unknown) => {
    if (value === FILE_MENTION_CONTENT_TYPE) return FILE_MENTION_CONTENT_TYPE;
    return value === ContentType.DASHBOARD
        ? ContentType.DASHBOARD
        : ContentType.CHART;
};

const getContentMentionIconSpec = (contentType: string): DOMOutputSpec => [
    'span',
    {
        class: styles.contentMentionIcon,
        'aria-hidden': 'true',
        'data-icon-type': contentType,
    },
];

const getContextKey = (item: AiPromptContextInput[number]) =>
    item.type === 'chart'
        ? `chart:${item.chartUuid}`
        : `dashboard:${item.dashboardUuid}`;

const normalizeSearchText = (value: string) =>
    value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

const compactSearchText = (value: string) =>
    normalizeSearchText(value).replace(/[^a-z0-9]+/g, '');

// Priority suggestions come from local chat/page context, so they need the
// same punctuation-insensitive matching that remote content search applies.
export const fuzzyContentMentionLabelMatch = (label: string, query: string) => {
    const normalizedQuery = normalizeSearchText(query).trim();
    if (!normalizedQuery) return true;

    const normalizedLabel = normalizeSearchText(label);
    const compactLabel = compactSearchText(label);
    const queryTokens = normalizedQuery
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter(Boolean);

    if (queryTokens.length === 0) return true;

    return queryTokens.every(
        (token) =>
            normalizedLabel.includes(token) || compactLabel.includes(token),
    );
};

export const mergeAiPromptContextInput = (
    ...contextGroups: Array<AiPromptContextInput | undefined>
): AiPromptContextInput | undefined => {
    const seen = new Set<string>();
    const merged = contextGroups
        .flatMap((context) => context ?? [])
        .filter((item) => {
            const key = getContextKey(item);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    return merged.length > 0 ? merged : undefined;
};

export const mergeAiPromptContextItems = (
    ...contextGroups: Array<AiPromptContextItem[] | undefined>
): AiPromptContextItem[] | undefined => {
    const seen = new Set<string>();
    const merged = contextGroups
        .flatMap((context) => context ?? [])
        .filter((item) => {
            const key =
                item.type === 'chart'
                    ? `chart:${item.chartUuid}`
                    : `dashboard:${item.dashboardUuid}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    return merged.length > 0 ? merged : undefined;
};

export const mergeContentMentionSuggestionItems = (
    ...groups: Array<ContentMentionSuggestionItem[] | undefined>
): ContentMentionSuggestionItem[] => {
    const seen = new Set<string>();
    return groups
        .flatMap((group) => group ?? [])
        .filter((item) => {
            const key = `${item.contentType}:${item.uuid}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
};

export const contextItemsToContentMentionSuggestions = (
    context: AiPromptContextItem[],
    group: ContentMentionGroup,
): ContentMentionSuggestionItem[] =>
    context.map((item) =>
        item.type === 'chart'
            ? {
                  id: `${group}:chart:${item.chartUuid}`,
                  label: item.displayName ?? item.chartSlug ?? 'Chart',
                  contentType: ContentType.CHART,
                  uuid: item.chartUuid,
                  slug: item.chartSlug,
                  chartKind: item.chartKind,
                  group,
              }
            : {
                  id: `${group}:dashboard:${item.dashboardUuid}`,
                  label: item.displayName ?? item.dashboardSlug ?? 'Dashboard',
                  contentType: ContentType.DASHBOARD,
                  uuid: item.dashboardUuid,
                  slug: item.dashboardSlug,
                  group,
              },
    );

const summaryContentToSuggestion = (
    item: SummaryContent,
): ContentMentionSuggestionItem | null => {
    if (item.contentType === ContentType.CHART) {
        if (item.source !== ChartSourceType.DBT_EXPLORE) return null;
        return {
            id: `search:chart:${item.uuid}`,
            label: item.name,
            contentType: ContentType.CHART,
            uuid: item.uuid,
            slug: item.slug,
            chartKind: item.chartKind,
            spaceName: item.space.name,
            group: 'search',
            verified: item.verification !== null,
        };
    }

    if (item.contentType === ContentType.DASHBOARD) {
        return {
            id: `search:dashboard:${item.uuid}`,
            label: item.name,
            contentType: ContentType.DASHBOARD,
            uuid: item.uuid,
            slug: item.slug,
            spaceName: item.space.name,
            group: 'search',
            verified: item.verification !== null,
        };
    }

    return null;
};

const getSearchSuggestions = async (
    projectUuid: string,
    query: string,
): Promise<ContentMentionSuggestionItem[]> => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < MIN_CONTENT_SEARCH_QUERY_LENGTH) return [];

    const params = new URLSearchParams();
    params.append('projectUuids', projectUuid);
    params.append('contentTypes', ContentType.CHART);
    params.append('contentTypes', ContentType.DASHBOARD);
    params.set('pageSize', '20');
    params.set('page', '1');
    params.set('search', trimmedQuery);

    const results = await lightdashApi<ApiContentResponse['results']>({
        version: 'v2',
        url: `/content?${params.toString()}`,
        method: 'GET',
        body: undefined,
    }).catch(() => ({ data: [] }));

    return results.data
        .map(summaryContentToSuggestion)
        .filter((item): item is ContentMentionSuggestionItem => item !== null);
};

export const buildContentMentionSuggestionItems = async ({
    projectUuid,
    query,
    priorityItems,
}: {
    projectUuid: string | undefined;
    query: string;
    priorityItems: ContentMentionSuggestionItem[];
}) => {
    const matchingPriorityItems = priorityItems.filter((item) =>
        fuzzyContentMentionLabelMatch(item.label, query),
    );
    const searchItems = projectUuid
        ? await getSearchSuggestions(projectUuid, query)
        : [];

    const seen = new Set<string>();
    return [...matchingPriorityItems, ...searchItems].filter((item) => {
        const key = `${item.contentType}:${item.uuid}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

export const getContentMentionEmptyMessage = (query: string) => {
    const remainingChars =
        MIN_CONTENT_SEARCH_QUERY_LENGTH - query.trim().length;

    if (remainingChars <= 0) return 'No content found';
    if (remainingChars === 1) return 'Type 1 more character to search content';
    return `Type ${remainingChars} more characters to search content`;
};

const renderFileMentionItem = (
    item: FileMentionSuggestionItem,
    isSelected: boolean,
    onClick: () => void,
) => {
    // Show the basename prominently and the parent directory as the detail, so
    // files with the same name in different models are still distinguishable.
    const lastSlash = item.path.lastIndexOf('/');
    const name = lastSlash >= 0 ? item.path.slice(lastSlash + 1) : item.path;
    const dir = lastSlash >= 0 ? item.path.slice(0, lastSlash) : '';

    return (
        <PolymorphicGroupButton
            onClick={onClick}
            className={`${suggestionStyles.suggestionItem} ${styles.contentMentionSuggestionItem}`}
            data-selected={isSelected}
        >
            <Group wrap="nowrap" gap="xs" w="100%">
                <MantineIcon icon={IconFile} size="sm" color="ldGray.6" />
                <div className={styles.contentMentionSuggestionText}>
                    <TruncatedText maxWidth="100%" fz="xs" fw={500} inline>
                        {name}
                    </TruncatedText>
                    <Text size="xs" c="dimmed" truncate>
                        {dir || groupLabels[FILE_MENTION_GROUP]}
                    </Text>
                </div>
            </Group>
        </PolymorphicGroupButton>
    );
};

const renderContentMentionItem = (
    item: AnyMentionSuggestionItem,
    isSelected: boolean,
    onClick: () => void,
) => {
    if (isFileMentionItem(item)) {
        return renderFileMentionItem(item, isSelected, onClick);
    }
    const Icon =
        item.contentType === ContentType.DASHBOARD
            ? IconLayoutDashboard
            : getChartIcon(item.chartKind ?? undefined);
    const iconColor =
        item.contentType === ContentType.DASHBOARD ? 'green.7' : 'blue.7';
    const detail = item.spaceName ?? groupLabels[item.group];

    return (
        <PolymorphicGroupButton
            onClick={onClick}
            className={`${suggestionStyles.suggestionItem} ${styles.contentMentionSuggestionItem}`}
            data-selected={isSelected}
        >
            <Group wrap="nowrap" gap="xs" w="100%">
                <MantineIcon icon={Icon} size="sm" color={iconColor} />
                <div className={styles.contentMentionSuggestionText}>
                    <Group
                        gap={4}
                        wrap="nowrap"
                        className={styles.contentMentionSuggestionLabel}
                    >
                        <TruncatedText
                            maxWidth="100%"
                            fz="xs"
                            fw={500}
                            inline
                            style={{ flex: 1, minWidth: 0 }}
                        >
                            {item.label}
                        </TruncatedText>
                        {item.verified && (
                            <MantineIcon
                                icon={IconCircleCheck}
                                size="xs"
                                color="green.6"
                            />
                        )}
                    </Group>
                    <Text size="xs" c="dimmed" truncate>
                        {detail}
                    </Text>
                </div>
            </Group>
        </PolymorphicGroupButton>
    );
};

const generateContentMentionSuggestion = ({
    getProjectUuid,
    getPriorityItems,
}: {
    getProjectUuid: () => string | undefined;
    getPriorityItems: () => ContentMentionSuggestionItem[];
}): MentionOptions['suggestion'] => ({
    char: '@',
    allowSpaces: true,
    pluginKey: contentMentionPluginKey,
    items: async ({ query }) => {
        const projectUuid = getProjectUuid();
        const [contentItems, fileItems] = await Promise.all([
            buildContentMentionSuggestionItems({
                projectUuid,
                query,
                priorityItems: getPriorityItems(),
            }),
            getProjectFileSuggestions(projectUuid, query),
        ]);
        return [...contentItems, ...fileItems];
    },
    command: ({ editor, range, props }) => {
        const item = props as AnyMentionSuggestionItem;
        // File mentions reuse the content-mention atom so they render as the
        // same pill, distinguished by a `file` contentType with the path stored
        // in `label`. The node's `renderText` returns the label, so the path
        // still lands in the prompt text verbatim — the agent reads the file via
        // repoShell (no context payload, unlike chart/dashboard mentions).
        const attrs = isFileMentionItem(item)
            ? {
                  contentType: FILE_MENTION_CONTENT_TYPE,
                  uuid: null,
                  slug: null,
                  label: item.path,
                  chartKind: null,
                  dashboardUuid: null,
                  dashboardSlug: null,
                  dashboardName: null,
              }
            : {
                  contentType: item.contentType,
                  uuid: item.uuid,
                  slug: item.slug,
                  label: item.label,
                  chartKind: item.chartKind ?? null,
                  dashboardUuid: item.dashboardUuid ?? null,
                  dashboardSlug: item.dashboardSlug ?? null,
                  dashboardName: item.dashboardName ?? null,
              };
        editor
            .chain()
            .focus()
            .insertContentAt(range, [
                { type: CONTENT_MENTION_NAME, attrs },
                { type: 'text', text: ' ' },
            ])
            .run();
    },
    render: () => {
        let component: ReactRenderer<SuggestionListRef> | undefined;
        let popup: TippyInstance | undefined;

        return {
            onStart: (props) => {
                component = new ReactRenderer(SuggestionList, {
                    props: {
                        ...props,
                        renderItem: renderContentMentionItem,
                        getGroupKey: (item: AnyMentionSuggestionItem) =>
                            item.group,
                        groupLabels,
                        emptyMessage: getContentMentionEmptyMessage(
                            props.query,
                        ),
                    },
                    editor: props.editor,
                });

                popup = tippy('body', {
                    getReferenceClientRect: () =>
                        props.clientRect?.() ?? DOM_RECT_FALLBACK,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
                    maxWidth: 'none',
                })[0];
            },
            onUpdate: (props) => {
                component?.updateProps({
                    ...props,
                    renderItem: renderContentMentionItem,
                    getGroupKey: (item: ContentMentionSuggestionItem) =>
                        item.group,
                    groupLabels,
                    emptyMessage: getContentMentionEmptyMessage(props.query),
                });
                popup?.setProps({
                    getReferenceClientRect: () =>
                        props.clientRect?.() ?? DOM_RECT_FALLBACK,
                });
            },
            onKeyDown: (props) => {
                if (props.event.key === 'Escape') {
                    popup?.hide();
                    return true;
                }
                return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
                popup?.destroy();
                component?.destroy();
                popup = undefined;
                component = undefined;
            },
        };
    },
});

export const createContentMentionExtension = ({
    getProjectUuid,
    getPriorityItems,
}: {
    getProjectUuid: () => string | undefined;
    getPriorityItems: () => ContentMentionSuggestionItem[];
}) =>
    Mention.extend({
        name: CONTENT_MENTION_NAME,
        atom: true,
        addAttributes() {
            return {
                contentType: { default: null },
                uuid: { default: null },
                slug: { default: null },
                label: { default: null },
                chartKind: { default: null },
                dashboardUuid: { default: null },
                dashboardSlug: { default: null },
                dashboardName: { default: null },
            };
        },
        addKeyboardShortcuts() {
            return {
                Backspace: () =>
                    this.editor.commands.command(({ tr, state }) => {
                        const { selection } = state;
                        const { empty, anchor } = selection;
                        if (!empty || anchor <= 0) return false;
                        let deleted = false;
                        state.doc.nodesBetween(
                            Math.max(0, anchor - 1),
                            anchor,
                            (node, pos) => {
                                if (node.type.name === this.name) {
                                    tr.delete(pos, pos + node.nodeSize);
                                    deleted = true;
                                    return false;
                                }
                            },
                        );
                        return deleted;
                    }),
            };
        },
        addNodeView() {
            return ReactNodeViewRenderer(ContentMentionNodeView);
        },
    }).configure({
        suggestion: generateContentMentionSuggestion({
            getProjectUuid,
            getPriorityItems,
        }),
        renderText: ({ node }) =>
            typeof node.attrs.label === 'string' ? node.attrs.label : '',
        renderHTML: ({ node }) => {
            const contentType = getContentMentionContentType(
                node.attrs.contentType,
            );
            return [
                'span',
                {
                    class: styles.contentMention,
                    'data-content-type': contentType,
                },
                getContentMentionIconSpec(contentType),
                [
                    'span',
                    { class: styles.contentMentionLabel },
                    typeof node.attrs.label === 'string'
                        ? node.attrs.label
                        : '',
                ],
            ];
        },
    });

export const extractContentMentionContext = (
    editor: Editor | null,
): {
    context: AiPromptContextInput | undefined;
    optimisticContext: AiPromptContextItem[] | undefined;
} => {
    if (!editor) return { context: undefined, optimisticContext: undefined };

    const context: AiPromptContextInput = [];
    const optimisticContext: AiPromptContextItem[] = [];

    editor.state.doc.descendants((node) => {
        if (node.type.name !== CONTENT_MENTION_NAME) return;

        const attrs = node.attrs as {
            contentType?: ContentType;
            uuid?: string;
            slug?: string | null;
            label?: string | null;
            chartKind?: ChartKind | null;
            dashboardUuid?: string | null;
            dashboardSlug?: string | null;
            dashboardName?: string | null;
        };

        if (attrs.dashboardUuid && attrs.contentType === ContentType.CHART) {
            context.push({
                type: 'dashboard',
                dashboardUuid: attrs.dashboardUuid,
                dashboardSlug: attrs.dashboardSlug ?? null,
            });
            optimisticContext.push({
                type: 'dashboard',
                dashboardUuid: attrs.dashboardUuid,
                dashboardSlug: attrs.dashboardSlug ?? null,
                displayName: attrs.dashboardName ?? null,
                pinnedVersionUuid: null,
            });
        }

        if (attrs.contentType === ContentType.CHART && attrs.uuid) {
            context.push({
                type: 'chart',
                chartUuid: attrs.uuid,
                chartSlug: attrs.slug ?? null,
            });
            optimisticContext.push({
                type: 'chart',
                chartUuid: attrs.uuid,
                chartSlug: attrs.slug ?? null,
                displayName: attrs.label ?? null,
                pinnedVersionUuid: null,
                runtimeOverrides: null,
                chartKind: attrs.chartKind ?? null,
            });
            return;
        }

        if (attrs.contentType === ContentType.DASHBOARD && attrs.uuid) {
            context.push({
                type: 'dashboard',
                dashboardUuid: attrs.uuid,
                dashboardSlug: attrs.slug ?? null,
            });
            optimisticContext.push({
                type: 'dashboard',
                dashboardUuid: attrs.uuid,
                dashboardSlug: attrs.slug ?? null,
                displayName: attrs.label ?? null,
                pinnedVersionUuid: null,
            });
        }
    });

    return {
        context: mergeAiPromptContextInput(context),
        optimisticContext: mergeAiPromptContextItems(optimisticContext),
    };
};
