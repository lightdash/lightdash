import { subject } from '@casl/ability';
import {
    getSearchResultId,
    SearchItemType,
    type SearchFilters,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Kbd,
    Loader,
    Modal,
    rem,
    Stack,
    Text,
    TextInput,
    Transition,
} from '@mantine-8/core';
import {
    useDebouncedValue,
    useDisclosure,
    useHotkeys,
    useScrollIntoView,
} from '@mantine-8/hooks';
import {
    IconSearch,
    IconSettings,
    IconTable,
    IconX,
} from '@tabler/icons-react';
import {
    useEffect,
    useMemo,
    useState,
    type FC,
    type MouseEventHandler,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { AiAgentIcon } from '../../../ee/features/aiCopilot/components/AiAgentIcon';
import { useAiAgentButtonVisibility } from '../../../ee/features/aiCopilot/hooks/useAiAgentsButtonVisibility';
import { useProject } from '../../../hooks/useProject';
import { useSpaceSummaries } from '../../../hooks/useSpaces';
import { useValidationUserAbility } from '../../../hooks/validation/useValidation';
import useApp from '../../../providers/App/useApp';
import Mantine8Provider from '../../../providers/Mantine8Provider';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useOmnibarSettingsItems } from '../hooks/useOmnibarSettingsItems';
import useSearch, { hasMinQueryLength } from '../hooks/useSearch';
import {
    type FocusedItemIndex,
    type OmnibarGroup,
    type SearchItem,
} from '../types/searchItem';
import { getSearchItemLabel } from '../utils/getSearchItemLabel';
import classes from './Omnibar.module.css';
import OmnibarEmptyState from './OmnibarEmptyState';
import OmnibarFilters from './OmnibarFilters';
import OmnibarItemGroups from './OmnibarItemGroups';
import { OmnibarKeyboardNav } from './OmnibarKeyboardNav';
import OmnibarPreview from './OmnibarPreview';
import OmnibarTarget from './OmnibarTarget';
import { getSearchResultsGroupsSorted } from './utils';

interface Props {
    projectUuid: string;
}

const Omnibar: FC<Props> = ({ projectUuid }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { data: projectData } = useProject(projectUuid);
    const { track } = useTracking();
    const canUserManageValidation = useValidationUserAbility(projectUuid);
    const [searchFilters, setSearchFilters] = useState<SearchFilters>();
    const [query, setQuery] = useState<string>();
    const [debouncedValue] = useDebouncedValue(query, 300);
    const { targetRef: scrollRef } = useScrollIntoView<HTMLDivElement>(); // couldn't get scroll to work with mantine's function

    // undefined = default (top hit highlighted); 'input' = the user arrowed
    // back up to the search input, so no row is highlighted.
    const [focusedItemIndex, setFocusedItemIndex] = useState<
        FocusedItemIndex | 'input'
    >();

    const { data: searchResults, isFetching } = useSearch({
        projectUuid,
        query: debouncedValue,
        filters: searchFilters,
        source: 'omnibar',
    });

    const settingsItems = useOmnibarSettingsItems(debouncedValue ?? '');

    const [isOmnibarOpen, { open: openOmnibar, close: closeOmnibar }] =
        useDisclosure(false);

    const { data: spaceSummaries } = useSpaceSummaries(projectUuid, true, {
        enabled: isOmnibarOpen,
    });
    const spaceNamesByUuid = useMemo(
        () =>
            new Map(
                (spaceSummaries ?? []).map((space) => [space.uuid, space.name]),
            ),
        [spaceSummaries],
    );

    const { user } = useApp();
    const isAiAgentsEnabled = useAiAgentButtonVisibility();
    const canManageExplore =
        user.data?.ability?.can(
            'manage',
            subject('Explore', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
            }),
        ) ?? false;
    const canManageProject =
        user.data?.ability?.can(
            'manage',
            subject('Project', {
                organizationUuid: user.data.organizationUuid,
                projectUuid,
            }),
        ) ?? false;

    const handleOmnibarOpenInputClick: MouseEventHandler<HTMLInputElement> = (
        e,
    ) => {
        e.currentTarget.blur();

        track({
            name: EventName.GLOBAL_SEARCH_OPEN,
            properties: {
                action: 'input_click',
            },
        });

        openOmnibar();
    };

    const handleOmnibarOpenHotkey = () => {
        track({
            name: EventName.GLOBAL_SEARCH_OPEN,
            properties: {
                action: 'hotkeys',
            },
        });

        openOmnibar();
    };

    useHotkeys(
        [['mod + k', handleOmnibarOpenHotkey, { preventDefault: true }]],
        [],
        true,
    );

    const handleQuickAction = (pathname: string) => {
        closeOmnibar();
        setQuery(undefined);
        void navigate(pathname);
    };

    const handleOmnibarClose = () => {
        track({
            name: EventName.GLOBAL_SEARCH_CLOSED,
            properties: {
                action: 'default',
            },
        });
        setFocusedItemIndex(undefined);
        closeOmnibar();

        setQuery(undefined);
    };

    const handleItemClick = (item: SearchItem, redirect = true) => {
        track({
            name: EventName.SEARCH_RESULT_CLICKED,
            properties: {
                type: item.type,
                id: getSearchResultId(item.item),
            },
        });
        // Settings pages always navigate in place, never a new tab.
        if (redirect && item.type !== SearchItemType.SETTINGS) {
            window.open(
                item.location.pathname + (item.location.search || ''),
                '_blank',
            );
            return;
        }

        closeOmnibar();

        track({
            name: EventName.GLOBAL_SEARCH_CLOSED,
            properties: {
                action: 'result_click',
            },
        });

        void navigate(item.location);
        if (
            (item.location.pathname.includes('/tables/') &&
                location.pathname.includes('/tables/')) ||
            (item.location.pathname.includes('/saved/') &&
                location.pathname.includes('/saved/'))
        ) {
            void navigate(0); // force page refresh so explore page can pick up the new url params
        }
        setQuery(undefined);
    };

    const hasEnteredQuery = query !== undefined && query !== '';
    const hasEnteredMinQueryLength =
        hasEnteredQuery && hasMinQueryLength(query);
    const hasActiveFilters = Boolean(
        searchFilters?.type ||
        searchFilters?.fromDate ||
        searchFilters?.toDate ||
        searchFilters?.createdByUuid,
    );

    const searchGroups = useMemo<OmnibarGroup[]>(() => {
        const contentGroups = searchResults
            ? getSearchResultsGroupsSorted(searchResults)
            : [];

        const showSettings =
            settingsItems.length > 0 &&
            (!searchFilters?.type ||
                searchFilters.type === SearchItemType.SETTINGS);

        const entries = showSettings
            ? [
                  ...contentGroups,
                  [SearchItemType.SETTINGS, settingsItems] as [
                      SearchItemType,
                      SearchItem[],
                  ],
              ]
            : contentGroups;

        return entries.map(([type, items]) => ({
            key: type,
            label: getSearchItemLabel(type),
            items,
            totalCount: items.length,
            collapsed: false,
        }));
    }, [searchResults, settingsItems, searchFilters?.type]);

    const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<string[]>([]);

    const handleToggleGroup = (key: string) => {
        setCollapsedGroupKeys((keys) =>
            keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
        );
    };

    const displayGroups = useMemo<OmnibarGroup[]>(() => {
        const groups =
            !hasEnteredQuery || !hasEnteredMinQueryLength || !searchResults
                ? []
                : searchGroups;

        return groups.map((group) =>
            collapsedGroupKeys.includes(group.key)
                ? { ...group, items: [], collapsed: true }
                : group,
        );
    }, [
        hasEnteredQuery,
        hasEnteredMinQueryLength,
        searchResults,
        searchGroups,
        collapsedGroupKeys,
    ]);

    useEffect(() => {
        setFocusedItemIndex(undefined);
    }, [query, searchFilters]);

    // Default to the first row so Enter works immediately and the preview
    // panel always has content; clamp stale indices after the groups change.
    // 'input' means the user arrowed back to the search field — no highlight.
    const firstNavigableGroupIndex = displayGroups.findIndex(
        (group) => group.items.length > 0,
    );

    const highlightedIndex = useMemo<FocusedItemIndex | undefined>(() => {
        if (firstNavigableGroupIndex === -1) return undefined;
        if (focusedItemIndex === 'input') return undefined;
        if (
            focusedItemIndex &&
            displayGroups[focusedItemIndex.groupIndex]?.items[
                focusedItemIndex.itemIndex
            ]
        ) {
            return focusedItemIndex;
        }
        return { groupIndex: firstNavigableGroupIndex, itemIndex: 0 };
    }, [focusedItemIndex, displayGroups, firstNavigableGroupIndex]);

    // The preview keeps showing the top hit even when nothing is highlighted,
    // and Enter opens it — the pane never goes dead.
    const focusedItem = highlightedIndex
        ? displayGroups[highlightedIndex.groupIndex]?.items[
              highlightedIndex.itemIndex
          ]
        : firstNavigableGroupIndex !== -1
          ? displayGroups[firstNavigableGroupIndex]?.items[0]
          : undefined;

    return (
        <OmnibarKeyboardNav
            groupedItems={displayGroups}
            onEnterPressed={handleItemClick}
            onFocusedItemChange={(index) =>
                setFocusedItemIndex(index ?? 'input')
            }
            currentFocusedItemIndex={highlightedIndex}
            fallbackEnterItem={focusedItem}
        >
            <Transition
                mounted={!isOmnibarOpen}
                transition="fade"
                duration={400}
                timingFunction="ease"
            >
                {(style) => (
                    <OmnibarTarget
                        placeholder={`Search ${
                            projectData?.name ?? 'your project'
                        }`}
                        style={style}
                        onOpen={handleOmnibarOpenInputClick}
                    />
                )}
            </Transition>

            {/* The navbar renders inside a forced-dark provider, but this
                modal portals onto the page — re-anchor the subtree to the
                app's real color scheme so JS-resolved component colors match
                the page instead of the navbar. */}
            <Mantine8Provider withCssVariables={false}>
                <Modal
                    withCloseButton={false}
                    size={rem(960)}
                    closeOnClickOutside
                    closeOnEscape
                    radius="lg"
                    opened={isOmnibarOpen}
                    onClose={handleOmnibarClose}
                    yOffset={100}
                    classNames={{
                        content: classes.modalContent,
                        body: classes.modalBody,
                    }}
                >
                    <Stack gap={0} className={classes.stack}>
                        <Group
                            gap="sm"
                            wrap="nowrap"
                            className={classes.inputRow}
                        >
                            {isFetching ? (
                                <Loader size="xs" color="ldGray.5" />
                            ) : (
                                <MantineIcon
                                    icon={IconSearch}
                                    size="lg"
                                    color="ldGray.6"
                                />
                            )}
                            <TextInput
                                variant="unstyled"
                                size="md"
                                data-autofocus
                                flex={1}
                                placeholder={`Search ${
                                    projectData?.name ?? 'in your project'
                                }...`}
                                classNames={{
                                    input: classes.input,
                                }}
                                value={query ?? ''}
                                onChange={(
                                    e: React.ChangeEvent<HTMLInputElement>,
                                ) => setQuery(e.currentTarget.value)}
                            />
                            {query ? (
                                <ActionIcon
                                    variant="subtle"
                                    size="sm"
                                    color="gray"
                                    onClick={() => setQuery('')}
                                >
                                    <MantineIcon icon={IconX} size="md" />
                                </ActionIcon>
                            ) : null}
                        </Group>

                        <OmnibarFilters
                            filters={searchFilters}
                            onSearchFilterChange={(filters) => {
                                setSearchFilters(filters);
                            }}
                        />

                        <Box className={classes.resultsArea}>
                            {displayGroups.length === 0 ? (
                                !hasEnteredQuery && hasActiveFilters ? (
                                    <OmnibarEmptyState
                                        title="Search with these filters"
                                        hint="Start typing to apply them."
                                    />
                                ) : !hasEnteredQuery ? (
                                    <OmnibarEmptyState
                                        title={`Search ${
                                            projectData?.name ?? 'your project'
                                        }`}
                                        hint="Find dashboards, charts, spaces, tables, fields and more."
                                    />
                                ) : !hasEnteredMinQueryLength ? (
                                    <OmnibarEmptyState
                                        title="Keep typing..."
                                        hint="Search kicks in at 3 characters."
                                    />
                                ) : !searchResults ? (
                                    <OmnibarEmptyState
                                        variant="loading"
                                        title="Searching..."
                                    />
                                ) : (
                                    <OmnibarEmptyState
                                        variant="no-results"
                                        title={`No results for "${query}"`}
                                        hint="Try a different term, or adjust the filters."
                                    />
                                )
                            ) : (
                                <Group
                                    gap={0}
                                    wrap="nowrap"
                                    align="stretch"
                                    className={classes.resultsRow}
                                >
                                    <Box className={classes.listCol}>
                                        <OmnibarItemGroups
                                            projectUuid={projectUuid}
                                            canUserManageValidation={
                                                canUserManageValidation
                                            }
                                            onClick={handleItemClick}
                                            focusedItemIndex={highlightedIndex}
                                            onFocusedItemChange={
                                                setFocusedItemIndex
                                            }
                                            onToggleGroup={handleToggleGroup}
                                            groups={displayGroups}
                                            scrollRef={scrollRef}
                                        />
                                    </Box>
                                    <OmnibarPreview
                                        item={focusedItem}
                                        spaceName={
                                            focusedItem?.item &&
                                            'spaceUuid' in focusedItem.item &&
                                            focusedItem.item.spaceUuid
                                                ? spaceNamesByUuid.get(
                                                      focusedItem.item
                                                          .spaceUuid,
                                                  )
                                                : undefined
                                        }
                                    />
                                </Group>
                            )}
                        </Box>

                        <Group
                            className={classes.footer}
                            gap="lg"
                            justify="space-between"
                            wrap="nowrap"
                        >
                            <Group gap="lg" wrap="nowrap">
                                <Group gap="xxs">
                                    <Kbd size="xs">↑</Kbd>
                                    <Kbd size="xs">↓</Kbd>
                                    <Text size="xs" c="dimmed">
                                        Navigate
                                    </Text>
                                </Group>
                                <Group gap="xxs">
                                    <Kbd size="xs">↵</Kbd>
                                    <Text size="xs" c="dimmed">
                                        Open
                                    </Text>
                                </Group>
                                <Group gap="xxs">
                                    <Kbd size="xs">esc</Kbd>
                                    <Text size="xs" c="dimmed">
                                        Close
                                    </Text>
                                </Group>
                            </Group>

                            <Group gap="two" wrap="nowrap">
                                {isAiAgentsEnabled && (
                                    <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        color="gray"
                                        leftSection={<AiAgentIcon size={14} />}
                                        onClick={() =>
                                            handleQuickAction(
                                                `/projects/${projectUuid}/ai-agents`,
                                            )
                                        }
                                    >
                                        Ask AI
                                    </Button>
                                )}
                                {canManageExplore && (
                                    <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        color="gray"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconTable}
                                                strokeWidth={1.5}
                                            />
                                        }
                                        onClick={() =>
                                            handleQuickAction(
                                                `/projects/${projectUuid}/tables`,
                                            )
                                        }
                                    >
                                        Run query
                                    </Button>
                                )}
                                {canManageProject && (
                                    <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        color="gray"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconSettings}
                                                strokeWidth={1.5}
                                            />
                                        }
                                        onClick={() =>
                                            handleQuickAction(
                                                `/generalSettings/projectManagement/${projectUuid}/settings`,
                                            )
                                        }
                                    >
                                        Settings
                                    </Button>
                                )}
                            </Group>
                        </Group>
                    </Stack>
                </Modal>
            </Mantine8Provider>
        </OmnibarKeyboardNav>
    );
};

export default Omnibar;
