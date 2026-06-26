import { Box, Group, Image, Loader, Popover, Text } from '@mantine-8/core';
import { useEffect, useState, type FC, type ReactNode } from 'react';
import { useAppThumbnailUrl } from '../hooks/useAppThumbnail';

type AppThumbnailHoverCardProps = {
    projectUuid: string | undefined;
    appUuid: string;
    appName: string;
    hasReadyVersion: boolean;
    children: ReactNode;
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
    const showEmptyState =
        thumbnail.isError || (thumbnail.isFetched && !thumbnailUrl);
    const showPreview = isLoadingThumbnail || !!thumbnailUrl || showEmptyState;

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
                    {children}
                </Box>
            </Popover.Target>
            {showPreview && (
                <Popover.Dropdown
                    px="sm"
                    py="sm"
                    style={{ pointerEvents: 'none' }}
                >
                    {thumbnailUrl ? (
                        <Image
                            src={thumbnailUrl}
                            alt={appName}
                            w={320}
                            mah={220}
                            fit="contain"
                        />
                    ) : isLoadingThumbnail ? (
                        <Box w={320} h={180} pos="relative">
                            <Group h="100%" justify="center">
                                <Loader size="sm" />
                            </Group>
                        </Box>
                    ) : (
                        <Box w={320} h={120} pos="relative">
                            <Group h="100%" justify="center">
                                <Text c="dimmed" fz="sm" fw={500}>
                                    No thumbnail available
                                </Text>
                            </Group>
                        </Box>
                    )}
                </Popover.Dropdown>
            )}
        </Popover>
    );
};

export default AppThumbnailHoverCard;
