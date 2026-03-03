import {
    Button,
    Group,
    TextInput,
    useMantineTheme,
    type GroupProps,
} from '@mantine-8/core';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

type UserAttributesTopToolbarProps = GroupProps & {
    onAddClick: () => void;
    searchQuery: string;
    onSearchChange: (value: string) => void;
};

export const UserAttributesTopToolbar: FC<UserAttributesTopToolbarProps> = memo(
    ({ onAddClick, searchQuery, onSearchChange, ...props }) => {
        const theme = useMantineTheme();

        return (
            <Group
                justify="space-between"
                p={`${theme.spacing.sm} ${theme.spacing.md}`}
                wrap="nowrap"
                {...props}
            >
                <TextInput
                    placeholder="Search attributes..."
                    leftSection={<MantineIcon icon={IconSearch} />}
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.currentTarget.value)}
                    size="xs"
                    w={240}
                />

                <Button
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={onAddClick}
                    style={{ flexShrink: 0 }}
                >
                    Add new attribute
                </Button>
            </Group>
        );
    },
);

UserAttributesTopToolbar.displayName = 'UserAttributesTopToolbar';
