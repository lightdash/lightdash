import { ActionIcon, Divider, Tooltip } from '@mantine/core';
import { IconPencil, IconRefresh } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { ShareLinkButton } from '../../../components/common/ShareLinkButton';
import AppActionsMenu, { type AppActionsMenuProps } from './AppActionsMenu';

type Props = Pick<
    AppActionsMenuProps,
    | 'projectUuid'
    | 'appUuid'
    | 'appName'
    | 'appDescription'
    | 'appSpaceUuid'
    | 'appCreatedByUserUuid'
    | 'latestVersionNumber'
    | 'latestVersionStatus'
    | 'onDeleted'
    | 'navItem'
    | 'askAiItem'
    | 'captureThumbnail'
    | 'capturePreviewScreenshot'
    | 'upgrade'
    | 'capturedQueryCount'
> & {
    onRefresh: () => void;
    refreshDisabled: boolean;
    onViewNetwork: () => void;
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
    refreshDisabled,
    onViewNetwork,
    onEdit,
    shareUrl,
    fullscreenToggle,
    ...menuProps
}) => {
    return (
        <>
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
                    variant="default"
                    size="md"
                    disabled={refreshDisabled}
                    onClick={onRefresh}
                    aria-label="Refresh"
                >
                    <MantineIcon icon={IconRefresh} />
                </ActionIcon>
            </Tooltip>
            {fullscreenToggle}
            {shareUrl && (
                <ShareLinkButton url={shareUrl} label="Copy link to the app" />
            )}
            <AppActionsMenu
                {...menuProps}
                onRefresh={null}
                viewNetwork={{ label: 'View network', onClick: onViewNetwork }}
            />
        </>
    );
};

export default AppHeaderActions;
