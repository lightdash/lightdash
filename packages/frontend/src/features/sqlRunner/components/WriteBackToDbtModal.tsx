import {
    DbtProjectType,
    type ApiGithubDbtWritePreview,
} from '@lightdash/common';
import {
    Badge,
    Button,
    Group,
    List,
    Loader,
    Modal,
    Stack,
    Text,
    TextInput,
    Tooltip,
    type ModalProps,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { IconBrandGithub, IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useState, type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../components/common/MantineIcon';
import useHealth from '../../../hooks/health/useHealth';
import { useProject } from '../../../hooks/useProject';
import { useGithubDbtWriteBack } from '../hooks/useGithubDbtWriteBack';
import { useGithubDbtWritePreview } from '../hooks/useGithubDbtWritePreview';
import { useAppSelector } from '../store/hooks';

const validationSchema = z.object({
    name: z.string().min(1),
});

type FormValues = z.infer<typeof validationSchema>;

type Props = ModalProps;

export const WriteBackToDbtModal: FC<Props> = ({ opened, onClose }) => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const columns = useAppSelector((state) => state.sqlRunner.sqlColumns);

    const { mutateAsync: createPullRequest, isLoading: isLoadingPullRequest } =
        useGithubDbtWriteBack();

    const [writePreviewData, setWritePreviewData] =
        useState<ApiGithubDbtWritePreview['results']>();

    const { mutateAsync: getWritePreview, isLoading: isPreviewLoading } =
        useGithubDbtWritePreview();
    const form = useForm<FormValues>({
        initialValues: {
            name: '',
        },
        validate: zodResolver(validationSchema),
    });
    const [debouncedName] = useDebouncedValue(form.values.name, 300);

    const { data: project } = useProject(projectUuid);
    const { data: health } = useHealth();

    const canWriteToDbtProject = !!(
        health?.hasGithub &&
        project?.dbtConnection.type === DbtProjectType.GITHUB
    );

    useEffect(() => {
        if (!opened || !projectUuid || !sql || !columns) return;

        const loadPreview = async () => {
            const data = await getWritePreview({
                projectUuid,
                name: debouncedName || 'custom view',
                sql,
                columns,
            });
            setWritePreviewData(data);
        };

        void loadPreview();
    }, [opened, projectUuid, debouncedName, sql, columns, getWritePreview]);

    const handleSubmit = useCallback(
        async (data: { name: string }) => {
            if (!columns) {
                return;
            }

            await createPullRequest({
                projectUuid,
                name: data.name,
                sql,
                columns,
            });

            onClose();
        },
        [columns, onClose, createPullRequest, projectUuid, sql],
    );

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconBrandGithub}
                        size="lg"
                        color="gray.7"
                    />
                    <Text fw={500}>Write back to dbt</Text>
                    <Tooltip
                        variant="xs"
                        withinPortal
                        multiline
                        maw={300}
                        label="Create a new model in your dbt project from this SQL query. This will create a new branch and start a pull request."
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
                    <Stack spacing="xs">
                        <TextInput
                            radius="md"
                            label="Name"
                            required
                            {...form.getInputProps('name')}
                        />
                    </Stack>

                    <Stack spacing="xs" pl="xs">
                        <Text fw={500}>
                            Files to be created in{' '}
                            <Badge
                                radius="md"
                                variant="light"
                                color="gray.9"
                                fz="xs"
                                leftSection={
                                    <MantineIcon icon={IconBrandGithub} />
                                }
                                onClick={() => {
                                    window.open(
                                        writePreviewData?.url,
                                        '_blank',
                                    );
                                }}
                                style={{ cursor: 'pointer' }}
                                title={`Open "${writePreviewData?.url}" in new tab`}
                            >
                                {writePreviewData?.repo}
                            </Badge>
                            {isPreviewLoading && <Loader size="xs" />}:
                        </Text>
                        <List spacing="xs" pl="xs">
                            {writePreviewData?.files.map((file) => (
                                <Tooltip
                                    key={file}
                                    variant="xs"
                                    position="top-start"
                                    label={file}
                                    multiline
                                    withinPortal
                                    maw={300}
                                >
                                    <List.Item fz="xs" ff="monospace">
                                        {file.split('/').pop()}
                                    </List.Item>
                                </Tooltip>
                            ))}
                        </List>
                    </Stack>
                </Stack>

                <Group position="right" w="100%" p="md">
                    <Button
                        color="gray.7"
                        onClick={onClose}
                        variant="outline"
                        disabled={isLoadingPullRequest}
                        size="xs"
                    >
                        Cancel
                    </Button>

                    <Button
                        type="submit"
                        disabled={
                            !form.values.name || !sql || !canWriteToDbtProject
                        }
                        loading={isLoadingPullRequest}
                        size="xs"
                    >
                        Open Pull Request
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};
