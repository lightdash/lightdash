import { subject } from '@casl/ability';
import { Group, Loader, Stack, Text } from '@mantine-8/core';
import { Navigate, useParams } from 'react-router';
import AppIframePreview from '../features/apps/AppIframePreview';
import { useAppPreviewToken } from '../features/apps/hooks/useAppPreviewToken';
import { useGetApp } from '../features/apps/hooks/useGetApp';
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

    const explicitVersion = versionParam ? Number(versionParam) : undefined;

    const health = useHealth();
    const { user } = useApp();
    const ability = useAbilityContext();

    // When no version in URL, fetch app to find the latest ready version
    const appQuery = useGetApp(
        explicitVersion ? undefined : projectUuid,
        explicitVersion ? undefined : appUuid,
    );

    const latestReadyVersion = appQuery.data?.pages[0]?.versions.find(
        (v) => v.status === 'ready',
    )?.version;

    const version = explicitVersion ?? latestReadyVersion;

    const {
        data: token,
        isLoading: isTokenLoading,
        error: tokenError,
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

    if (!projectUuid || !appUuid) {
        return <div>Missing route params</div>;
    }

    const isLoading = appQuery.isLoading || isTokenLoading;
    const error = appQuery.error ?? tokenError;

    if (!explicitVersion && !appQuery.isLoading && !latestReadyVersion) {
        return (
            <Stack align="center" justify="center" h="calc(100vh - 50px)">
                <Text c="red" size="sm">
                    No ready version found for this app
                </Text>
            </Stack>
        );
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
