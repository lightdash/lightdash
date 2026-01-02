import { ChartKind } from '@lightdash/common';
import {
    Box,
    Center,
    Group,
    Skeleton as MantineSkeleton,
    Stack,
    type SkeletonProps,
} from '@mantine-8/core';
import { clsx } from '@mantine/core';
import { type FC, type ReactElement } from 'react';
import styles from './LoadingSkeletonOverlay.module.css';

interface LoadingSkeletonOverlayProps {
    visible: boolean;
    className?: string;
    hasTitle?: boolean;
    chartKind?: ChartKind | null;
}

const Skeleton: FC<SkeletonProps> = (props) => (
    <MantineSkeleton radius="lg" {...props} className={styles.skeleton} />
);

const BigNumberSkeleton: FC = () => (
    <Center h="100%">
        <Skeleton maw={'80%'} h={'60%'} mah={140} />
    </Center>
);

const TableSkeleton: FC = () => (
    <Stack gap="xs">
        <Skeleton h={40} radius="sm" />
        {Array.from({ length: 10 }).map((_, index) => (
            <Group gap="xs" key={index}>
                <Skeleton h={30} flex={1} radius="sm" />
                <Skeleton h={30} flex={1} radius="sm" />
                <Skeleton h={30} flex={1} radius="sm" />
                <Skeleton h={30} flex={1} radius="sm" />
            </Group>
        ))}
    </Stack>
);

const PieSkeleton: FC = () => (
    <Center h="100%">
        <Box w="100%" maw={'300px'} style={{ aspectRatio: 1 }}>
            <Skeleton h="100%" w="100%" circle />
        </Box>
    </Center>
);

const DefaultSkeleton: FC = () => (
    <Center h="100%">
        <Skeleton h="80%" radius="lg" />
    </Center>
);

const getSkeletonByChartKind = (chartKind: ChartKind): ReactElement => {
    switch (chartKind) {
        case ChartKind.BIG_NUMBER:
            return <BigNumberSkeleton />;
        case ChartKind.TABLE:
            return <TableSkeleton />;
        case ChartKind.PIE:
            return <PieSkeleton />;
        default:
            return <DefaultSkeleton />;
    }
};

const LoadingSkeletonOverlay = ({
    visible,
    className,
    hasTitle,
    chartKind,
}: LoadingSkeletonOverlayProps) => {
    if (!visible) return null;

    return (
        <Stack
            className={clsx(styles.overlay, className)}
            gap="sm"
            style={{ zIndex: 1 }}
        >
            {hasTitle && <Box h={28} style={{ flexShrink: 0 }} />}
            <Box flex={1} mih={0} style={{ overflow: 'hidden' }}>
                {chartKind ? (
                    getSkeletonByChartKind(chartKind)
                ) : (
                    <DefaultSkeleton />
                )}
            </Box>
        </Stack>
    );
};

export default LoadingSkeletonOverlay;
