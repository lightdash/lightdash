import {
    assertUnreachable,
    ChartSourceType,
    ContentType,
    DATA_APP_VIZ_TEMPLATE,
    type AiPromptContextInput,
    type AiPromptContextItem,
    type ApiContentResponse,
    type ApiProjectFilesResponse,
    type ApiProjectRepositoriesResponse,
    type ChartKind,
    type GitRepo,
    type SummaryContent,
} from '@lightdash/common';
import { Badge, Group, Text } from '@mantine/core';
import {
    IconBrandGithub,
    IconBrandGitlab,
    IconCircleCheck,
    IconFile,
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
import {
    SuggestionList,
    type SuggestionItem,
    type SuggestionListRef,
} from '../../../../../components/common/SuggestionList/SuggestionList';
import suggestionStyles from '../../../../../components/common/SuggestionList/SuggestionList.module.css';
import TruncatedText from '../../../../../components/common/TruncatedText';
import styles from './AgentChatInput.module.css';
import {
    FILE_MENTION_CONTENT_TYPE,
    getContentMentionContentType,
    REPOSITORY_MENTION_CONTENT_TYPE,
} from './contentMentionContentType';
import { getContentMentionIcon } from './contentMentionIcon';
import { ContentMentionNodeView } from './ContentMentionNodeView';
import {
    getDataAppContextItemName,
    getPromptContextItemKey,
} from './contentReferenceUtils';

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
    contentType:
        | ContentType.CHART
        | ContentType.DASHBOARD
        | ContentType.DATA_APP;
    uuid: string;
    slug: string | null;
    chartKind?: ChartKind | null;
    spaceName?: string | null;
    // Personal data apps have no space; agents restricted to spaces hide them.
    isPersonalDataApp: boolean;
    group: ContentMentionGroup;
    dashboardUuid?: string | null;
    dashboardSlug?: string | null;
    dashboardName?: string | null;
    verified?: boolean;
};

const FILE_MENTION_GROUP = 'file';
const MAX_FILE_SUGGESTIONS = 8;

// A dbt source file the user can `@`-mention. Unlike content mentions it carries
// no context payload — picking it inserts the path as plain text so the agent
// reads the file itself via its exploreRepo tool (the "path reference" approach).
export type FileMentionSuggestionItem = SuggestionItem & {
    kind: 'file';
    path: string;
    group: typeof FILE_MENTION_GROUP;
};

const REPOSITORY_MENTION_GROUP = 'repository';
const MAX_REPOSITORY_SUGGESTIONS = 8;

// A GitHub or GitLab repository the org's installation can access. Like file
// mentions it carries no context payload — picking it inserts `owner/repo` as
// plain text so the agent reads that repository's mount directly (it's the user
// pre-selecting which repo to focus on, so the agent doesn't have to ask).
export type RepositoryMentionSuggestionItem = SuggestionItem & {
    kind: 'repository';
    fullName: string;
    ownerLogin: string;
    provider?: 'github' | 'gitlab';
    // Whether the coding agent can WRITE this repo (open a PR). When false the
    // repo is still mentionable for read (exploreRepo), so we badge it
    // "Read-only" rather than hide it — see the suggestion render.
    writable?: boolean;
    group: typeof REPOSITORY_MENTION_GROUP;
};

export type AnyMentionSuggestionItem =
    | ContentMentionSuggestionItem
    | FileMentionSuggestionItem
    | RepositoryMentionSuggestionItem;

const isFileMentionItem = (
    item: AnyMentionSuggestionItem,
): item is FileMentionSuggestionItem => 'kind' in item && item.kind === 'file';

const isRepositoryMentionItem = (
    item: AnyMentionSuggestionItem,
): item is RepositoryMentionSuggestionItem =>
    'kind' in item && item.kind === 'repository';

// Keyed by group string (content groups + the file group) so the suggestion
// list can label every section it renders.
const groupLabels: Record<string, string> = {
    thread: 'Already mentioned',
    current: 'Current page',
    dashboardTile: 'Dashboard tiles',
    search: 'Search results',
    [FILE_MENTION_GROUP]: 'Files',
    [REPOSITORY_MENTION_GROUP]: 'Repositories',
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

// The repositories the agent can read are the same for every keystroke in a
// thread, so fetch once per project and filter client-side — mirroring the
// project-files cache. Uses the project-scoped endpoint (gated by
// view:SourceCode) rather than the org-wide /github/repos/list, so repo names
// are never exposed to users without source-code access. Errors (no GitHub App,
// no source-code access) resolve to an empty list, so the Repositories group
// simply doesn't appear.
const repositoriesCache = new Map<string, Promise<GitRepo[]>>();

const fetchRepositories = (projectUuid: string): Promise<GitRepo[]> => {
    const cached = repositoriesCache.get(projectUuid);
    if (cached) return cached;
    const request = lightdashApi<ApiProjectRepositoriesResponse['results']>({
        version: 'v1',
        url: `/ee/projects/${projectUuid}/ai-writeback/repositories`,
        method: 'GET',
        body: undefined,
    }).catch((error: unknown) => {
        // An empty list (no Repositories group) is the intended fallback when
        // GitHub isn't connected — but log so a genuine failure stays traceable.
        console.error('Failed to load repositories for @-mentions', error);
        return [] as GitRepo[];
    });
    repositoriesCache.set(projectUuid, request);
    return request;
};

const getRepositorySuggestions = async (
    projectUuid: string | undefined,
    query: string,
): Promise<RepositoryMentionSuggestionItem[]> => {
    if (!projectUuid) return [];
    const repos = await fetchRepositories(projectUuid);
    const matched = query.trim()
        ? repos.filter((repo) =>
              fuzzyContentMentionLabelMatch(repo.fullName, query),
          )
        : repos;
    return matched.slice(0, MAX_REPOSITORY_SUGGESTIONS).map((repo) => ({
        id: `repository:${repo.fullName}`,
        label: repo.fullName,
        kind: 'repository',
        fullName: repo.fullName,
        ownerLogin: repo.ownerLogin,
        provider: repo.provider,
        writable: repo.writable,
        group: REPOSITORY_MENTION_GROUP,
    }));
};

export const isContentMentionSuggestionActive = (editor: Editor | null) => {
    if (!editor) return false;
    const state = contentMentionPluginKey.getState(editor.state) as
        | { active?: boolean }
        | undefined;
    return state?.active === true;
};

/** What the @-mention dropdown is doing, per the suggestion renderer. */
export type ContentMentionMenuState =
    | { status: 'closed' }
    | { status: 'dismissed' }
    | { status: 'open'; itemCount: number };

export const CLOSED_CONTENT_MENTION_MENU: ContentMentionMenuState = {
    status: 'closed',
};

/**
 * Enter belongs to the dropdown only while it has something to select. Mentions
 * allow spaces, so a stray `@` keeps the query alive for the rest of the
 * sentence — a menu showing "no results", or one dismissed with Escape, must
 * hand Enter back to the composer. While items are still resolving there is no
 * menu yet, so fall back to the plugin's own active flag.
 */
export const contentMentionMenuOwnsEnter = (
    menu: ContentMentionMenuState,
    isSuggestionActive: boolean,
) => {
    switch (menu.status) {
        case 'open':
            return menu.itemCount > 0;
        case 'dismissed':
            return false;
        case 'closed':
            return isSuggestionActive;
        default:
            return assertUnreachable(
                menu,
                'Unknown content mention menu state',
            );
    }
};

const getContentMentionIconSpec = (contentType: string): DOMOutputSpec => [
    'span',
    {
        class: styles.contentMentionIcon,
        'aria-hidden': 'true',
        'data-icon-type': contentType,
    },
];

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
    const merged: AiPromptContextInput = [];
    contextGroups
        .flatMap((context) => context ?? [])
        .forEach((item) => {
            const key = getPromptContextItemKey(item);
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            merged.push(item);
        });
    return merged.length > 0 ? merged : undefined;
};

export const mergeAiPromptContextItems = (
    ...contextGroups: Array<AiPromptContextItem[] | undefined>
): AiPromptContextItem[] | undefined => {
    const seen = new Set<string>();
    const merged: AiPromptContextItem[] = [];
    contextGroups
        .flatMap((context) => context ?? [])
        .forEach((item) => {
            const key = getPromptContextItemKey(item);
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            merged.push(item);
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
    context.flatMap((item) => {
        if (item.type === 'chart') {
            return {
                id: `${group}:chart:${item.chartUuid}`,
                label: item.displayName ?? item.chartSlug ?? 'Chart',
                contentType: ContentType.CHART,
                uuid: item.chartUuid,
                slug: item.chartSlug,
                chartKind: item.chartKind,
                isPersonalDataApp: false,
                group,
            };
        }
        if (item.type === 'dashboard') {
            return {
                id: `${group}:dashboard:${item.dashboardUuid}`,
                label: item.displayName ?? item.dashboardSlug ?? 'Dashboard',
                contentType: ContentType.DASHBOARD,
                uuid: item.dashboardUuid,
                slug: item.dashboardSlug,
                isPersonalDataApp: false,
                group,
            };
        }
        if (item.type === 'data_app') {
            return {
                id: `${group}:data_app:${item.appUuid}`,
                label: getDataAppContextItemName(item),
                contentType: ContentType.DATA_APP,
                uuid: item.appUuid,
                slug: item.appSlug,
                isPersonalDataApp: item.isPersonal,
                group,
            };
        }
        // Threads are reference-only context — not mentionable content.
        return [];
    });

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
            isPersonalDataApp: false,
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
            isPersonalDataApp: false,
            group: 'search',
            verified: item.verification !== null,
        };
    }

    // Project chart types are data apps under the hood but not content the
    // agent reads, so they never show up as mentions.
    if (item.contentType === ContentType.DATA_APP) {
        if (item.template === DATA_APP_VIZ_TEMPLATE) return null;
        return {
            id: `search:data_app:${item.uuid}`,
            label: item.name,
            contentType: ContentType.DATA_APP,
            uuid: item.uuid,
            slug: item.slug,
            spaceName: item.space?.name ?? null,
            isPersonalDataApp: item.space === null,
            group: 'search',
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
    params.append('contentTypes', ContentType.DATA_APP);
    params.set('includePersonalDataApps', 'true');
    params.set('dataAppVizsFilter', 'exclude');
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
    hidePersonalDataApps = false,
}: {
    projectUuid: string | undefined;
    query: string;
    priorityItems: ContentMentionSuggestionItem[];
    // A space-restricted agent cannot read personal apps, so don't offer them.
    hidePersonalDataApps?: boolean;
}) => {
    const matchingPriorityItems = priorityItems.filter((item) =>
        fuzzyContentMentionLabelMatch(item.label, query),
    );
    const searchItems = projectUuid
        ? await getSearchSuggestions(projectUuid, query)
        : [];

    const seen = new Set<string>();
    return [...matchingPriorityItems, ...searchItems].filter((item) => {
        if (hidePersonalDataApps && item.isPersonalDataApp) return false;
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
                <MantineIcon icon={IconFile} size="sm" color="dimmed" />
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

const renderRepositoryMentionItem = (
    item: RepositoryMentionSuggestionItem,
    isSelected: boolean,
    onClick: () => void,
) => {
    // Show repo name prominently and the owner as detail, so two repos with the
    // same name under different owners stay distinguishable.
    const slash = item.fullName.indexOf('/');
    const name = slash >= 0 ? item.fullName.slice(slash + 1) : item.fullName;

    return (
        <PolymorphicGroupButton
            onClick={onClick}
            className={`${suggestionStyles.suggestionItem} ${styles.contentMentionSuggestionItem}`}
            data-selected={isSelected}
        >
            <Group wrap="nowrap" gap="xs" w="100%">
                <MantineIcon
                    icon={
                        item.provider === 'gitlab'
                            ? IconBrandGitlab
                            : IconBrandGithub
                    }
                    size="sm"
                    color="dimmed"
                />
                <div className={styles.contentMentionSuggestionText}>
                    <TruncatedText maxWidth="100%" fz="xs" fw={500} inline>
                        {name}
                    </TruncatedText>
                    <Text size="xs" c="dimmed" truncate>
                        {item.ownerLogin}
                    </Text>
                </div>
                {item.writable === false && (
                    // Still mentionable for read (exploreRepo); the badge signals
                    // the coding agent can't open a PR against it.
                    <Badge
                        ml="auto"
                        size="xs"
                        title="The coding agent can't open a pull request on this repository"
                    >
                        Read-only
                    </Badge>
                )}
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
    if (isRepositoryMentionItem(item)) {
        return renderRepositoryMentionItem(item, isSelected, onClick);
    }
    const { icon: Icon, color: iconColor } = getContentMentionIcon(
        item.contentType,
        item.chartKind ?? null,
    );
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
    getHidePersonalDataApps,
    onMenuStateChange,
    includeFilesAndRepositories,
}: {
    getProjectUuid: () => string | undefined;
    getPriorityItems: () => ContentMentionSuggestionItem[];
    getHidePersonalDataApps: () => boolean;
    onMenuStateChange?: (state: ContentMentionMenuState) => void;
    includeFilesAndRepositories: boolean;
}): MentionOptions['suggestion'] => ({
    char: '@',
    allowSpaces: true,
    pluginKey: contentMentionPluginKey,
    items: async ({ query }) => {
        const projectUuid = getProjectUuid();
        // Files / repositories are only mentionable in the AI-agent composer;
        // other surfaces (e.g. homepage announcements) mention content only.
        if (!includeFilesAndRepositories) {
            return buildContentMentionSuggestionItems({
                projectUuid,
                query,
                priorityItems: getPriorityItems(),
                hidePersonalDataApps: getHidePersonalDataApps(),
            });
        }
        // Fetch all three in parallel so files/repos don't wait on content.
        const [contentItems, fileItems, repositoryItems] = await Promise.all([
            buildContentMentionSuggestionItems({
                projectUuid,
                query,
                priorityItems: getPriorityItems(),
                hidePersonalDataApps: getHidePersonalDataApps(),
            }),
            getProjectFileSuggestions(projectUuid, query),
            getRepositorySuggestions(projectUuid, query),
        ]);
        return [...contentItems, ...fileItems, ...repositoryItems];
    },
    command: ({ editor, range, props }) => {
        const item = props as AnyMentionSuggestionItem;
        // File mentions reuse the content-mention atom so they render as the
        // same pill, distinguished by a `file` contentType with the path stored
        // in `label`. The node's `renderText` returns the label, so the path
        // still lands in the prompt text verbatim — the agent reads the file via
        // exploreRepo (no context payload, unlike chart/dashboard mentions).
        const baseAttrs = {
            uuid: null,
            slug: null,
            chartKind: null,
            isPersonalDataApp: false,
            dashboardUuid: null,
            dashboardSlug: null,
            dashboardName: null,
        };
        let attrs;
        if (isFileMentionItem(item)) {
            // The node's `renderText` returns the label, so the path lands in
            // the prompt text verbatim — the agent reads the file via exploreRepo
            // (no context payload, unlike chart/dashboard mentions).
            attrs = {
                ...baseAttrs,
                contentType: FILE_MENTION_CONTENT_TYPE,
                label: item.path,
            };
        } else if (isRepositoryMentionItem(item)) {
            // Same path-reference approach: `owner/repo` lands in the prompt text
            // so the agent reads that repository's mount directly.
            attrs = {
                ...baseAttrs,
                contentType: REPOSITORY_MENTION_CONTENT_TYPE,
                label: item.fullName,
            };
        } else {
            attrs = {
                contentType: item.contentType,
                uuid: item.uuid,
                slug: item.slug,
                label: item.label,
                chartKind: item.chartKind ?? null,
                isPersonalDataApp: item.isPersonalDataApp,
                dashboardUuid: item.dashboardUuid ?? null,
                dashboardSlug: item.dashboardSlug ?? null,
                dashboardName: item.dashboardName ?? null,
            };
        }
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
        // Escape hides the dropdown but leaves the suggestion match in place;
        // it must stay hidden — and stay out of Enter's way — until the match
        // exits.
        let dismissed = false;

        return {
            onStart: (props) => {
                dismissed = false;
                onMenuStateChange?.({
                    status: 'open',
                    itemCount: props.items.length,
                });
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
                if (dismissed) return;
                onMenuStateChange?.({
                    status: 'open',
                    itemCount: props.items.length,
                });
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
                    dismissed = true;
                    onMenuStateChange?.({ status: 'dismissed' });
                    popup?.hide();
                    return true;
                }
                if (dismissed) return false;
                return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
                dismissed = false;
                onMenuStateChange?.(CLOSED_CONTENT_MENTION_MENU);
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
    getHidePersonalDataApps = () => false,
    onMenuStateChange,
    includeFilesAndRepositories = true,
}: {
    getProjectUuid: () => string | undefined;
    getPriorityItems: () => ContentMentionSuggestionItem[];
    getHidePersonalDataApps?: () => boolean;
    onMenuStateChange?: (state: ContentMentionMenuState) => void;
    includeFilesAndRepositories?: boolean;
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
                isPersonalDataApp: { default: false },
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
            getHidePersonalDataApps,
            onMenuStateChange,
            includeFilesAndRepositories,
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
            contentType?:
                | ContentType
                | typeof FILE_MENTION_CONTENT_TYPE
                | typeof REPOSITORY_MENTION_CONTENT_TYPE;
            uuid?: string;
            slug?: string | null;
            label?: string | null;
            chartKind?: ChartKind | null;
            isPersonalDataApp?: boolean;
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
                runtimeOverrides: null,
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
                runtimeOverrides: null,
            });
            return;
        }

        if (attrs.contentType === ContentType.DATA_APP && attrs.uuid) {
            context.push({
                type: 'data_app',
                appUuid: attrs.uuid,
                appSlug: attrs.slug ?? null,
            });
            optimisticContext.push({
                type: 'data_app',
                appUuid: attrs.uuid,
                appSlug: attrs.slug ?? null,
                displayName: attrs.label ?? null,
                pinnedVersion: null,
                isPersonal: attrs.isPersonalDataApp === true,
            });
            return;
        }

        // File / repository mentions carry their reference in `label` (the path
        // / `owner/repo`) — emit a structured context item so the agent knows
        // it's a file or a repo, never having to disambiguate from the text.
        if (
            attrs.contentType === FILE_MENTION_CONTENT_TYPE &&
            typeof attrs.label === 'string'
        ) {
            context.push({ type: 'file', path: attrs.label });
            optimisticContext.push({ type: 'file', path: attrs.label });
            return;
        }

        if (
            attrs.contentType === REPOSITORY_MENTION_CONTENT_TYPE &&
            typeof attrs.label === 'string'
        ) {
            context.push({ type: 'repository', fullName: attrs.label });
            optimisticContext.push({
                type: 'repository',
                fullName: attrs.label,
            });
        }
    });

    return {
        context: mergeAiPromptContextInput(context),
        optimisticContext: mergeAiPromptContextItems(optimisticContext),
    };
};
