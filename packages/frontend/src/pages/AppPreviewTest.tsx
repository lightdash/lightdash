import { subject } from '@casl/ability';
import { Group, Loader, Stack, Text } from '@mantine-8/core';
import { Navigate, useParams } from 'react-router';
import AppIframePreview from '../features/apps/AppIframePreview';
import { useAppPreviewToken } from '../features/apps/hooks/useAppPreviewToken';
import useHealth from '../hooks/health/useHealth';
import { useAbilityContext } from '../providers/Ability/useAbilityContext';
import useApp from '../providers/App/useApp';

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
    const health = useHealth();
    const { user } = useApp();
    const ability = useAbilityContext();

    const {
        data: token,
        isLoading,
        error,
    } = useAppPreviewToken(projectUuid, appUuid, version);

    if (health.data && !health.data.dataApps.enabled) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    if (
        !ability.can(
            'manage',
            subject('DataApp', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        )
    ) {
        return <Navigate to={`/projects/${projectUuid}/home`} replace />;
    }

    if (!projectUuid || !appUuid || !version) {
        return <div>Missing route params</div>;
    }

    const baseUrl = window.location.origin;
    const previewUrl = token
        ? `${baseUrl}/api/apps/${appUuid}/versions/${version}/?token=${token}#transport=postMessage&projectUuid=${projectUuid}`
        : undefined;

    if (isLoading) {
        return (
            <Stack align="center" justify="center" h="calc(100vh - 50px)">
                <Loader size="md" />
                <Text size="sm" c="dimmed">
                    Loading app...
                </Text>
            </Stack>
        );
    }

    if (error) {
        return (
            <Stack align="center" justify="center" h="calc(100vh - 50px)">
                <Text c="red" size="sm">
                    Failed to load app:{' '}
                    {error instanceof Error ? error.message : 'Unknown error'}
                </Text>
            </Stack>
        );
    }

    if (!previewUrl) return null;

    return (
        <Group h="calc(100vh - 50px)" w="100%">
            <AppIframePreview src={previewUrl} />
        </Group>
    );
}
