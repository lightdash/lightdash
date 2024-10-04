import {
    Box,
    Button,
    Group,
    HoverCard,
    LoadingOverlay,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconTableAlias } from '@tabler/icons-react';
import { type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useUpdateCustomExplore } from '../../hooks/useCustomExplore';
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

    const { mutateAsync: updateCustomExplore, isLoading } =
        useUpdateCustomExplore(projectUuid);
    const form = useForm({
        initialValues: {
            name: virtualViewState.name,
        },
    });

    const handleUpdateVirtualView = async () => {
        if (!columns) {
            return;
        }
        await updateCustomExplore({
            projectUuid,
            exploreName: virtualViewState.name,
            name: form.values.name,
            sql: sql,
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
                        Editing virtual view
                    </Text>
                </Group>
                <form
                    onSubmit={form.onSubmit((values) => {
                        console.log(values);
                    })}
                >
                    <TextInput
                        size="xs"
                        radius="md"
                        {...form.getInputProps('name')}
                    />
                </form>
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
