import { Box, Image, Popover, Stack } from '@mantine-8/core';
import { useEffect, useState, type FC, type ReactNode } from 'react';
import { useAppThumbnailUrl } from '../hooks/useAppThumbnail';

type AppThumbnailHoverCardState = {
    hasThumbnailPreview: boolean;
    isLoadingThumbnail: boolean;
};

type AppThumbnailHoverCardProps = {
    projectUuid: string | undefined;
    appUuid: string;
    appName: string;
    hasReadyVersion: boolean;
    children: ReactNode | ((state: AppThumbnailHoverCardState) => ReactNode);
    infoContent?: ReactNode;
    position?: 'right-start' | 'top' | 'bottom' | 'left-start';
    fullWidthTarget?: boolean;
    active?: boolean;
    activateOnClosestRow?: boolean;
};

const AppThumbnailHoverCard: FC<AppThumbnailHoverCardProps> = ({
    projectUuid,
    appUuid,
    appName,
    hasReadyVersion,
    children,
    infoContent,
    position = 'right-start',
    fullWidthTarget = false,
    active,
    activateOnClosestRow = false,
}) => {
    const [targetElement, setTargetElement] = useState<HTMLDivElement | null>(
        null,
    );
    const [isTargetHovered, setIsTargetHovered] = useState(false);
    const [isClosestRowHovered, setIsClosestRowHovered] = useState(false);
    const isActive = active ?? (isClosestRowHovered || isTargetHovered);
    const thumbnail = useAppThumbnailUrl(
        projectUuid,
        appUuid,
        isActive && hasReadyVersion,
    );
    const isLoadingThumbnail = thumbnail.isLoading || thumbnail.isFetching;
    const thumbnailUrl = thumbnail.data?.thumbnailUrl;
    const hasThumbnailPreview = !!thumbnailUrl;
    const showPreview = hasThumbnailPreview;
    const renderedChildren =
        typeof children === 'function'
            ? children({ hasThumbnailPreview, isLoadingThumbnail })
            : children;

    useEffect(() => {
        if (!activateOnClosestRow || !targetElement) return;

        const row = targetElement.closest('tr');
        if (!row) return;

        // mouseenter/mouseleave don't bubble, so they track "pointer is over the
        // row" as a unit without a relatedTarget guard for descendant transitions.
        const onMouseEnter = () => setIsClosestRowHovered(true);
        const onMouseLeave = () => setIsClosestRowHovered(false);

        row.addEventListener('mouseenter', onMouseEnter);
        row.addEventListener('mouseleave', onMouseLeave);
        setIsClosestRowHovered(row.matches(':hover'));

        return () => {
            row.removeEventListener('mouseenter', onMouseEnter);
            row.removeEventListener('mouseleave', onMouseLeave);
        };
    }, [activateOnClosestRow, targetElement]);

    return (
        <Popover
            opened={isActive && showPreview}
            position={position}
            withArrow
            shadow="md"
            withinPortal
        >
            <Popover.Target>
                <Box
                    ref={setTargetElement}
                    display={fullWidthTarget ? 'block' : 'inline-block'}
                    w={fullWidthTarget ? '100%' : undefined}
                    h={fullWidthTarget ? '100%' : undefined}
                    onMouseEnter={() => setIsTargetHovered(true)}
                    onMouseLeave={() => setIsTargetHovered(false)}
                >
                    {renderedChildren}
                </Box>
            </Popover.Target>
            {showPreview && (
                <Popover.Dropdown
                    px="sm"
                    py="sm"
                    style={{ pointerEvents: 'none' }}
                >
                    {thumbnailUrl ? (
                        <Stack gap="sm" w={320}>
                            {infoContent}
                            <Image
                                src={thumbnailUrl}
                                alt={appName}
                                w={320}
                                mah={220}
                                fit="contain"
                            />
                        </Stack>
                    ) : null}
                </Popover.Dropdown>
            )}
        </Popover>
    );
};

export default AppThumbnailHoverCard;
