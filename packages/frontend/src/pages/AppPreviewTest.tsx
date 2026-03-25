import { SEED_PAT } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Code,
    CopyButton,
    Group,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconCheck, IconCopy, IconPlayerPlay } from '@tabler/icons-react';
import { useParams } from 'react-router';
import AppIframePreview from '../features/apps/AppIframePreview';

export default function AppPreviewTest() {
    const { projectUuid, appUuid, versionUuid } = useParams<{
        projectUuid: string;
        appUuid: string;
        versionUuid: string;
    }>();

    if (!projectUuid || !appUuid || !versionUuid) {
        return <div>Missing route params</div>;
    }

    const baseUrl = window.location.origin;
    const previewUrl = `http://localhost:8080/api/v1/preview/apps/${appUuid}/versions/${versionUuid}#token=${SEED_PAT.token}&projectUuid=${projectUuid}&baseUrl=${baseUrl}`;

    return (
        <Stack p="lg" gap="md">
            <Group justify="space-between">
                <Group gap="sm">
                    <IconPlayerPlay size={20} />
                    <Title order={4}>App Preview</Title>
                    <Badge variant="light" color="blue" size="sm">
                        hash token
                    </Badge>
                </Group>
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
                    <Code>{versionUuid}</Code>
                </Group>
                <Group gap={4}>
                    <Text size="xs" c="dimmed">
                        Transport
                    </Text>
                    <Badge variant="dot" color="green" size="xs">
                        apiTransport (hash token)
                    </Badge>
                </Group>
            </Group>

            <Paper shadow="sm" radius="md" withBorder h="80vh">
                <AppIframePreview src={previewUrl} />
            </Paper>
        </Stack>
    );
}
