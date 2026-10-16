import {
    SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS,
    type HomepageRecommendedActionKey,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Skeleton,
    Stack,
    Tooltip,
} from '@mantine/core';
import {
    IconActivity,
    IconArrowBackUp,
    IconBrandSlack,
    IconCheck,
    IconChevronDown,
    IconChevronRight,
    IconChevronUp,
    IconDatabase,
    IconGitBranch,
    IconX,
    type Icon,
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import classes from './blockStyles.module.css';
import { RECOMMENDED_ACTION_KEYS } from './recommendedActionDefaults';
import styles from './RecommendedActionsChecklist.module.css';
import {
    type ActionStatus,
    type RecommendedActionsState,
} from './useRecommendedActions';

// Connecting a warehouse gates everything else — skipping it would strand
// the user with nothing to query.
const isSkippableActionKey = (key: HomepageRecommendedActionKey): boolean =>
    (
        SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS as readonly HomepageRecommendedActionKey[]
    ).includes(key);

type ActionDefinition = {
    icon: Icon;
    titleKey: string;
    subtitleKey: string;
};

const ACTION_DEFINITIONS: Record<
    HomepageRecommendedActionKey,
    ActionDefinition
> = {
    'connect-warehouse': {
        icon: IconDatabase,
        titleKey: 'checklist.actions.connectWarehouse.title',
        subtitleKey: 'checklist.actions.connectWarehouse.subtitle',
    },
    'add-semantic-layer': {
        icon: IconActivity,
        titleKey: 'checklist.actions.addSemanticLayer.title',
        subtitleKey: 'checklist.actions.addSemanticLayer.subtitle',
    },
    'connect-source-control': {
        icon: IconGitBranch,
        titleKey: 'checklist.actions.connectSourceControl.title',
        subtitleKey: 'checklist.actions.connectSourceControl.subtitle',
    },
    'connect-slack': {
        icon: IconBrandSlack,
        titleKey: 'checklist.actions.connectSlack.title',
        subtitleKey: 'checklist.actions.connectSlack.subtitle',
    },
};

const AUTO_ROTATE_INTERVAL_MS = 10_000;

const POSITION_CLASSES = [styles.pos0, styles.pos1, styles.pos2, styles.pos3];
const STACK_HEIGHT_CLASSES = [
    styles.stackHeight1,
    styles.stackHeight2,
    styles.stackHeight3,
    styles.stackHeight4,
];

const depthClass = (depth: number) =>
    POSITION_CLASSES[Math.min(depth, POSITION_CLASSES.length - 1)];

const stackHeightClass = (count: number) =>
    STACK_HEIGHT_CLASSES[Math.min(count, STACK_HEIGHT_CLASSES.length) - 1];

const ActionRow: FC<{
    actionKey: HomepageRecommendedActionKey;
    status: ActionStatus;
    isSkipped: boolean;
    onSkip: (actionKey: HomepageRecommendedActionKey) => void;
    onRestore: (actionKey: HomepageRecommendedActionKey) => void;
    className?: string;
    isBehind: boolean;
}> = ({
    actionKey,
    status,
    isSkipped,
    onSkip,
    onRestore,
    className,
    isBehind,
}) => {
    const { t } = useTranslation('homepageBuilder');
    const { track } = useTracking();
    const definition = ACTION_DEFINITIONS[actionKey];
    const title = t(definition.titleKey);
    const rowClassName = [
        styles.actionRow,
        status.isComplete ? styles.actionRowDone : null,
        !status.isComplete && isSkipped ? styles.actionRowSkipped : null,
        isBehind ? styles.cardBehind : null,
        className,
    ]
        .filter(Boolean)
        .join(' ');
    return (
        <Box className={rowClassName} aria-hidden={isBehind}>
            {status.isComplete ? (
                <Box className={styles.doneCircle}>
                    <MantineIcon icon={IconCheck} size={16} />
                </Box>
            ) : (
                <Box className={styles.emptyCircle} />
            )}
            <Box
                className={
                    status.isComplete
                        ? `${styles.iconTile} ${styles.iconTileDone}`
                        : styles.iconTile
                }
            >
                {status.isComplete && status.doneIcon ? (
                    status.doneIcon
                ) : (
                    <MantineIcon icon={definition.icon} size={22} />
                )}
            </Box>
            <Box className={styles.rowBody}>
                <Box
                    className={
                        status.isComplete
                            ? `${styles.rowTitle} ${styles.rowTitleDone}`
                            : styles.rowTitle
                    }
                >
                    {title}
                </Box>
                <Box className={styles.rowSubtitle}>
                    {status.isComplete
                        ? status.annotation
                        : isSkipped
                          ? t('checklist.skipped')
                          : t(definition.subtitleKey)}
                </Box>
            </Box>
            {!status.isComplete && isSkipped && (
                <Tooltip label={t('checklist.restoreStep')}>
                    <ActionIcon
                        className={styles.skipButton}
                        size="sm"
                        aria-label={t('checklist.restoreAria', { title })}
                        onClick={() => onRestore(actionKey)}
                    >
                        <MantineIcon icon={IconArrowBackUp} size={14} />
                    </ActionIcon>
                </Tooltip>
            )}
            {!status.isComplete && !isSkipped && (
                <>
                    <Button
                        component={Link}
                        to={status.url}
                        variant="subtle"
                        size="compact-sm"
                        rightSection={
                            <MantineIcon icon={IconChevronRight} size={14} />
                        }
                        onClick={() =>
                            track({
                                name: EventName.HOMEPAGE_RECOMMENDED_ACTION_CLICKED,
                                properties: {
                                    actionKey,
                                    destination: status.url,
                                },
                            })
                        }
                    >
                        {status.ctaLabel}
                    </Button>
                    {isSkippableActionKey(actionKey) && (
                        <Tooltip label={t('checklist.skipStep')}>
                            <ActionIcon
                                className={styles.skipButton}
                                size="sm"
                                aria-label={t('checklist.skipAria', { title })}
                                onClick={() => onSkip(actionKey)}
                            >
                                <MantineIcon icon={IconX} size={14} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </>
            )}
        </Box>
    );
};

// Which steps exist is known from health and the project id, long before any
// of them can say whether they are done — so the hold can reserve the exact
// height the resolved stack will take, and the cards fill in without shifting
// anything above them.
export const RecommendedActionsChecklistPlaceholder: FC<{
    actionCount: number;
}> = ({ actionCount }) => {
    const { t } = useTranslation('homepageBuilder');
    if (actionCount === 0) return null;
    return (
        <Stack gap={8} className={styles.checklistRoot}>
            <Box className={styles.headerRow}>
                <span className={classes.sectionTitle}>
                    {t('checklist.title')}
                </span>
            </Box>
            <Box
                className={`${styles.cardStack} ${stackHeightClass(
                    actionCount,
                )}`}
            >
                <Skeleton className={styles.stackCard} h={68} radius={10} />
            </Box>
        </Stack>
    );
};

export const RecommendedActionsChecklist: FC<{
    actions: RecommendedActionsState;
}> = ({ actions }) => {
    const { t } = useTranslation('homepageBuilder');
    const { track, data: trackingData } = useTracking();
    const isTrackingReady = !!trackingData.rudder;
    const {
        statuses,
        skippedActions,
        skipAction,
        restoreAction,
        visibleActions,
    } = actions;
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [isStackHovered, setIsStackHovered] = useState(false);

    const handleSkip = useCallback(
        (actionKey: HomepageRecommendedActionKey) => {
            if (skippedActions.includes(actionKey)) return;
            const oldIncomplete = RECOMMENDED_ACTION_KEYS.filter(
                (key) =>
                    statuses[key].isVisible &&
                    !statuses[key].isComplete &&
                    !skippedActions.includes(key),
            );
            const skippedPosition = oldIncomplete.indexOf(actionKey);
            const nextIncomplete = oldIncomplete.filter(
                (key) => key !== actionKey,
            );
            setCarouselIndex(
                nextIncomplete.length > 0 && skippedPosition >= 0
                    ? skippedPosition % nextIncomplete.length
                    : 0,
            );
            skipAction(actionKey);
            track({
                name: EventName.HOMEPAGE_RECOMMENDED_ACTION_SKIPPED,
                properties: { actionKey },
            });
        },
        [skipAction, skippedActions, statuses, track],
    );

    const handleRestore = useCallback(
        (actionKey: HomepageRecommendedActionKey) => {
            if (!skippedActions.includes(actionKey)) return;
            const next = skippedActions.filter((key) => key !== actionKey);
            const nextIncomplete = RECOMMENDED_ACTION_KEYS.filter(
                (key) =>
                    statuses[key].isVisible &&
                    !statuses[key].isComplete &&
                    !next.includes(key),
            );
            setCarouselIndex(Math.max(nextIncomplete.indexOf(actionKey), 0));
            restoreAction(actionKey);
            track({
                name: EventName.HOMEPAGE_RECOMMENDED_ACTION_RESTORED,
                properties: { actionKey },
            });
        },
        [restoreAction, skippedActions, statuses, track],
    );

    const isSkipped = (key: HomepageRecommendedActionKey) =>
        skippedActions.includes(key) && !statuses[key].isComplete;
    const doneActions = visibleActions.filter(
        (key) => statuses[key].isComplete,
    );
    const skippedList = visibleActions.filter(isSkipped);
    const incompleteActions = visibleActions.filter(
        (key) => !statuses[key].isComplete && !isSkipped(key),
    );

    // Pending first, then skipped, then done at the back — all cyclable
    const orderedAll = [...incompleteActions, ...skippedList, ...doneActions];

    // Clamped rather than synced, so a shrinking list can't strand the index
    const activeIndex = Math.min(
        carouselIndex,
        Math.max(orderedAll.length - 1, 0),
    );
    const showArrows = orderedAll.length > 1;

    // Active card first, everything else in cycle order
    const carouselOrder = [
        ...orderedAll.slice(activeIndex),
        ...orderedAll.slice(0, activeIndex),
    ];

    const rotatableCount = incompleteActions.length;

    const impressionTriggerRef = useRef<'initial' | 'auto_rotate' | 'manual'>(
        'initial',
    );
    const lastImpressionKeyRef = useRef<string | null>(null);
    const frontActionKey = orderedAll[activeIndex];

    useEffect(() => {
        if (isStackHovered || rotatableCount <= 1) return;
        const timeout = setTimeout(() => {
            impressionTriggerRef.current = 'auto_rotate';
            setCarouselIndex((activeIndex + 1) % rotatableCount);
        }, AUTO_ROTATE_INTERVAL_MS);
        return () => clearTimeout(timeout);
    }, [activeIndex, isStackHovered, rotatableCount]);

    useEffect(() => {
        if (!isTrackingReady || !frontActionKey) return;
        if (lastImpressionKeyRef.current === frontActionKey) return;
        lastImpressionKeyRef.current = frontActionKey;
        track({
            name: EventName.HOMEPAGE_RECOMMENDED_ACTION_IMPRESSION,
            properties: {
                actionKey: frontActionKey,
                position: activeIndex,
                trigger: impressionTriggerRef.current,
            },
        });
        impressionTriggerRef.current = 'initial';
    }, [isTrackingReady, frontActionKey, activeIndex, track]);

    if (visibleActions.length === 0) return null;

    return (
        <Stack gap={8} className={styles.checklistRoot}>
            <Box className={styles.headerRow}>
                <span className={classes.sectionTitle}>
                    {t('checklist.title')}
                </span>
                <Box className={styles.headerControls}>
                    {showArrows && (
                        <>
                            <ActionIcon
                                size="sm"
                                aria-label={t('checklist.previousStep')}
                                onClick={() => {
                                    impressionTriggerRef.current = 'manual';
                                    setCarouselIndex(
                                        (activeIndex - 1 + orderedAll.length) %
                                            orderedAll.length,
                                    );
                                }}
                            >
                                <MantineIcon icon={IconChevronUp} size={14} />
                            </ActionIcon>
                            <ActionIcon
                                size="sm"
                                aria-label={t('checklist.nextStep')}
                                onClick={() => {
                                    impressionTriggerRef.current = 'manual';
                                    setCarouselIndex(
                                        (activeIndex + 1) % orderedAll.length,
                                    );
                                }}
                            >
                                <MantineIcon icon={IconChevronDown} size={14} />
                            </ActionIcon>
                        </>
                    )}
                </Box>
            </Box>
            <Box
                className={`${styles.cardStack} ${stackHeightClass(
                    orderedAll.length,
                )}`}
                onMouseEnter={() => setIsStackHovered(true)}
                onMouseLeave={() => setIsStackHovered(false)}
            >
                {/* Fixed render order keeps DOM nodes put; depth classes do the shuffling */}
                {visibleActions.map((key) => {
                    const depth = carouselOrder.indexOf(key);
                    return (
                        <ActionRow
                            key={key}
                            actionKey={key}
                            status={statuses[key]}
                            isSkipped={isSkipped(key)}
                            onSkip={handleSkip}
                            onRestore={handleRestore}
                            isBehind={depth > 0}
                            className={`${styles.stackCard} ${
                                styles.animatedCard
                            } ${depthClass(depth)}`}
                        />
                    );
                })}
            </Box>
        </Stack>
    );
};
