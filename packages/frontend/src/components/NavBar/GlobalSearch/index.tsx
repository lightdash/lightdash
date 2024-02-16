import { getSearchResultId } from '@lightdash/common';
import {
    Accordion,
    Box,
    createStyles,
    Group,
    Input,
    Kbd,
    Loader,
    MantineProvider,
    Modal,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useDisclosure, useHotkeys, useOs } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import capitalize from 'lodash/capitalize';
import { FC, MouseEventHandler, useMemo, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { GLOBAL_SEARCH_MIN_QUERY_LENGTH } from '../../../hooks/globalSearch/useGlobalSearch';
import { useProject } from '../../../hooks/useProject';
import { useValidationUserAbility } from '../../../hooks/validation/useValidation';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import { SearchItem, useDebouncedSearch } from './hooks';
import { SearchIcon, SearchIconWithIndicator } from './SearchIcon';

const itemHasValidationError = (searchItem: SearchItem) =>
    searchItem.item &&
    ['dashboard', 'saved_chart', 'table'].includes(searchItem.type) &&
    'validationErrors' in searchItem.item &&
    searchItem.item.validationErrors?.length > 0;

const useStyles = createStyles<string, null>((theme) => ({
    action: {
        display: 'flex',
        alignItems: 'center',
        height: theme.spacing['4xl'],
        paddingLeft: theme.spacing.xs,
        paddingRight: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        '&[data-hovered]': {
            backgroundColor: theme.colors.blue[6],
        },
        '&:hover': {
            backgroundColor: theme.colors.blue[3],
        },
        '&:active': {
            backgroundColor: theme.colors.blue[4],
        },
    },
    item: {},
}));

// FIX: TYPES
const SpotlightItem: FC<any> = ({
    action,
    styles,
    classNames,
    hovered,
    onTrigger,
    radius,
}) => {
    const { classes } = useStyles(null, {
        styles,
        classNames,
        name: 'SpotlightItem',
    });

    const item = action.item as SearchItem;

    return (
        <Group
            role="menuitem"
            data-hovered={hovered || undefined}
            className={classes.action}
            tabIndex={-1}
            onClick={onTrigger}
            sx={{ radius }}
            spacing="sm"
            noWrap
        >
            <Box style={{ flexShrink: 0 }}>{action.icon}</Box>

            <Stack
                spacing="two"
                style={{ flexGrow: 1, overflow: 'hidden' }}
                maw="100%"
            >
                <Text fw={500} size="sm" truncate>
                    {item.prefix} {action.title}
                </Text>

                {item.description ? (
                    <Text size="xs" truncate>
                        {action.description}
                    </Text>
                ) : null}
            </Stack>
        </Group>
    );
};

type Props = {
    items: SearchItem[];
    projectUuid: string;
    canUserManageValidation: boolean;
};

type GroupedItems = Partial<Record<SearchItem['type'], SearchItem[]>>;

const OmnibarItemGroups: FC<Props> = ({
    projectUuid,
    items,
    canUserManageValidation,
}) => {
    const groupedTypes = useMemo(() => {
        return items.reduce<GroupedItems>((acc, item) => {
            return { ...acc, [item.type]: (acc[item.type] ?? []).concat(item) };
        }, {});
    }, [items]);

    return (
        <Accordion
            multiple
            defaultValue={Object.keys(groupedTypes)}
            styles={(theme) => ({
                control: {
                    height: theme.spacing.xl,
                    paddingLeft: theme.spacing.sm,
                    paddingRight: theme.spacing.sm,
                },
                label: {
                    paddingTop: 0,
                    paddingBottom: 0,
                },
                content: {
                    paddingTop: theme.spacing.xxs,
                    paddingBottom: theme.spacing.xxs,
                    paddingLeft: theme.spacing.xxs,
                    paddingRight: theme.spacing.xxs,
                },
            })}
        >
            {Object.entries(groupedTypes).map(([type, groupedItems]) => (
                <Accordion.Item key={type} value={type}>
                    <Accordion.Control>
                        <Text color="dark" fw={500} fz="xs">
                            {capitalize(type)}s
                        </Text>
                    </Accordion.Control>

                    <Accordion.Panel>
                        {groupedItems.map((item) => (
                            <SpotlightItem
                                key={item.location.pathname}
                                action={{
                                    icon: itemHasValidationError(item) ? (
                                        <SearchIconWithIndicator
                                            item={item}
                                            projectUuid={projectUuid}
                                            canUserManageValidation={
                                                canUserManageValidation
                                            }
                                        />
                                    ) : (
                                        <SearchIcon item={item} />
                                    ),
                                    title: item.title,
                                    description: item.description,
                                    item,
                                }}
                                radius="sm"
                                onTrigger={() => {}}
                            />
                        ))}
                    </Accordion.Panel>
                </Accordion.Item>
            ))}
        </Accordion>
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

    const [isOmnibarOpen, { open: openOmnibar, close: closeOmnibar }] =
        useDisclosure(false);

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

        openOmnibar();
    };

    const handleSpotlightOpenHotkey = () => {
        track({
            name: EventName.GLOBAL_SEARCH_OPEN,
            properties: {
                action: 'hotkeys',
            },
        });

        openOmnibar();
    };

    const handleSpotlightClose = () => {
        track({
            name: EventName.GLOBAL_SEARCH_CLOSED,
            properties: {
                action: 'default',
            },
        });

        closeOmnibar();
    };

    const handleItemClick = (item: SearchItem) => {
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
    };

    useHotkeys([
        ['mod + k', () => handleSpotlightOpenHotkey, { preventDefault: true }],
    ]);

    const { items, isSearching } = useDebouncedSearch(projectUuid, query);

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
                <Modal
                    size="xl"
                    withCloseButton={false}
                    closeOnClickOutside
                    closeOnEscape
                    opened={isOmnibarOpen}
                    onClose={handleSpotlightClose}
                    styles={{
                        body: {
                            padding: 0,
                        },
                    }}
                >
                    {/* temporary spacing value before we introduce filtering section */}
                    <Stack spacing={0}>
                        <Input
                            size="xl"
                            icon={
                                isSearching ? (
                                    <Loader size="xs" color="gray" />
                                ) : (
                                    <MantineIcon icon={IconSearch} size="lg" />
                                )
                            }
                            styles={{
                                input: {
                                    borderTop: 0,
                                    borderRight: 0,
                                    borderLeft: 0,
                                    borderBottomLeftRadius: 0,
                                    borderBottomRightRadius: 0,
                                },
                            }}
                            value={query}
                            onChange={(e) => setQuery(e.currentTarget.value)}
                        />

                        <OmnibarItemGroups
                            items={items}
                            projectUuid={projectUuid}
                            canUserManageValidation={canUserManageValidation}
                            // onClick={handleItemClick}
                        />
                    </Stack>
                </Modal>
            </MantineProvider>
        </>
    );
};

export default GlobalSearch;
