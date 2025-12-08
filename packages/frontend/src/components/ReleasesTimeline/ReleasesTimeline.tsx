import { type Release, type ReleaseItem } from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Group,
    Loader,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { forwardRef, useCallback, useEffect, useRef, type FC } from 'react';
import {
    flattenReleasesPages,
    useReleasesInfinite,
} from '../../hooks/useReleasesTimeline';
import MantineIcon from '../common/MantineIcon';
import styles from './ReleasesTimeline.module.css';

/**
 * Maps change type to badge color - minimal palette
 * Only breaking changes get color emphasis (orange) for safety visibility
 */
const getTypeColor = (type: string): string => {
    if (type.toLowerCase() === 'breaking') {
        return 'orange';
    }
    return 'gray';
};

/**
 * Formats a type string for display
 */
const formatType = (type: string): string => {
    switch (type.toLowerCase()) {
        case 'feat':
            return 'Feature';
        case 'fix':
            return 'Bug Fix';
        case 'breaking':
            return 'Breaking';
        case 'perf':
            return 'Performance';
        case 'docs':
            return 'Docs';
        case 'refactor':
            return 'Refactor';
        case 'chore':
            return 'Chore';
        default:
            return type.charAt(0).toUpperCase() + type.slice(1);
    }
};

/**
 * Formats a date for display
 */
const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};

type ReleaseItemRowProps = {
    item: ReleaseItem;
};

const ReleaseItemRow: FC<ReleaseItemRowProps> = ({ item }) => {
    return (
        <div className={styles.changeItem}>
            <Badge size="xs" color={getTypeColor(item.type)} variant="light">
                {formatType(item.type)}
            </Badge>
            {item.scope && (
                <Badge size="xs" variant="outline" color="gray">
                    {item.scope}
                </Badge>
            )}
            <Text className={styles.changeDescription}>{item.description}</Text>
            {item.prUrl && item.prNumber && (
                <Anchor
                    href={item.prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.prLink}
                >
                    #{item.prNumber}
                    <MantineIcon icon={IconExternalLink} size={10} />
                </Anchor>
            )}
        </div>
    );
};

type ReleaseCardProps = {
    release: Release;
    isLatest: boolean;
};

const ReleaseCard = forwardRef<HTMLDivElement, ReleaseCardProps>(
    ({ release, isLatest }, ref) => {
        const itemClassName = [
            styles.releaseItem,
            release.isCurrent ? styles.current : '',
        ]
            .filter(Boolean)
            .join(' ');

        const cardClassName = [
            styles.releaseCard,
            release.isCurrent ? styles.current : '',
        ]
            .filter(Boolean)
            .join(' ');

        return (
            <div ref={ref} className={itemClassName}>
                <div className={cardClassName}>
                    <div className={styles.releaseHeader}>
                        <Anchor
                            href={release.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.versionLink}
                        >
                            v{release.version}
                        </Anchor>
                        {release.isCurrent && (
                            <Badge color="dark" size="sm" variant="filled">
                                Current
                            </Badge>
                        )}
                        {isLatest && (
                            <Badge color="dark" size="sm" variant="outline">
                                Latest
                            </Badge>
                        )}
                        <Text className={styles.releaseDate}>
                            {formatDate(release.publishedAt)}
                        </Text>
                    </div>

                    {release.items.length > 0 ? (
                        <div className={styles.itemsList}>
                            {release.items.map((item, index) => (
                                <ReleaseItemRow
                                    key={`${release.version}-${index}`}
                                    item={item}
                                />
                            ))}
                        </div>
                    ) : (
                        <Text size="sm" c="dimmed">
                            No changes documented
                        </Text>
                    )}
                </div>
            </div>
        );
    },
);

export const ReleasesTimeline: FC = () => {
    const {
        data,
        fetchNextPage,
        fetchPreviousPage,
        hasNextPage,
        hasPreviousPage,
        isFetchingNextPage,
        isFetchingPreviousPage,
        isLoading,
        isError,
        error,
    } = useReleasesInfinite();

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const topTriggerRef = useRef<HTMLDivElement>(null);
    const bottomTriggerRef = useRef<HTMLDivElement>(null);
    const currentVersionRef = useRef<HTMLDivElement>(null);
    const hasScrolledToCurrentRef = useRef(false);

    const { releases, currentVersion, currentVersionFound } =
        flattenReleasesPages(data?.pages);

    // Scroll to current version on initial load
    useEffect(() => {
        if (
            !hasScrolledToCurrentRef.current &&
            currentVersionRef.current &&
            releases.length > 0
        ) {
            hasScrolledToCurrentRef.current = true;
            // Use setTimeout to ensure the DOM has fully rendered
            setTimeout(() => {
                currentVersionRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                });
            }, 100);
        }
    }, [releases.length]);

    // Infinite scroll observers
    const handleTopIntersection = useCallback(
        (entries: IntersectionObserverEntry[]) => {
            const [entry] = entries;
            if (
                entry.isIntersecting &&
                hasPreviousPage &&
                !isFetchingPreviousPage
            ) {
                void fetchPreviousPage();
            }
        },
        [hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage],
    );

    const handleBottomIntersection = useCallback(
        (entries: IntersectionObserverEntry[]) => {
            const [entry] = entries;
            if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
                void fetchNextPage();
            }
        },
        [hasNextPage, isFetchingNextPage, fetchNextPage],
    );

    // Set up intersection observers
    useEffect(() => {
        const topObserver = new IntersectionObserver(handleTopIntersection, {
            root: scrollContainerRef.current,
            threshold: 0.1,
        });

        const bottomObserver = new IntersectionObserver(
            handleBottomIntersection,
            {
                root: scrollContainerRef.current,
                threshold: 0.1,
            },
        );

        if (topTriggerRef.current) {
            topObserver.observe(topTriggerRef.current);
        }
        if (bottomTriggerRef.current) {
            bottomObserver.observe(bottomTriggerRef.current);
        }

        return () => {
            topObserver.disconnect();
            bottomObserver.disconnect();
        };
    }, [handleTopIntersection, handleBottomIntersection]);

    if (isLoading) {
        return (
            <div className={styles.container}>
                <Stack align="center" justify="center" h="100%">
                    <Loader size="lg" />
                    <Text c="dimmed">Loading releases...</Text>
                </Stack>
            </div>
        );
    }

    if (isError) {
        return (
            <div className={styles.container}>
                <Stack align="center" justify="center" h="100%">
                    <Title order={3} c="red">
                        Error loading releases
                    </Title>
                    <Text c="dimmed">
                        {error?.error?.message ??
                            'An unexpected error occurred'}
                    </Text>
                </Stack>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <Title order={2}>Release History</Title>
                <Group position="center" spacing="xs" mt="xs">
                    <Text c="dimmed">Current version:</Text>
                    <Badge size="lg" color="dark" variant="filled">
                        v{currentVersion}
                    </Badge>
                    {!currentVersionFound && (
                        <Badge size="sm" color="yellow" variant="light">
                            Not in releases (dev build?)
                        </Badge>
                    )}
                </Group>
            </div>

            <Box ref={scrollContainerRef} className={styles.scrollArea}>
                {/* Top loading indicator / trigger */}
                <div ref={topTriggerRef} className={styles.scrollTrigger} />
                {isFetchingPreviousPage && (
                    <div className={styles.loadingIndicator}>
                        <Loader size="sm" />
                    </div>
                )}
                {hasPreviousPage && !isFetchingPreviousPage && (
                    <Text ta="center" c="dimmed" size="sm" mb="md">
                        ↑ Scroll up for newer releases
                    </Text>
                )}

                {/* Timeline */}
                {releases.length > 0 ? (
                    <div className={styles.timeline}>
                        {releases.map((release, index) => (
                            <ReleaseCard
                                key={release.version}
                                ref={
                                    release.isCurrent
                                        ? currentVersionRef
                                        : undefined
                                }
                                release={release}
                                isLatest={index === 0 && !hasPreviousPage}
                            />
                        ))}
                    </div>
                ) : (
                    <div className={styles.emptyState}>
                        <Text>No releases found</Text>
                    </div>
                )}

                {/* Bottom loading indicator / trigger */}
                {isFetchingNextPage && (
                    <div className={styles.loadingIndicator}>
                        <Loader size="sm" />
                    </div>
                )}
                {hasNextPage && !isFetchingNextPage && (
                    <Text ta="center" c="dimmed" size="sm" mt="md">
                        ↓ Scroll down for older releases
                    </Text>
                )}
                <div ref={bottomTriggerRef} className={styles.scrollTrigger} />
            </Box>
        </div>
    );
};
