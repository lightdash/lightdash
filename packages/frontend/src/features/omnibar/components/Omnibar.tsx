import { getSearchResultId } from '@lightdash/common';
import {
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
import { FC, MouseEventHandler, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useValidationUserAbility } from '../../../hooks/validation/useValidation';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import { useDebouncedSearch } from '../hooks/useDebouncedSearch';
import { OMNIBAR_MIN_QUERY_LENGTH } from '../hooks/useSearch';
import { SearchItem } from '../types/searchItem';
import OmnibarEmptyState from './OmnibarEmptyState';
import OmnibarItemGroups from './OmnibarItemGroups';

interface Props {
    projectUuid: string;
}

const Omnibar: FC<Props> = ({ projectUuid }) => {
    const history = useHistory();
    const location = useLocation();
    const { track } = useTracking();

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
        closeOmnibar();

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

    const { items, isFetching } = useDebouncedSearch(projectUuid, query);

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
                    yOffset={100}
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
                                isFetching ? (
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

                        {query === undefined || query === '' ? (
                            <OmnibarEmptyState message="Start typing to search for everything in your project." />
                        ) : query.length < OMNIBAR_MIN_QUERY_LENGTH ? (
                            <OmnibarEmptyState message="Keep typing to search for everything in your project." />
                        ) : isFetching ? (
                            <OmnibarEmptyState message="Searching..." />
                        ) : items.length === 0 ? (
                            <OmnibarEmptyState message="No results found." />
                        ) : (
                            <OmnibarItemGroups
                                items={items}
                                projectUuid={projectUuid}
                                canUserManageValidation={
                                    canUserManageValidation
                                }
                                onClick={handleItemClick}
                            />
                        )}
                    </Stack>
                </Modal>
            </MantineProvider>
        </>
    );
};

export default Omnibar;
