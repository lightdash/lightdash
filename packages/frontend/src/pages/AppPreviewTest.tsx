import { subject } from '@casl/ability';
import { ActionIcon, Box, Loader, Menu, Stack, Text } from '@mantine-8/core';
import { IconDots, IconPencil } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import AppIframePreview from '../features/apps/AppIframePreview';
import { useAppPreviewToken } from '../features/apps/hooks/useAppPreviewToken';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import useHealth from '../hooks/health/useHealth';
import { useAbilityContext } from '../providers/Ability/useAbilityContext';
import useApp from '../providers/App/useApp';
import classes from './AppPreviewTest.module.css';

export default function AppPreviewTest() {
    const navigate = useNavigate();
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

    // Always fetch app to get creator info + latest ready version when needed
    const appQuery = useGetApp(projectUuid, appUuid);

    const latestReadyVersion = appQuery.data?.pages[0]?.versions.find(
        (v) => v.status === 'ready',
    )?.version;

    const createdByUserUuid = appQuery.data?.pages[0]?.createdByUserUuid;
    const isCreator =
        !!user.data?.userUuid && user.data.userUuid === createdByUserUuid;

    const version = explicitVersion ?? latestReadyVersion;

    const {
        data: token,
        isLoading: isTokenLoading,
        error: tokenError,
    } = useAppPreviewToken(projectUuid, appUuid, version);

    const [menuOpened, setMenuOpened] = useState(false);

    // Close menu when the iframe receives focus (i.e. user clicked on it)
    const handleBlur = useCallback(() => {
        if (menuOpened) {
            setMenuOpened(false);
        }
    }, [menuOpened]);

    useEffect(() => {
        window.addEventListener('blur', handleBlur);
        return () => window.removeEventListener('blur', handleBlur);
    }, [handleBlur]);

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

    const isLoading =
        appQuery.isLoading || (version !== undefined && isTokenLoading);
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
        <Box className={classes.previewContainer}>
            {isCreator && (
                <Box className={classes.menuOverlay}>
                    <Menu
                        position="bottom-end"
                        withinPortal
                        opened={menuOpened}
                        onChange={setMenuOpened}
                    >
                        <Menu.Target>
                            <ActionIcon
                                variant="filled"
                                color="gray"
                                size="lg"
                                radius="xl"
                            >
                                <IconDots size={18} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                leftSection={<IconPencil size={14} />}
                                onClick={() =>
                                    navigate(
                                        `/projects/${projectUuid}/apps/${appUuid}`,
                                    )
                                }
                            >
                                Continue building
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                </Box>
            )}
            <AppIframePreview src={previewUrl} />
        </Box>
    );
}
