import { Group, Paper, Stack, Text } from '@mantine-8/core';
import { IconLock, IconUsersGroup } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../MantineIcon';
import { InheritanceType } from './ShareSpaceModalUtils';

type InheritanceToggleCardsProps = {
    value: InheritanceType;
    onChange: (value: InheritanceType) => void;
    disabled?: boolean;
};

const InheritanceToggleCards: FC<InheritanceToggleCardsProps> = ({
    value,
    onChange,
    disabled,
}) => {
    return (
        <Group grow align="stretch">
            <Paper
                withBorder
                p="md"
                radius="md"
                style={{
                    cursor: disabled ? 'default' : 'pointer',
                    borderColor:
                        value === InheritanceType.INHERIT
                            ? 'var(--mantine-color-blue-6)'
                            : undefined,
                    borderWidth:
                        value === InheritanceType.INHERIT ? 2 : undefined,
                }}
                onClick={
                    disabled
                        ? undefined
                        : () => onChange(InheritanceType.INHERIT)
                }
            >
                <Stack align="center" gap="xs">
                    <MantineIcon
                        icon={IconUsersGroup}
                        color="blue.6"
                        size="xl"
                    />
                    <Text fz="sm" fw={600} ta="center">
                        Shared
                    </Text>
                    <Text fz="xs" c="dimmed" ta="center">
                        Project members can access this space
                    </Text>
                </Stack>
            </Paper>

            <Paper
                withBorder
                p="md"
                radius="md"
                style={{
                    cursor: disabled ? 'default' : 'pointer',
                    borderColor:
                        value === InheritanceType.OWN_ONLY
                            ? 'var(--mantine-color-blue-6)'
                            : undefined,
                    borderWidth:
                        value === InheritanceType.OWN_ONLY ? 2 : undefined,
                }}
                onClick={
                    disabled
                        ? undefined
                        : () => onChange(InheritanceType.OWN_ONLY)
                }
            >
                <Stack align="center" gap="xs">
                    <MantineIcon icon={IconLock} color="blue.6" size="xl" />
                    <Text fz="sm" fw={600} ta="center">
                        Private
                    </Text>
                    <Text fz="xs" c="dimmed" ta="center">
                        Only invited members and admins can access this space
                    </Text>
                </Stack>
            </Paper>
        </Group>
    );
};

export default InheritanceToggleCards;
