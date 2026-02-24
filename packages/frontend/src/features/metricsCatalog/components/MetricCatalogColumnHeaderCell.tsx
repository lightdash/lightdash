import { Group, Text, Tooltip } from '@mantine-8/core';
import { type FC, type SVGProps } from 'react';
import styles from './MetricCatalogColumnHeaderCell.module.css';

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
            <Group gap={6} mr={6} h="100%" wrap="nowrap">
                <Icon />
                <Text
                    fz="xs"
                    fw={600}
                    c="ldGray.7"
                    className={styles.noSelect}
                >
                    {children}
                </Text>
            </Group>
        </Tooltip>
    );
};
