import { Group, Text } from '@mantine/core';
import { type Icon as TablerIconType } from '@tabler/icons-react';
import { forwardRef, type PropsWithChildren } from 'react';
import MantineIcon from '../MantineIcon';

type Props = {
    icon: TablerIconType;
};

const InfoContainer = forwardRef<HTMLDivElement, PropsWithChildren<Props>>(
    ({ children, icon }, ref) => {
        return (
            <Group spacing="xs" ref={ref} noWrap>
                <MantineIcon icon={icon} color="ldGray.6" />

                <Text fz="xs" style={{ flexGrow: 1 }} color="ldGray.6">
                    {children}
                </Text>
            </Group>
        );
    },
);

export default InfoContainer;
