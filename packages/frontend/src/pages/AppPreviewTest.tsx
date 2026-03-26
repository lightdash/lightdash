import {
    ActionIcon,
    Badge,
    Code,
    CopyButton,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconCheck, IconCopy, IconPlayerPlay } from '@tabler/icons-react';
import { useParams } from 'react-router';
import AppIframePreview from '../features/apps/AppIframePreview';
import { useAppPreviewToken } from '../features/apps/hooks/useAppPreviewToken';

export default function AppPreviewTest() {
    const {
        projectUuid,
        appUuid,
        version: versionParam,
    } = useParams<{
        projectUuid: string;
        appUuid: string;
        version: string;
    }>();

    const version = versionParam ? Number(versionParam) : undefined;

    const {
        data: token,
        isLoading,
        error,
    } = useAppPreviewToken(projectUuid, appUuid, version);

    if (!projectUuid || !appUuid || !version) {
        return <div>Missing route params</div>;
    }

    const baseUrl = window.location.origin;
    const previewUrl = token
        ? `${baseUrl}/api/apps/${appUuid}/versions/${version}/?token=${token}#transport=postMessage&projectUuid=${projectUuid}`
        : undefined;

    return (
        <Stack p="lg" gap="md">
            <Group justify="space-between">
                <Group gap="sm">
                    <IconPlayerPlay size={20} />
                    <Title order={4}>App Preview</Title>
                    <Badge variant="light" color="blue" size="sm">
                        postMessage bridge
                    </Badge>
                </Group>
                {previewUrl && (
                    <Group gap="xs">
                        <Text size="xs" c="dimmed">
                            {previewUrl}
                        </Text>
                        <CopyButton value={previewUrl}>
                            {({ copied, copy }) => (
                                <Tooltip
                                    label={copied ? 'Copied' : 'Copy URL'}
                                    withArrow
                                >
                                    <ActionIcon
                                        size="xs"
                                        variant="subtle"
                                        onClick={copy}
                                    >
                                        {copied ? (
                                            <IconCheck size={14} />
                                        ) : (
                                            <IconCopy size={14} />
                                        )}
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </CopyButton>
                    </Group>
                )}
            </Group>

            <Group gap="lg">
                <Group gap={4}>
                    <Text size="xs" c="dimmed">
                        App
                    </Text>
                    <Code>{appUuid}</Code>
                </Group>
                <Group gap={4}>
                    <Text size="xs" c="dimmed">
                        Version
                    </Text>
                    <Code>{version}</Code>
                </Group>
                <Group gap={4}>
                    <Text size="xs" c="dimmed">
                        Transport
                    </Text>
                    <Badge variant="dot" color="green" size="xs">
                        postMessage
                    </Badge>
                </Group>
            </Group>

            <Paper shadow="sm" radius="md" withBorder h="80vh">
                {isLoading && <Loader m="auto" />}
                {error && (
                    <Text c="red" p="md">
                        Failed to fetch preview token:{' '}
                        {error instanceof Error
                            ? error.message
                            : 'Unknown error'}
                    </Text>
                )}
                {previewUrl && <AppIframePreview src={previewUrl} />}
            </Paper>
        </Stack>
    );
}
