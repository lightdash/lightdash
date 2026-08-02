import {
    ContentType,
    ResourceViewItemType,
    type ResourceViewDataAppItem,
} from '@lightdash/common';
import { Box, Checkbox, Tooltip } from '@mantine-8/core';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import TransferItemsModal from '../../../components/common/TransferItemsModal/TransferItemsModal';
import useToaster from '../../../hooks/toaster/useToaster';
import { useContentAction } from '../../../hooks/useContent';
import AppIframePreview, {
    type AppIframePreviewHandle,
} from '../AppIframePreview';
import { useAppPreviewToken } from '../hooks/useAppPreviewToken';
import {
    useAppThumbnailUpload,
    useAppThumbnailUrl,
} from '../hooks/useAppThumbnail';
import { usePreviewOrigin } from '../previewOrigin';
import classes from './MoveAppToSpaceModal.module.css';

export type DataAppMoveTarget = Pick<
    ResourceViewDataAppItem['data'],
    | 'uuid'
    | 'name'
    | 'description'
    | 'spaceUuid'
    | 'createdByUserUuid'
    | 'latestVersionNumber'
    | 'latestVersionStatus'
>;

type Props = {
    projectUuid: string;
    app: DataAppMoveTarget;
    opened: boolean;
    onClose: () => void;
    /** Called after a successful move, before the modal closes — for
     *  surface-specific cache invalidation (e.g. the My Apps list). */
    onMoved?: () => Promise<void> | void;
    /** Capture from the surface's live preview iframe, when one exists
     *  (builder/viewer). Preferred over the fallback because it screenshots
     *  the app exactly as the user sees it — including any interactive state
     *  like selected metrics or filters. Null/omitted on surfaces without a
     *  live preview (browse table, My Apps), which fall back to an invisible
     *  default-state render of the latest ready version. */
    capturePreviewScreenshot?: (() => Promise<File>) | null;
};

/** How long the confirm handler waits for the invisible fallback iframe to
 *  announce screenshot capability before giving up on the capture. */
const CAPTURE_CAPABILITY_TIMEOUT_MS = 10_000;

/**
 * "Move to space" / "Add to space" for a data app. Shared by the header's
 * overflow menu, its space chip, the My Apps settings list, and the browse
 * table so the move flow — and the app's ResourceViewItem shape it needs —
 * live in one place.
 *
 * The footer carries a thumbnail-capture checkbox, on by default: when
 * checked, a fresh screenshot of the app is captured and saved as its
 * thumbnail before the move. The label is the only thing that differs with
 * an existing thumbnail — "Replace app thumbnail" instead of "Include app
 * thumbnail" — so the overwrite is explicit. The capture source is the
 * surface's live preview iframe when one exists (`capturePreviewScreenshot`),
 * so the thumbnail shows what the user is looking at; otherwise an invisible
 * `AppIframePreview` of the latest ready version is mounted while the modal
 * is open, so the screenshot-capability handshake is usually done by the
 * time the user confirms.
 */
export const MoveAppToSpaceModal: FC<Props> = ({
    projectUuid,
    app,
    opened,
    onClose,
    onMoved,
    capturePreviewScreenshot,
}) => {
    const queryClient = useQueryClient();
    const { showToastWarning } = useToaster();
    const { mutateAsync: contentAction, isLoading: isMovingToSpace } =
        useContentAction(projectUuid);

    const hasReadyVersion =
        app.latestVersionStatus === 'ready' && !!app.latestVersionNumber;

    // Whether a thumbnail already exists only decides the checkbox label
    // (include vs replace) — a 404 here just means there's none yet. The
    // error guard matters because react-query keeps stale data when a
    // refetch fails.
    const thumbnailQuery = useAppThumbnailUrl(projectUuid, app.uuid, opened);
    const hasThumbnail = !thumbnailQuery.isError && !!thumbnailQuery.data;

    // Checked by default in both cases (null = untouched). The default must
    // not depend on the async hasThumbnail check — a derived default would
    // flip the checkbox under the user when the query resolves.
    const [includeChoice, setIncludeChoice] = useState<boolean | null>(null);
    const includeThumbnail = includeChoice ?? true;

    // Invisible fallback preview of the latest ready version — only mounted
    // when the surface has no live iframe to capture from.
    const useFallbackPreview = !capturePreviewScreenshot;
    const previewOrigin = usePreviewOrigin();
    const { data: previewToken } = useAppPreviewToken(
        opened && hasReadyVersion && useFallbackPreview
            ? projectUuid
            : undefined,
        app.uuid,
        app.latestVersionNumber ?? undefined,
    );
    const previewUrl =
        hasReadyVersion && previewToken
            ? `${previewOrigin}/api/apps/${app.uuid}/versions/${app.latestVersionNumber}/t/${previewToken}/?r=0#transport=postMessage&projectUuid=${projectUuid}`
            : undefined;

    const previewRef = useRef<AppIframePreviewHandle>(null);
    // Ref (not state): only the confirm handler reads it, by polling — no
    // render depends on it.
    const screenshotAvailableRef = useRef(false);
    const handleScreenshotAvailability = useCallback((available: boolean) => {
        screenshotAvailableRef.current = available;
    }, []);

    const [isCapturing, setIsCapturing] = useState(false);
    const { mutateAsync: uploadThumbnail } = useAppThumbnailUpload();

    // Flips when the modal closes (or unmounts — every host renders it
    // conditionally) so an in-flight confirm can bail out. Without it,
    // cancelling mid-capture would keep polling for up to 10s, toast a
    // spurious capture error, and still move the app afterwards.
    const closedRef = useRef(false);
    useEffect(() => {
        closedRef.current = !opened;
    }, [opened]);
    useEffect(
        () => () => {
            closedRef.current = true;
        },
        [],
    );

    const captureFromFallbackPreview = async (): Promise<File> => {
        const deadline = Date.now() + CAPTURE_CAPABILITY_TIMEOUT_MS;
        // Async poll — each iteration yields, so the event loop is never
        // blocked. Bails out as soon as the modal closes.
        while (
            !screenshotAvailableRef.current &&
            !closedRef.current &&
            Date.now() < deadline
        ) {
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        const capture = previewRef.current?.captureScreenshot;
        if (!screenshotAvailableRef.current || !capture) {
            throw new Error(
                "This app version doesn't support screenshot capture — iterate on it once to update it",
            );
        }
        return capture();
    };

    const captureAndUploadThumbnail = async () => {
        setIsCapturing(true);
        try {
            const file = await (capturePreviewScreenshot
                ? capturePreviewScreenshot()
                : captureFromFallbackPreview());
            if (closedRef.current) return;
            await uploadThumbnail({ projectUuid, appUuid: app.uuid, file });
            void queryClient.invalidateQueries({
                queryKey: ['app-thumbnail', projectUuid, app.uuid],
            });
        } catch (err) {
            // Cancelled mid-capture — the failure is expected, stay quiet.
            if (closedRef.current) return;
            // The move is the primary action — a failed capture only warns.
            showToastWarning({
                title: 'Thumbnail not captured',
                subtitle: err instanceof Error ? err.message : 'Unknown error',
            });
        } finally {
            setIsCapturing(false);
        }
    };

    const checkboxTooltip = !hasReadyVersion
        ? 'The app needs a finished build before a thumbnail can be captured.'
        : hasThumbnail
          ? 'Capture a fresh screenshot of the app and replace its current thumbnail as part of the move.'
          : 'Capture a screenshot of the app and save it as its thumbnail as part of the move.';

    return (
        <>
            <TransferItemsModal
                projectUuid={projectUuid}
                opened={opened}
                onClose={onClose}
                items={[
                    {
                        type: ResourceViewItemType.DATA_APP,
                        data: {
                            uuid: app.uuid,
                            name: app.name,
                            description: app.description,
                            spaceUuid: app.spaceUuid,
                            createdByUserUuid: app.createdByUserUuid,
                            updatedAt: new Date(),
                            updatedByUser: null,
                            views: 0,
                            firstViewedAt: null,
                            latestVersionNumber: app.latestVersionNumber,
                            latestVersionStatus: app.latestVersionStatus,
                            pinnedListUuid: null,
                            pinnedListOrder: null,
                        },
                    },
                ]}
                isLoading={isMovingToSpace || isCapturing}
                footer={
                    <Tooltip label={checkboxTooltip} withArrow position="top">
                        <Box>
                            <Checkbox
                                checked={hasReadyVersion && includeThumbnail}
                                disabled={!hasReadyVersion}
                                onChange={(e) =>
                                    setIncludeChoice(e.currentTarget.checked)
                                }
                                label={
                                    hasThumbnail
                                        ? 'Replace app thumbnail'
                                        : 'Include app thumbnail'
                                }
                            />
                        </Box>
                    </Tooltip>
                }
                onConfirm={async (targetSpaceUuid) => {
                    if (!targetSpaceUuid) return;
                    if (hasReadyVersion && includeThumbnail) {
                        await captureAndUploadThumbnail();
                        // Cancelled while capturing — don't move an app the
                        // user backed out of.
                        if (closedRef.current) return;
                    }
                    await contentAction({
                        action: { type: 'move', targetSpaceUuid },
                        item: {
                            uuid: app.uuid,
                            contentType: ContentType.DATA_APP,
                        },
                    });
                    await queryClient.invalidateQueries({
                        queryKey: ['app', projectUuid, app.uuid],
                    });
                    await onMoved?.();
                    onClose();
                }}
            />
            {opened && useFallbackPreview && previewUrl && (
                <Box className={classes.offscreenPreview} aria-hidden>
                    <AppIframePreview
                        ref={previewRef}
                        src={previewUrl}
                        expectedPreviewOrigin={previewOrigin}
                        projectUuid={projectUuid}
                        appUuid={app.uuid}
                        identityKey={`${app.uuid}:move-thumbnail`}
                        onScreenshotAvailabilityChange={
                            handleScreenshotAvailability
                        }
                    />
                </Box>
            )}
        </>
    );
};
