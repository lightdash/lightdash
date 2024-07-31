import { Paper, Skeleton, Stack } from '@mantine/core';
import { type FC } from 'react';
import { useAppSelector } from '../../store/hooks';
import { HeaderCreate } from './HeaderCreate';
import { HeaderEdit } from './HeaderEdit';
import { HeaderView } from './HeaderView';

export const Header: FC<{ mode: 'create' | 'view' | 'edit' }> = ({ mode }) => {
    const isChartLoaded = useAppSelector(
        (state) => !!state.sqlRunner.savedSqlChart?.savedSqlUuid,
    );

    if (mode === 'create') {
        return <HeaderCreate />;
    }

    if (isChartLoaded) {
        if (mode === 'view') {
            return <HeaderView />;
        }
        if (mode === 'edit') {
            return <HeaderEdit />;
        }
    }

    return (
        <Paper shadow="none" radius={0} px="md" py="xs" withBorder>
            <Stack spacing="xs">
                <Skeleton height={20} width={'15%'} radius="sm" />
                <Skeleton height={10} width={'20%'} radius="sm" />
            </Stack>
        </Paper>
    );
};
