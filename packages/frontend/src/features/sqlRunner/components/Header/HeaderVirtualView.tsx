import {
    Box,
    Button,
    Group,
    HoverCard,
    LoadingOverlay,
    Text,
} from '@mantine/core';
import { IconTableAlias } from '@tabler/icons-react';
import { type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useUpdateVirtualView } from '../../hooks/useVirtualView';
import { useAppSelector } from '../../store/hooks';
import { SqlQueryBeforeSaveAlert } from '../SqlQueryBeforeSaveAlert';

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

    const { mutateAsync: updateVirtualView, isLoading } =
        useUpdateVirtualView(projectUuid);

    const handleUpdateVirtualView = async () => {
        if (!columns) {
            return;
        }
        await updateVirtualView({
            projectUuid,
            // TODO: Allow editing name
            name: virtualViewState.name,
            sql,
            columns,
        });

        history.push(`/projects/${projectUuid}/tables`);
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
                visible={isLoading}
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
            <HoverCard disabled={!hasUnrunChanges} withArrow>
                <HoverCard.Target>
                    <Box>
                        <Button
                            size="xs"
                            variant="default"
                            onClick={handleUpdateVirtualView}
                            disabled={hasUnrunChanges}
                        >
                            Save
                        </Button>
                    </Box>
                </HoverCard.Target>
                <HoverCard.Dropdown p={0} bg="yellow.0">
                    <SqlQueryBeforeSaveAlert withDescription={false} />
                </HoverCard.Dropdown>
            </HoverCard>
        </Group>
    );
};
