import {
    ActionIcon,
    Button,
    Group,
    TextInput,
    Tooltip,
    useMantineTheme,
    type GroupProps,
} from '@mantine-8/core';
import { IconPlus, IconSearch, IconX } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

type UsersTopToolbarProps = GroupProps & {
    search: string;
    setSearch: (value: string) => void;
    isFetching: boolean;
    currentResultsCount: number;
    canInvite: boolean;
    onInviteClick: () => void;
};

export const UsersTopToolbar: FC<UsersTopToolbarProps> = memo(
    ({
        search,
        setSearch,
        isFetching,
        currentResultsCount,
        canInvite,
        onInviteClick,
        ...props
    }) => {
        const theme = useMantineTheme();

        return (
            <Group
                justify="space-between"
                p={`${theme.spacing.sm} ${theme.spacing.md}`}
                wrap="nowrap"
                {...props}
            >
                <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <Tooltip
                        withinPortal
                        variant="xs"
                        label="Search by name, email, or role"
                    >
                        <TextInput
                            data-testid="org-users-search-input"
                            size="xs"
                            radius="md"
                            type="search"
                            variant="default"
                            placeholder="Search users by name, email, or role"
                            value={search ?? ''}
                            leftSection={
                                <MantineIcon
                                    size="md"
                                    color="ldGray.6"
                                    icon={IconSearch}
                                />
                            }
                            onChange={(e) => setSearch(e.target.value)}
                            rightSection={
                                search && (
                                    <ActionIcon
                                        onClick={() => setSearch('')}
                                        variant="transparent"
                                        size="xs"
                                        color="ldGray.5"
                                    >
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                )
                            }
                            miw={350}
                            maw={400}
                        />
                    </Tooltip>
                </Group>

                {canInvite && (
                    <Button
                        size="xs"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={onInviteClick}
                        style={{ flexShrink: 0 }}
                    >
                        Add user
                    </Button>
                )}
            </Group>
        );
    },
);

UsersTopToolbar.displayName = 'UsersTopToolbar';
