import {
    DbtProjectType,
    type ApiGithubDbtWritePreview,
} from '@lightdash/common';
import {
    Badge,
    Button,
    List,
    Loader,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm, zodResolver } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { IconBrandGithub, IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useState, type FC } from 'react';
import { z } from 'zod';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import useHealth from '../../../hooks/health/useHealth';
import { useProject } from '../../../hooks/useProject';
import { useGithubDbtWriteBack } from '../hooks/useGithubDbtWriteBack';
import { useGithubDbtWritePreview } from '../hooks/useGithubDbtWritePreview';
import { useAppSelector } from '../store/hooks';

const validationSchema = z.object({
    name: z.string().min(1),
});

type FormValues = z.infer<typeof validationSchema>;

type Props = Pick<MantineModalProps, 'opened' | 'onClose'>;

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
        [DbtProjectType.GITHUB, DbtProjectType.GITLAB].includes(
            project?.dbtConnection.type as DbtProjectType,
        )
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
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Write back to dbt"
            icon={IconBrandGithub}
            cancelDisabled={isLoadingPullRequest}
            actions={
                <Button
                    type="submit"
                    form="write-back-to-dbt-form"
                    disabled={
                        !form.values.name || !sql || !canWriteToDbtProject
                    }
                    loading={isLoadingPullRequest}
                >
                    Open Pull Request
                </Button>
            }
            headerActions={
                <Tooltip
                    label="Create a new model in your dbt project from this SQL query. This will create a new branch and start a pull request."
                    multiline
                    maw={300}
                >
                    <MantineIcon
                        color="ldGray.7"
                        icon={IconInfoCircle}
                        size={16}
                    />
                </Tooltip>
            }
        >
            <form
                id="write-back-to-dbt-form"
                onSubmit={form.onSubmit(handleSubmit)}
            >
                <Stack>
                    <TextInput
                        label="Name"
                        required
                        {...form.getInputProps('name')}
                    />

                    <Stack gap="xs" pl="xs">
                        <Text fw={500}>
                            Files to be created in{' '}
                            <Badge
                                radius="md"
                                variant="light"
                                color="ldGray.9"
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
                        <List pl="xs">
                            {writePreviewData?.files.map((file) => (
                                <Tooltip
                                    key={file}
                                    position="top-start"
                                    label={file}
                                    multiline
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
            </form>
        </MantineModal>
    );
};
