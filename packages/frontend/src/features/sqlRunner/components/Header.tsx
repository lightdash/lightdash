import { ActionIcon, Group, Paper, Title, Tooltip } from '@mantine/core';
import { IconDeviceFloppy, IconLink } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {};

export const Header: FC<Props> = ({}) => {
    return (
        <Paper shadow="none" radius={0} px="md" py="sm" withBorder>
            <Group position="apart">
                <Title order={2} c="gray.6">
                    Untitled SQL Query
                </Title>
                <Group spacing="md">
                    <Tooltip variant="xs" label="Save chart" position="bottom">
                        <ActionIcon size="xs">
                            <MantineIcon icon={IconDeviceFloppy} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip variant="xs" label="Share URL" position="bottom">
                        <ActionIcon size="xs">
                            <MantineIcon icon={IconLink} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>
        </Paper>
    );
};
