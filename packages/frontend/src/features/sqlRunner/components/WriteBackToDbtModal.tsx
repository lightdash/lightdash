import {
    DbtProjectType,
    type ApiGithubDbtWritePreview,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Button,
    List,
    Loader,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { IconGitPullRequest, IconInfoCircle } from '@tabler/icons-react';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { useCallback, useEffect, useState, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { z } from 'zod';
import Callout from '../../../components/common/Callout';
import {
    GITHUB_USER_AUTHORIZE_URL,
    useGithubUserCredential,
} from '../../../components/common/GithubIntegration/hooks/useGithubIntegration';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';
import useHealth from '../../../hooks/health/useHealth';
import { useProject } from '../../../hooks/useProject';
import i18n from '../../../i18n/i18n';
import { useGithubDbtWriteBack } from '../hooks/useGithubDbtWriteBack';
import { useGithubDbtWritePreview } from '../hooks/useGithubDbtWritePreview';
import { useAppSelector } from '../store/hooks';
import { isBitbucketCloudConnection } from '../utils/isBitbucketCloudConnection';
import classes from './WriteBackToDbtModal.module.css';

const validationSchema = z.object({
    name: z.string().min(1, {
        error: () => i18n.t('saveModal.nameRequired', { ns: 'sqlRunner' }),
    }),
});

type FormValues = z.infer<typeof validationSchema>;

type Props = Pick<MantineModalProps, 'opened' | 'onClose'>;

export const WriteBackToDbtModal: FC<Props> = ({ opened, onClose }) => {
    const { t } = useTranslation('sqlRunner');
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
    const { data: githubUserCredential } = useGithubUserCredential();

    const canWriteToDbtProject =
        isBitbucketCloudConnection(project?.dbtConnection) ||
        !!(
            health?.hasGithub &&
            [DbtProjectType.GITHUB, DbtProjectType.GITLAB].includes(
                project?.dbtConnection.type as DbtProjectType,
            )
        );

    const isGithubProject =
        project?.dbtConnection.type === DbtProjectType.GITHUB;

    useEffect(() => {
        if (
            !opened ||
            !projectUuid ||
            !sql ||
            !columns ||
            !canWriteToDbtProject
        ) {
            return;
        }
        let isCurrentPreview = true;

        const loadPreview = async () => {
            try {
                const data = await getWritePreview({
                    projectUuid,
                    name: debouncedName || 'custom view',
                    sql,
                    columns,
                });
                if (isCurrentPreview) {
                    setWritePreviewData(data);
                }
            } catch {
                if (isCurrentPreview) {
                    setWritePreviewData(undefined);
                }
            }
        };

        void loadPreview();
        return () => {
            isCurrentPreview = false;
        };
    }, [
        opened,
        projectUuid,
        debouncedName,
        sql,
        columns,
        getWritePreview,
        canWriteToDbtProject,
    ]);

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
            title={t('writeBack.title')}
            icon={IconGitPullRequest}
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
                    {t('writeBack.openPullRequest')}
                </Button>
            }
            headerActions={
                <Tooltip label={t('writeBack.tooltip')} maw={300}>
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
                        label={t('writeBack.name')}
                        required
                        {...form.getInputProps('name')}
                    />

                    <Stack gap="xs" pl="xs">
                        <Text fw={500}>
                            <Trans
                                t={t}
                                i18nKey="writeBack.filesToBeCreatedIn"
                                components={{
                                    repo: (
                                        <>
                                            <Badge
                                                radius="md"
                                                color="ldGray.9"
                                                fz="xs"
                                                leftSection={
                                                    <MantineIcon
                                                        icon={
                                                            IconGitPullRequest
                                                        }
                                                    />
                                                }
                                                onClick={() => {
                                                    window.open(
                                                        writePreviewData?.url,
                                                        '_blank',
                                                        'noopener,noreferrer',
                                                    );
                                                }}
                                                className={classes.previewLink}
                                                title={t(
                                                    'writeBack.openInNewTab',
                                                    {
                                                        url: writePreviewData?.url,
                                                    },
                                                )}
                                            >
                                                {writePreviewData?.repo}
                                            </Badge>
                                            {isPreviewLoading && (
                                                <Loader size="xs" />
                                            )}
                                        </>
                                    ),
                                }}
                            />
                        </Text>
                        <List pl="xs">
                            {writePreviewData?.files.map((file) => (
                                <Tooltip
                                    key={file}
                                    position="top-start"
                                    label={file}
                                    maw={300}
                                >
                                    <List.Item fz="xs" ff="monospace">
                                        {file.split('/').pop()}
                                    </List.Item>
                                </Tooltip>
                            ))}
                        </List>
                    </Stack>

                    {isGithubProject &&
                        (githubUserCredential ? (
                            <Text fz="xs" c="dimmed">
                                <Trans
                                    t={t}
                                    i18nKey="writeBack.authoredAs"
                                    values={{
                                        login: githubUserCredential.githubLogin,
                                    }}
                                    components={{
                                        login: <Text span fw={500} inherit />,
                                    }}
                                />
                            </Text>
                        ) : (
                            <Callout variant="info">
                                <Trans
                                    t={t}
                                    i18nKey="writeBack.openedByBot"
                                    components={{
                                        link: (
                                            <Anchor
                                                fz="sm"
                                                href={`${GITHUB_USER_AUTHORIZE_URL}?redirect=${encodeURIComponent(
                                                    window.location.pathname,
                                                )}`}
                                                target="_blank"
                                            />
                                        ),
                                    }}
                                />
                            </Callout>
                        ))}
                </Stack>
            </form>
        </MantineModal>
    );
};
