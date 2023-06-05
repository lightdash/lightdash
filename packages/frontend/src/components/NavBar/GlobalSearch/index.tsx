import { getSearchResultId } from '@lightdash/common';
import {
    Anchor,
    Box,
    createStyles,
    Group,
    Highlight,
    Kbd,
    Loader,
    MantineProvider,
    Stack,
    Text,
    TextInput,
    UnstyledButton,
} from '@mantine/core';
import { useHotkeys, useOs } from '@mantine/hooks';
import {
    spotlight,
    SpotlightAction,
    SpotlightActionProps,
    SpotlightProvider,
} from '@mantine/spotlight';
import { IconAlertTriangle, IconSearch } from '@tabler/icons-react';
import { FC, MouseEventHandler, useMemo, useState } from 'react';
import { Link, useHistory, useLocation } from 'react-router-dom';

import { GLOBAL_SEARCH_MIN_QUERY_LENGTH } from '../../../hooks/globalSearch/useGlobalSearch';
import { useProject } from '../../../hooks/useProject';
import { useValidationUserAbility } from '../../../hooks/validation/useValidation';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import { ResourceIndicator } from '../../common/ResourceIcon';
import { SearchItem, useDebouncedSearch } from './hooks';
import { SearchIcon } from './SearchIcon';

const SearchIconWithIndicator: FC<{
    searchResult: SearchItem;
    projectUuid: string;
    canUserManageValidation: boolean;
}> = ({ searchResult, projectUuid, canUserManageValidation }) => {
    if (
        (searchResult.type === 'saved_chart' ||
            searchResult.type === 'dashboard') &&
        searchResult.item &&
        'validationErrors' in searchResult.item
    ) {
        return (
            <ResourceIndicator
                iconProps={{
                    fill: 'red',
                    icon: IconAlertTriangle,
                }}
                tooltipProps={{
                    maw: 300,
                    withinPortal: true,
                    multiline: true,
                    offset: -2,
                    position: 'bottom',
                    // TODO: investigate how to do this better
                    zIndex: 201,
                }}
                tooltipLabel={
                    canUserManageValidation ? (
                        <>
                            This content is broken. Learn more about the
                            validation error(s){' '}
                            <Anchor
                                component={Link}
                                fw={600}
                                onClick={(e) => e.stopPropagation()}
                                to={{
                                    pathname: `/generalSettings/projectManagement/${projectUuid}/validator`,
                                    search: `?validationId=${searchResult.item.validationErrors[0].validationId}`,
                                }}
                                color="blue.4"
                            >
                                here
                            </Anchor>
                            .
                        </>
                    ) : (
                        <>
                            There's an error with this
                            {/* TODO: allow for table errors */}
                            {searchResult.type === 'saved_chart'
                                ? 'chart'
                                : 'dashboard'}
                            .
                        </>
                    )
                }
            >
                <SearchIcon searchItem={searchResult} />
            </ResourceIndicator>
        );
    }

    return null;
};

const useStyles = createStyles<string, null>((theme) => ({
    action: {
        width: '100%',
        padding: `${theme.spacing.xs} ${theme.spacing.md}`,
        borderRadius: theme.radius.sm,
        '&[data-hovered]': {
            backgroundColor: theme.colors.gray[0],
        },
        '&:hover': {
            backgroundColor: theme.colors.gray[1],
        },
        '&:active': {
            backgroundColor: theme.colors.gray[2],
        },
    },
}));

const SpotlightItem: FC<SpotlightActionProps> = ({
    action,
    styles,
    classNames,
    hovered,
    onTrigger,
    query,
    radius,
    highlightColor,
    highlightQuery,
}) => {
    const { classes } = useStyles(null, {
        styles,
        classNames,
        name: 'SpotlightItem',
    });

    const item = action.item as SearchItem;

    return (
        <UnstyledButton
            role="menuitem"
            className={classes.action}
            data-hovered={hovered || undefined}
            tabIndex={-1}
            onClick={onTrigger}
            sx={{ radius }}
        >
            <Group noWrap>
                <Box sx={{ flexShrink: 0 }}>{action.icon}</Box>

                {/* FIXME: uses hardcode width to fix text truncation */}
                <Stack spacing="xxs" sx={{ flexGrow: 1, maxWidth: 530 }}>
                    <Text>
                        <span>{item.prefix}</span>

                        <Highlight
                            component="span"
                            fw={500}
                            highlight={highlightQuery ? query : ''}
                            highlightColor={highlightColor}
                            truncate
                        >
                            {action.title}
                        </Highlight>
                    </Text>

                    {item.description || item.typeLabel ? (
                        <Text color="dimmed" size="sm" truncate>
                            <Text component="span" fw={500}>
                                {item.typeLabel}
                            </Text>

                            {item.description && item.typeLabel ? (
                                <Text component="span"> · </Text>
                            ) : null}

                            {action.description ? (
                                <Highlight
                                    component="span"
                                    highlight={highlightQuery ? query : ''}
                                    highlightColor={highlightColor}
                                >
                                    {action.description}
                                </Highlight>
                            ) : null}
                        </Text>
                    ) : null}
                </Stack>
            </Group>
        </UnstyledButton>
    );
};

interface GlobalSearchProps {
    projectUuid: string;
}

const GlobalSearch: FC<GlobalSearchProps> = ({ projectUuid }) => {
    const history = useHistory();
    const location = useLocation();
    const { track } = useTracking();
    const project = useProject(projectUuid);

    const canUserManageValidation = useValidationUserAbility(projectUuid);

    const [query, setQuery] = useState<string>();

    const handleSpotlightOpenInputClick: MouseEventHandler<HTMLInputElement> = (
        e,
    ) => {
        e.currentTarget.blur();

        track({
            name: EventName.GLOBAL_SEARCH_OPEN,
            properties: {
                action: 'input_click',
            },
        });
        spotlight.open();
    };

    const handleSpotlightOpenHotkey = () => {
        track({
            name: EventName.GLOBAL_SEARCH_OPEN,
            properties: {
                action: 'hotkeys',
            },
        });
        spotlight.open();
    };

    useHotkeys([
        ['mod + k', () => handleSpotlightOpenHotkey, { preventDefault: true }],
    ]);

    const { items, isSearching } = useDebouncedSearch(projectUuid, query);

    const searchItems = useMemo(() => {
        return items.map<SpotlightAction>((item) => {
            const isSearchItemWithValidationError =
                ['dashboard', 'saved_chart'].includes(item.type) &&
                item.item &&
                'validationErrors' in item.item &&
                item.item?.validationErrors?.length > 0;

            return {
                item,
                icon: isSearchItemWithValidationError ? (
                    <SearchIconWithIndicator
                        searchResult={item}
                        projectUuid={projectUuid}
                        canUserManageValidation={canUserManageValidation}
                    />
                ) : (
                    <SearchIcon searchItem={item} />
                ),
                title: item.title,
                description: item.description,
                onTrigger: () => {
                    track({
                        name: EventName.SEARCH_RESULT_CLICKED,
                        properties: {
                            type: item.type,
                            id: getSearchResultId(item.item),
                        },
                    });
                    track({
                        name: EventName.GLOBAL_SEARCH_CLOSED,
                        properties: {
                            action: 'result_click',
                        },
                    });

                    history.push(item.location);
                    if (
                        (item.location.pathname.includes('/tables/') &&
                            location.pathname.includes('/tables/')) ||
                        (item.location.pathname.includes('/saved/') &&
                            location.pathname.includes('/saved/'))
                    ) {
                        history.go(0); // force page refresh so explore page can pick up the new url params
                    }
                },
            };
        });
    }, [
        items,
        projectUuid,
        canUserManageValidation,
        track,
        history,
        location.pathname,
    ]);

    const os = useOs();

    return (
        <>
            <TextInput
                role="search"
                size="xs"
                w={250}
                placeholder="Search..."
                icon={<MantineIcon icon={IconSearch} color="gray.1" />}
                rightSection={
                    <Group mr="xs" spacing="xxs">
                        <Kbd fw={600}>
                            {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                        </Kbd>

                        <Text color="dimmed" fw={600}>
                            +
                        </Text>

                        <Kbd fw={600}>k</Kbd>
                    </Group>
                }
                rightSectionWidth="auto"
                onClick={handleSpotlightOpenInputClick}
            />

            <MantineProvider inherit theme={{ colorScheme: 'light' }}>
                <SpotlightProvider
                    withinPortal
                    zIndex={200}
                    actions={
                        query && query.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH
                            ? searchItems
                            : []
                    }
                    highlightQuery
                    searchIcon={
                        isSearching ? (
                            <Loader size="xs" color="gray" />
                        ) : (
                            <MantineIcon icon={IconSearch} size="lg" />
                        )
                    }
                    actionComponent={SpotlightItem}
                    closeOnActionTrigger
                    cleanQueryOnClose
                    searchPlaceholder={`Search ${project.data?.name}...`}
                    onQueryChange={setQuery}
                    limit={Number.POSITIVE_INFINITY}
                    nothingFoundMessage={
                        !query
                            ? 'Start typing to search everything in the project'
                            : query.length < 3
                            ? 'Keep typing to search everything in the project'
                            : isSearching
                            ? 'Searching...'
                            : 'No results.'
                    }
                    onSpotlightClose={() => {
                        track({
                            name: EventName.GLOBAL_SEARCH_CLOSED,
                            properties: {
                                action: 'default',
                            },
                        });
                    }}
                />
            </MantineProvider>
        </>
    );
};

export default GlobalSearch;
