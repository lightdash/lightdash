import { Box, Image, UnstyledButton } from '@mantine/core';
import { useIntersection } from '@mantine/hooks';
import { useState, type FC } from 'react';
import { useAppVersionThumbnailUrl } from '../hooks/useAppThumbnail';
import classes from './AppVersionThumbnail.module.css';

/** The app whose version thumbnails a history list shows. */
export type AppVersionThumbnailSource = {
    projectUuid: string;
    appUuid: string;
};

type Props = {
    source: AppVersionThumbnailSource;
    version: number;
    onView: () => void;
};

/**
 * The thumbnail of one version in a history row. The image is requested once
 * the row scrolls into view; its space is held until then so rows do not jump.
 */
const AppVersionThumbnail: FC<Props> = ({ source, version, onView }) => {
    const { ref: frameRef, entry: frameEntry } = useIntersection({
        rootMargin: '200px',
    });
    // Disabling the query off screen keeps its data, so the image stays once loaded.
    const thumbnail = useAppVersionThumbnailUrl(
        source.projectUuid,
        source.appUuid,
        version,
        frameEntry?.isIntersecting === true,
    );
    // A failed refetch keeps stale data, so an error means no thumbnail.
    const thumbnailUrl = thumbnail.isError
        ? null
        : (thumbnail.data?.thumbnailUrl ?? null);
    const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

    if (
        thumbnail.isError ||
        (thumbnailUrl !== null && thumbnailUrl === brokenUrl)
    ) {
        return null;
    }

    return (
        <Box ref={frameRef} className={classes.frame}>
            {thumbnailUrl !== null && (
                <UnstyledButton
                    className={classes.button}
                    aria-label={`View v${version}`}
                    onClick={onView}
                >
                    <Image
                        className={classes.image}
                        h="100%"
                        fit="cover"
                        src={thumbnailUrl}
                        alt={`Thumbnail of v${version}`}
                        onError={() => setBrokenUrl(thumbnailUrl)}
                    />
                </UnstyledButton>
            )}
        </Box>
    );
};

export default AppVersionThumbnail;
