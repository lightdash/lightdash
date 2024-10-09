import { DbtProjectType, snakeCaseName } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    TextInput,
    Tooltip,
    type ModalProps,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconInfoCircle, IconTableAlias } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../components/common/MantineIcon';
import { useGitHubRepositories } from '../../../components/UserSettings/GithubSettingsPanel';
import useHealth from '../../../hooks/health/useHealth';
import { useProject } from '../../../hooks/useProject';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useCreateVirtualView } from '../hooks/useVirtualView';

const validationSchema = z.object({
    name: z.string().min(1),
});

type FormValues = z.infer<typeof validationSchema>;

type Props = ModalProps;

export const CreateVirtualViewModal: FC<Props> = ({ opened, onClose }) => {
    const health = useHealth();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const columns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const {
        mutateAsync: createVirtualView,
        isLoading: isLoadingVirtual,
        error,
    } = useCreateVirtualView({
        projectUuid,
    });
    const form = useForm<FormValues>({
        initialValues: {
            name: '',
        },
        validate: zodResolver(validationSchema),
    });

    const { data: project } = useProject(projectUuid);
    const { data: githubRepositories, isError } = useGitHubRepositories();

    const canWriteToDbtProject = !!(
        health.data?.hasGithub &&
        githubRepositories !== undefined &&
        !isError &&
        project?.dbtConnection.type === DbtProjectType.GITHUB
    );

    const handleSubmit = useCallback(
        async (data: { name: string }) => {
            if (!columns) {
                return;
            }

            await createVirtualView({
                name: snakeCaseName(data.name),
                sql,
                columns,
                projectUuid,
            });

            onClose();
        },
        [columns, onClose, projectUuid, sql, createVirtualView],
    );

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconTableAlias}
                        size="lg"
                        color="gray.7"
                    />
                    <Text fw={500}>Create virtual view</Text>
                    <Tooltip
                        variant="xs"
                        withinPortal
                        multiline
                        maw={300}
                        label={`Create a virtual view so others can reuse this query in Lightdash. The query won’t be saved to or managed in your dbt project. ${
                            canWriteToDbtProject
                                ? 'If you’re expecting to reuse this query regularly, we suggest writing it back to dbt.'
                                : ''
                        } `}
                    >
                        <MantineIcon
                            color="gray.7"
                            icon={IconInfoCircle}
                            size={16}
                        />
                    </Tooltip>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack p="md">
                    <TextInput
                        radius="md"
                        label="Name"
                        required
                        {...form.getInputProps('name')}
                        error={!!error?.error}
                    />
                </Stack>

                <Group position="right" w="100%" p="md">
                    <Button
                        color="gray.7"
                        onClick={onClose}
                        variant="outline"
                        disabled={isLoadingVirtual}
                        size="xs"
                    >
                        Cancel
                    </Button>

                    <Button
                        type="submit"
                        disabled={!form.values.name || !sql}
                        loading={isLoadingVirtual}
                        size="xs"
                    >
                        Create
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};
