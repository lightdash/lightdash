import { Group, Text } from '@mantine-8/core';
import { type Icon as TablerIconType } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../MantineIcon';

type InfoRowV2Props = {
    icon: TablerIconType;
    label: string;
    children: ReactNode;
};

const InfoRowV2: FC<InfoRowV2Props> = ({ icon: Icon, label, children }) => {
    return (
        <Group justify="space-between" wrap="nowrap">
            <Group gap={6} wrap="nowrap">
                <MantineIcon icon={Icon} color="ldGray.6" size={14} />
                <Text fz="xs" c="ldGray.6">
                    {label}
                </Text>
            </Group>
            <Text fz="xs" c="ldGray.9" fw={500}>
                {children}
            </Text>
        </Group>
    );
};

export default InfoRowV2;
