import {
    ActionIcon,
    Group,
    TextInput,
    Tooltip,
    useMantineTheme,
    type GroupProps,
} from '@mantine-8/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

type GroupsTopToolbarProps = GroupProps & {
    search: string;
    setSearch: (value: string) => void;
};

export const GroupsTopToolbar: FC<GroupsTopToolbarProps> = memo(
    ({ search, setSearch, ...props }) => {
        const theme = useMantineTheme();

        return (
            <Group
                p={`${theme.spacing.sm} ${theme.spacing.md}`}
                wrap="nowrap"
                {...props}
            >
                <Tooltip
                    withinPortal
                    label="Search by name, members or member email"
                >
                    <TextInput
                        size="xs"
                        radius="md"
                        type="search"
                        variant="default"
                        placeholder="Search groups by name, members or member email"
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
                            search ? (
                                <ActionIcon
                                    onClick={() => setSearch('')}
                                    variant="transparent"
                                    size="xs"
                                    color="ldGray.5"
                                >
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            ) : null
                        }
                        miw={350}
                        maw={400}
                    />
                </Tooltip>
            </Group>
        );
    },
);

GroupsTopToolbar.displayName = 'GroupsTopToolbar';
