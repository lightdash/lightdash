import { Paper, Skeleton, Stack } from '@mantine/core';
import { type FC } from 'react';
import { useAppSelector } from '../../store/hooks';
import { HeaderEdit } from './HeaderEdit';

export const Header: FC<{
    mode: 'edit';
}> = () => {
    const isChartLoaded = useAppSelector(
        (state) => !!state.sqlRunner.savedChart,
    );

    if (isChartLoaded) {
        return <HeaderEdit />;
    }

    return (
        <Paper radius={0} px="md" py="xs" withBorder={false}>
            <Stack gap="xs">
                <Skeleton height={20} width={'15%'} radius="sm" />
                <Skeleton height={10} width={'20%'} radius="sm" />
            </Stack>
        </Paper>
    );
};
