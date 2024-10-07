import { type VizColumn } from '@lightdash/common';
import { Button, Group, LoadingOverlay, Text } from '@mantine/core';
import { IconTableAlias } from '@tabler/icons-react';
import { type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useSqlQueryRun } from '../../hooks/useSqlQueryRun';
import { useUpdateVirtualView } from '../../hooks/useVirtualView';
import { useAppSelector } from '../../store/hooks';

export const HeaderVirtualView: FC<{
    virtualViewState: { name: string; sql: string };
}> = ({ virtualViewState }) => {
    const history = useHistory();
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const columns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const hasUnrunChanges = useAppSelector(
        (state) => state.sqlRunner.hasUnrunChanges,
    );

    const { mutateAsync: runQuery, isLoading: isRunningQuery } =
        useSqlQueryRun(projectUuid);

    const { mutateAsync: updateVirtualView, isLoading: isUpdatingVirtualView } =
        useUpdateVirtualView(projectUuid);

    const handleUpdateVirtualView = async () => {
        if (!columns) {
            return;
        }

        let columnsFromQuery: VizColumn[] | undefined = columns;

        // Run query to get schema if there are unrun changes - the table schema is not sufficient if the query is generating new columns
        if (hasUnrunChanges) {
            const results = await runQuery({ sql, limit: 1 });
            if (results) {
                columnsFromQuery = results.columns;
            }
        }

        await updateVirtualView({
            projectUuid,
            // TODO: Allow editing name
            name: virtualViewState.name,
            sql,
            columns: columnsFromQuery,
        });

        // Refresh the page to show the new virtual view
        history.go(0);
    };
    return (
        <Group
            p="md"
            py="xs"
            position="apart"
            sx={(theme) => ({
                borderBottom: `1px solid ${theme.colors.gray[3]}`,
            })}
        >
            <LoadingOverlay
                visible={isRunningQuery || isUpdatingVirtualView}
                loaderProps={{
                    variant: 'bars',
                }}
            />
            <Group spacing="xs">
                <Group spacing="xs">
                    <MantineIcon icon={IconTableAlias} />
                    <Text fz="sm" fw={500}>
                        {/* TODO: Allow editing name */}
                        Editing {virtualViewState.name}
                    </Text>
                </Group>
            </Group>

            <Button
                mr="lg"
                size="xs"
                variant="default"
                onClick={handleUpdateVirtualView}
            >
                Save
            </Button>
        </Group>
    );
};
