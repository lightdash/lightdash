import {
    Alert,
    Box,
    Button,
    Group,
    PasswordInput,
    Stack,
    Switch,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconCheck } from '@tabler/icons-react';
import { useCallback, useMemo } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import { useProject, useUpdateMetadataMutation } from '../../hooks/useProject';
import FormSection from '../ProjectConnection/Inputs/FormSection';
import ErrorState from '../common/ErrorState';
import LoadingState from '../common/LoadingState';

type Props = {
    projectUuid: string;
};

const ProjectMetricFlowSettings = ({ projectUuid }: Props) => {
    const { data: project, isInitialLoading, error } = useProject(projectUuid);
    const { showToastSuccess } = useToaster();
    const mutation = useUpdateMetadataMutation(projectUuid);

    const initialValues = useMemo(
        () => ({
            projectId: project?.metricFlow?.projectId ?? '',
            apiToken: '',
            clearToken: false,
        }),
        [project?.metricFlow],
    );

    const form = useForm({
        initialValues,
        validate: {
            projectId: (value) =>
                value.trim().length === 0 ? 'MetricFlow 项目 ID 必填' : null,
        },
        validateInputOnBlur: true,
    });

    const handleSubmit = useCallback(
        async (values: typeof initialValues) => {
            await mutation.mutateAsync({
                metricFlow: {
                    projectId: values.projectId,
                    apiToken: values.clearToken
                        ? null
                        : values.apiToken || undefined,
                },
            });
            showToastSuccess({
                title: '已保存 MetricFlow 配置',
            });
            form.reset();
        },
        [form, mutation, showToastSuccess],
    );

    if (isInitialLoading) return <LoadingState title="加载项目…" />;
    if (error) return <ErrorState error={error.error} />;
    if (!project) return null;

    const hasExistingToken = project.metricFlow?.hasApiToken;

    return (
        <FormSection
            label="MetricFlow 配置"
            description="配置项目对应的 MetricFlow 服务 Project ID 与可选的专用 token。"
        >
            <Box
                component="form"
                maw={540}
                onSubmit={form.onSubmit(handleSubmit)}
            >
                <Stack spacing="lg">
                    <TextInput
                        label="MetricFlow 项目 ID"
                        placeholder="例如 mf_local"
                        required
                        {...form.getInputProps('projectId')}
                    />
                    <PasswordInput
                        label="项目专用 Token（可选）"
                        description={
                            hasExistingToken
                                ? '已保存过 Token，留空将保持不变。'
                                : '可选，留空则使用全局 METRICFLOW_TOKEN。'
                        }
                        placeholder={hasExistingToken ? '••••••' : 'test-token'}
                        {...form.getInputProps('apiToken')}
                    />
                    {hasExistingToken ? (
                        <Switch
                            label="清除已保存的项目专用 Token"
                            {...form.getInputProps('clearToken', {
                                type: 'checkbox',
                            })}
                        />
                    ) : null}
                    <Group position="left">
                        <Button
                            type="submit"
                            loading={mutation.isLoading}
                            leftIcon={<IconCheck size={16} />}
                        >
                            保存
                        </Button>
                    </Group>
                    <Alert color="gray" title="说明">
                        <Stack spacing="xs">
                            <Text size="sm">
                                - 若不填写 Token，则调用 MetricFlow Service
                                时使用全局 METRICFLOW_TOKEN。
                            </Text>
                            <Text size="sm">
                                - 勾选“清除已保存的项目专用 Token”会删除项目级
                                token。
                            </Text>
                        </Stack>
                    </Alert>
                </Stack>
            </Box>
        </FormSection>
    );
};

export default ProjectMetricFlowSettings;
