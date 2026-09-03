import { getAppDisplayName } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Group,
    Loader,
    Menu,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconArrowsUpDown,
    IconDots,
    IconExternalLink,
    IconX,
} from '@tabler/icons-react';
import { type FC, type ReactNode, useState } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import TruncatedText from '../../../../../components/common/TruncatedText';
import AppIframePreview from '../../../../../features/apps/AppIframePreview';
import AppInspectorPanel from '../../../../../features/apps/AppInspectorPanel';
import { getVisiblePreviewTokenError } from '../../../../../features/apps/hooks/previewTokenQueryOptions';
import { useAppInspector } from '../../../../../features/apps/hooks/useAppInspector';
import { useAppPreviewToken } from '../../../../../features/apps/hooks/useAppPreviewToken';
import { useGetApp } from '../../../../../features/apps/hooks/useGetApp';
import { usePreviewOrigin } from '../../../../../features/apps/previewOrigin';
import {
    clearPreview,
    type DataAppPreviewData,
} from '../../store/aiArtifactSlice';
import { useAiAgentStoreDispatch } from '../../store/hooks';
import artifactStyles from './AiArtifactPanel.module.css';

type Props = {
    dataAppPreview: DataAppPreviewData;
    /** Only the full-page thread panel hosts the query inspector; the
     *  floating launcher preview is too small for it. */
    showInspector: boolean;
};

export const AiDataAppPreviewPanel: FC<Props> = ({
    dataAppPreview,
    showInspector,
}) => {
    const dispatch = useAiAgentStoreDispatch();
    const { appUuid, projectUuid } = dataAppPreview;

    const previewOrigin = usePreviewOrigin();
    const appQuery = useGetApp(projectUuid, appUuid);
    const app = appQuery.data?.pages[0];

    // Authoritative across ALL versions — the ready version may be older than
    // the fetched page of versions, so never scan `versions` for it.
    const latestReadyVersion = app?.latestReadyVersion ?? undefined;
    const identityKey = `${appUuid}:${latestReadyVersion}`;
    // Lives here, not next to the iframe, so logs and dismissal survive the
    // token reload between versions. Only wired in when `showInspector`.
    const inspector = useAppInspector({ identityKey, defaultHidden: false });
    // Opened from the menu: keep the panel visible (collapsed bar) even before
    // the app issues its first query.
    const [inspectorPinned, setInspectorPinned] = useState(false);
    const hasInspectorLogs =
        inspector.panelProps.queries.length > 0 ||
        inspector.panelProps.externalRequests.length > 0;
    const isInspectorVisible =
        showInspector &&
        !inspector.hidden &&
        (inspectorPinned || hasInspectorLogs);
    const toggleInspector = () => {
        if (isInspectorVisible) {
            inspector.hide();
        } else {
            setInspectorPinned(true);
            inspector.show();
        }
    };

    const {
        data: token,
        isLoading: isTokenLoading,
        error: tokenError,
    } = useAppPreviewToken(projectUuid, appUuid, latestReadyVersion);
    const visibleTokenError = getVisiblePreviewTokenError(tokenError, !!token);

    const isForbidden =
        appQuery.error?.error?.statusCode === 403 ||
        visibleTokenError?.error?.statusCode === 403;
    const isNotFound =
        appQuery.error?.error?.statusCode === 404 ||
        visibleTokenError?.error?.statusCode === 404;
    const hasNoReadyVersion =
        !appQuery.isLoading && !appQuery.error && !latestReadyVersion;
    const otherError =
        !isForbidden && !isNotFound && (appQuery.error || visibleTokenError);

    const previewUrl =
        token && latestReadyVersion
            ? `${previewOrigin}/api/apps/${appUuid}/versions/${latestReadyVersion}/t/${token}/#transport=postMessage&projectUuid=${projectUuid}`
            : undefined;

    const closeButton = (
        <ActionIcon
            size="sm"
            onClick={() => dispatch(clearPreview())}
            aria-label="Close"
        >
            <MantineIcon icon={IconX} />
        </ActionIcon>
    );

    const renderMessage = (message: string) => (
        <Box className={artifactStyles.floatingPanel}>
            <Center className={artifactStyles.loading}>
                <Stack gap="xs" align="center">
                    <Text size="xs" c="dimmed" ta="center">
                        {message}
                    </Text>
                    {closeButton}
                </Stack>
            </Center>
        </Box>
    );

    if (isNotFound) {
        return renderMessage('This data app no longer exists.');
    }
    if (isForbidden) {
        return renderMessage(
            "You don't have permission to view this data app.",
        );
    }
    if (hasNoReadyVersion) {
        return renderMessage("This data app hasn't finished building yet.");
    }
    if (otherError) {
        return renderMessage('Failed to load data app. Please try again.');
    }

    if (appQuery.isLoading || !app) {
        return (
            <Box className={artifactStyles.floatingPanel}>
                <Center className={artifactStyles.loading}>
                    <Stack gap="xs" align="center">
                        <Loader
                            type="dots"
                            color="ldGray.6"
                            delayedMessage="Loading data app..."
                        />
                        {closeButton}
                    </Stack>
                </Center>
            </Box>
        );
    }

    let body: ReactNode;
    if (isTokenLoading || !previewUrl || !token) {
        body = (
            <Center h="100%">
                <Loader
                    type="dots"
                    color="ldGray.6"
                    delayedMessage="Loading data app..."
                />
            </Center>
        );
    } else {
        body = (
            <>
                <AppIframePreview
                    src={previewUrl}
                    previewToken={token}
                    expectedPreviewOrigin={previewOrigin}
                    projectUuid={projectUuid}
                    appUuid={appUuid}
                    identityKey={identityKey}
                    capabilities={{ gsheetExport: true }}
                    {...(showInspector ? inspector.iframeProps : {})}
                />
                {showInspector && !inspector.hidden && (
                    <AppInspectorPanel
                        projectUuid={projectUuid}
                        hideWhenEmpty={!inspectorPinned}
                        {...inspector.panelProps}
                    />
                )}
            </>
        );
    }

    const appUrl = `/projects/${projectUuid}/apps/${appUuid}/view`;

    return (
        <Box className={artifactStyles.floatingPanel}>
            <Box className={artifactStyles.floatingContent}>
                <Box className={artifactStyles.head}>
                    <Stack gap={0} flex={1} miw={0}>
                        <TruncatedText fz="sm" fw={600} maxWidth="100%">
                            {getAppDisplayName(app.name, appUuid)}
                        </TruncatedText>
                        {app.description && (
                            <TruncatedText fz="xs" c="dimmed" maxWidth="100%">
                                {app.description}
                            </TruncatedText>
                        )}
                    </Stack>

                    <Group gap={2} className={artifactStyles.headRight}>
                        <Menu position="bottom-end">
                            <Menu.Target>
                                <Tooltip label="More options">
                                    <ActionIcon
                                        size="sm"
                                        aria-label="More options"
                                    >
                                        <MantineIcon icon={IconDots} />
                                    </ActionIcon>
                                </Tooltip>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item
                                    component="a"
                                    href={appUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconExternalLink}
                                            size="sm"
                                        />
                                    }
                                >
                                    Open in new tab
                                </Menu.Item>
                                {showInspector && (
                                    <Menu.Item
                                        leftSection={
                                            <MantineIcon
                                                icon={IconArrowsUpDown}
                                                size="sm"
                                            />
                                        }
                                        onClick={toggleInspector}
                                    >
                                        {isInspectorVisible
                                            ? 'Hide network'
                                            : 'Show network'}
                                    </Menu.Item>
                                )}
                            </Menu.Dropdown>
                        </Menu>
                        {closeButton}
                    </Group>
                </Box>

                <Box className={artifactStyles.previewBody}>{body}</Box>
            </Box>
        </Box>
    );
};
