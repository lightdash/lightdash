import {
    Anchor,
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
import { IconPlayerPlay, IconSparkles } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link, useParams } from 'react-router';
import { useGenerateApp } from '../features/apps/hooks/useGenerateApp';

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

    const previewPath = data
        ? `/projects/${projectUuid}/apps/${data.appUuid}/versions/${data.version}/preview`
        : null;

    return (
        <Stack p="lg" gap="lg" maw={720} mx="auto" mt="xl">
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

            <Button
                onClick={handleSubmit}
                loading={isLoading}
                disabled={!prompt.trim() || isLoading}
                leftSection={<IconSparkles size={16} />}
            >
                Generate
            </Button>

            {isLoading && (
                <Paper p="md" withBorder>
                    <Group gap="sm">
                        <Loader size="sm" />
                        <Text size="sm" c="dimmed">
                            Generating your app... This may take a few minutes.
                        </Text>
                    </Group>
                </Paper>
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

            {data && previewPath && (
                <Paper p="md" withBorder>
                    <Stack gap="xs">
                        <Group gap="sm">
                            <IconPlayerPlay size={16} />
                            <Text fw={500}>App generated</Text>
                        </Group>
                        <Group gap={4}>
                            <Text size="xs" c="dimmed">
                                ID:
                            </Text>
                            <Code>{data.appUuid}</Code>
                        </Group>
                        <Anchor
                            component={Link}
                            to={previewPath}
                            size="sm"
                            fw={500}
                        >
                            Open preview
                        </Anchor>
                    </Stack>
                </Paper>
            )}
        </Stack>
    );
};

export default AppGenerate;
