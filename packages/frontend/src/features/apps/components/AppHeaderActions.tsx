import { ActionIcon, Divider, Tooltip } from '@mantine/core';
import { IconExternalLink, IconPencil, IconRefresh } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import AppActionsMenu, { type AppActionsMenuProps } from './AppActionsMenu';

type Props = Pick<
    AppActionsMenuProps,
    | 'projectUuid'
    | 'appUuid'
    | 'appName'
    | 'appDescription'
    | 'appSpaceUuid'
    | 'appCreatedByUserUuid'
    | 'verification'
    | 'latestVersionNumber'
    | 'latestVersionStatus'
    | 'onDeleted'
    | 'navItem'
    | 'askAiItem'
    | 'captureThumbnail'
    | 'capturePreviewScreenshot'
    | 'previewVersion'
    | 'upgrade'
    | 'capturedQueryCount'
> & {
    onRefresh: () => void;
    /** False until there is a preview to re-run; the button is hidden. */
    refreshAvailable: boolean;
    /** Queries/requests inspector, toggled from the overflow menu (the panel also closes itself). */
    network: { open: boolean; queryCount: number; onToggle: () => void };
    /** Prominent edit affordance matching the dashboard header's pencil
     *  button — "Continue building" in the viewer. Pass null on surfaces
     *  that ARE the edit surface (the builder). */
    onEdit: (() => void) | null;
    /** URL for the copy-link button, matching the dashboard header. Pass
     *  null on surfaces without a shareable URL (the builder). */
    shareUrl: string | null;
    /** Fullscreen/presentation toggle, rendered between the refresh button
     *  and the overflow menu to match the dashboard header's ordering. Pass
     *  null on surfaces without it (the builder). */
    fullscreenToggle: ReactNode;
    /** Opens the running app in a new tab. Pass null where the app is
     *  already the page (the viewer). */
    openUrl: string | null;
    /** Builder-only tools that act on the preview (element picker,
     *  screenshot), shown first. Null on the viewer. */
    previewTools: ReactNode;
};

/**
 * The shared right-hand side of a data app's header, following the dashboard
 * header's ordering: edit pencil, refresh, fullscreen, share link, overflow
 * menu (`AppActionsMenu`, which owns every action item and modal). Used by
 * both the builder (`AppGenerate`) and the viewer (`AppPreviewTest`) so the
 * two surfaces expose the same actions; per-surface differences come in via
 * the `onEdit`/`shareUrl`/`navItem` slots.
 */
const AppHeaderActions: FC<Props> = ({
    onRefresh,
    refreshAvailable,
    network,
    onEdit,
    shareUrl,
    fullscreenToggle,
    openUrl,
    previewTools,
    ...menuProps
}) => {
    return (
        <>
            {previewTools && (
                <>
                    {previewTools}
                    <Divider orientation="vertical" h={16} my="auto" />
                </>
            )}
            {onEdit && (
                <>
                    <Tooltip
                        label="Continue building"
                        position="bottom"
                        openDelay={200}
                        transitionProps={{
                            transition: 'fade',
                            duration: 150,
                        }}
                    >
                        <ActionIcon
                            aria-label="Continue building"
                            // Anchor for scope walkthroughs (data-tour-via):
                            // from the running app into the builder.
                            data-tour-anchor="app-continue-building"
                            data-tour-hint="Click Continue building"
                            onClick={onEdit}
                            bg="foreground"
                            c="background"
                            size="md"
                        >
                            <MantineIcon
                                icon={IconPencil}
                                color="background"
                                size="md"
                            />
                        </ActionIcon>
                    </Tooltip>
                    <Divider orientation="vertical" />
                </>
            )}
            {refreshAvailable && (
                <Tooltip
                    label="Refresh to re-run queries"
                    position="bottom"
                    openDelay={200}
                    transitionProps={{
                        transition: 'fade',
                        duration: 150,
                    }}
                >
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="md"
                        onClick={onRefresh}
                        aria-label="Refresh"
                    >
                        <MantineIcon icon={IconRefresh} />
                    </ActionIcon>
                </Tooltip>
            )}
            {openUrl && (
                <Tooltip
                    label="Open app in a new tab"
                    position="bottom"
                    openDelay={200}
                >
                    <ActionIcon
                        component="a"
                        href={openUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="md"
                        aria-label="Open app"
                    >
                        <MantineIcon icon={IconExternalLink} />
                    </ActionIcon>
                </Tooltip>
            )}
            {fullscreenToggle}
            <AppActionsMenu
                {...menuProps}
                target={{ variant: 'subtle' }}
                onRefresh={null}
                shareMenu={{ copyUrl: shareUrl }}
                viewNetwork={{
                    label: network.open ? 'Hide network' : 'View network',
                    onClick: network.onToggle,
                }}
            />
        </>
    );
};

export default AppHeaderActions;
