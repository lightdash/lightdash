import {
    ChartSourceType,
    ContentType,
    type AiPromptContextInput,
    type AiPromptContextItem,
    type ApiContentResponse,
    type ChartKind,
    type SummaryContent,
} from '@lightdash/common';
import { Group, Text } from '@mantine-8/core';
import { IconCircleCheck, IconLayoutDashboard } from '@tabler/icons-react';
import Mention, { type MentionOptions } from '@tiptap/extension-mention';
import { type DOMOutputSpec } from '@tiptap/pm/model';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer, type Editor } from '@tiptap/react';
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
import styles from './AgentChatInput.module.css';

const CONTENT_MENTION_NAME = 'contentMention';

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

const groupLabels: Record<ContentMentionGroup, string> = {
    thread: 'Already mentioned',
    current: 'Current page',
    dashboardTile: 'Dashboard tiles',
    search: 'Search results',
};

export const isContentMentionSuggestionActive = (editor: Editor | null) => {
    if (!editor) return false;
    const state = contentMentionPluginKey.getState(editor.state) as
        | { active?: boolean }
        | undefined;
    return state?.active === true;
};

const getContentMentionContentType = (value: unknown) =>
    value === ContentType.DASHBOARD ? ContentType.DASHBOARD : ContentType.CHART;

const getContentMentionIconSpec = (
    contentType: ContentType.CHART | ContentType.DASHBOARD,
): DOMOutputSpec => [
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
    const params = new URLSearchParams();
    params.append('projectUuids', projectUuid);
    params.append('contentTypes', ContentType.CHART);
    params.append('contentTypes', ContentType.DASHBOARD);
    params.set('pageSize', '20');
    params.set('page', '1');
    if (query.trim()) params.set('search', query.trim());

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
    const normalizedQuery = query.trim().toLowerCase();
    const matchingPriorityItems = priorityItems.filter((item) =>
        item.label.toLowerCase().includes(normalizedQuery),
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

const renderContentMentionItem = (
    item: ContentMentionSuggestionItem,
    isSelected: boolean,
    onClick: () => void,
) => {
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
                    <Group gap={4} wrap="nowrap">
                        <Text size="xs" truncate fw={500}>
                            {item.label}
                        </Text>
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
    items: ({ query }) =>
        buildContentMentionSuggestionItems({
            projectUuid: getProjectUuid(),
            query,
            priorityItems: getPriorityItems(),
        }),
    command: ({ editor, range, props }) => {
        const item = props as ContentMentionSuggestionItem;
        editor
            .chain()
            .focus()
            .insertContentAt(range, [
                {
                    type: CONTENT_MENTION_NAME,
                    attrs: {
                        contentType: item.contentType,
                        uuid: item.uuid,
                        slug: item.slug,
                        label: item.label,
                        chartKind: item.chartKind ?? null,
                        dashboardUuid: item.dashboardUuid ?? null,
                        dashboardSlug: item.dashboardSlug ?? null,
                        dashboardName: item.dashboardName ?? null,
                    },
                },
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
                        getGroupKey: (item: ContentMentionSuggestionItem) =>
                            item.group,
                        groupLabels,
                        emptyMessage: 'No content found',
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
                    emptyMessage: 'No content found',
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
