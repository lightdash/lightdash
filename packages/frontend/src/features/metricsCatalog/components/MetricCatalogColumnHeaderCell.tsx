import { Group, Text, Tooltip } from '@mantine/core';
import { type FC, type SVGProps } from 'react';

export const MetricCatalogColumnHeaderCell = ({
    children,
    Icon,
    tooltipLabel,
}: {
    children: React.ReactNode;
    tooltipLabel?: string;
    Icon: FC<SVGProps<SVGSVGElement>>;
}) => {
    return (
        <Tooltip
            variant="xs"
            label={tooltipLabel}
            disabled={!tooltipLabel}
            openDelay={200}
            maw={250}
            fz="xs"
        >
            <Group spacing={6} mr={6} h="100%" noWrap>
                <Icon />
                <Text
                    fz="xs"
                    fw={600}
                    color="ldGray.7"
                    sx={{
                        userSelect: 'none',
                    }}
                >
                    {children}
                </Text>
            </Group>
        </Tooltip>
    );
};
