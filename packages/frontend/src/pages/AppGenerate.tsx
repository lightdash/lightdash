import {
    Button,
    Code,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Textarea,
    Title,
} from '@mantine-8/core';
import {
    IconExternalLink,
    IconPlayerPlay,
    IconSparkles,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link, useParams } from 'react-router';
import AppIframePreview from '../features/apps/AppIframePreview';
import { useAppPreviewToken } from '../features/apps/hooks/useAppPreviewToken';
import { useGenerateApp } from '../features/apps/hooks/useGenerateApp';

const AppPreview: FC<{
    projectUuid: string;
    appUuid: string;
    version: number;
}> = ({ projectUuid, appUuid, version }) => {
    const {
        data: token,
        isLoading,
        error,
    } = useAppPreviewToken(projectUuid, appUuid, version);

    const baseUrl = window.location.origin;
    const previewUrl = token
        ? `${baseUrl}/api/apps/${appUuid}/versions/${version}/?token=${token}#transport=postMessage&projectUuid=${projectUuid}`
        : undefined;

    if (isLoading) {
        return (
            <Group gap="sm" p="md">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                    Loading preview...
                </Text>
            </Group>
        );
    }

    if (error) {
        return (
            <Text c="red" p="md" size="sm">
                Failed to load preview:{' '}
                {error instanceof Error ? error.message : 'Unknown error'}
            </Text>
        );
    }

    if (!previewUrl) return null;

    return <AppIframePreview src={previewUrl} projectUuid={projectUuid} />;
};

const AppGenerate: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [prompt, setPrompt] = useState('');
    const { mutate, data, isLoading, error, reset } = useGenerateApp();

    if (!projectUuid) {
        return <div>Missing project UUID</div>;
    }

    const handleSubmit = () => {
        if (!prompt.trim()) return;
        reset();
        mutate({ projectUuid, prompt: prompt.trim() });
    };

    return (
        <Stack p="lg" gap="lg">
            <Stack maw={720} mx="auto" w="100%">
                <Group gap="sm">
                    <IconSparkles size={24} />
                    <Title order={3}>Generate App</Title>
                </Group>

                <Textarea
                    placeholder="Describe the data app you want to build..."
                    minRows={4}
                    maxRows={10}
                    autosize
                    value={prompt}
                    onChange={(e) => setPrompt(e.currentTarget.value)}
                    disabled={isLoading}
                />

                {isLoading ? (
                    <Paper p="md" withBorder>
                        <Group gap="sm">
                            <Loader size="sm" />
                            <Text size="sm" c="dimmed">
                                Generating your app... This may take a few
                                minutes.
                            </Text>
                        </Group>
                    </Paper>
                ) : (
                    <Button
                        onClick={handleSubmit}
                        disabled={!prompt.trim()}
                        leftSection={<IconSparkles size={16} />}
                    >
                        Generate
                    </Button>
                )}

                {error && (
                    <Paper p="md" withBorder>
                        <Text c="red" size="sm">
                            {error instanceof Error
                                ? error.message
                                : 'Failed to generate app'}
                        </Text>
                    </Paper>
                )}
            </Stack>

            {data && (
                <Stack gap="sm">
                    <Group gap="sm">
                        <IconPlayerPlay size={16} />
                        <Text fw={500} size="sm">
                            App generated
                        </Text>
                        <Code>{data.appUuid}</Code>
                        <Button
                            component={Link}
                            to={`/projects/${projectUuid}/apps/${data.appUuid}/versions/${data.version}/preview`}
                            target="_blank"
                            variant="subtle"
                            size="compact-xs"
                            rightSection={<IconExternalLink size={14} />}
                        >
                            Open preview page
                        </Button>
                    </Group>
                    <Paper shadow="sm" radius="md" withBorder h="80vh">
                        <AppPreview
                            projectUuid={projectUuid}
                            appUuid={data.appUuid}
                            version={data.version}
                        />
                    </Paper>
                </Stack>
            )}
        </Stack>
    );
};

export default AppGenerate;
