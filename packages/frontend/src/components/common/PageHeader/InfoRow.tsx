import { Group, Text } from '@mantine/core';
import { type Icon as TablerIconType } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../MantineIcon';

type InfoRowProps = {
    icon: TablerIconType;
    label: string;
    children: ReactNode;
};

const InfoRow: FC<InfoRowProps> = ({ icon: Icon, label, children }) => {
    return (
        <Group justify="space-between" wrap="nowrap">
            <Group gap={6} wrap="nowrap">
                <MantineIcon icon={Icon} color="dimmed" size={14} />
                <Text fz="xs" c="dimmed">
                    {label}
                </Text>
            </Group>
            <Text fz="xs" fw={500}>
                {children}
            </Text>
        </Group>
    );
};

export default InfoRow;
