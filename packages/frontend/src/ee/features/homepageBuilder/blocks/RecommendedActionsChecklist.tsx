import { type HomepageRecommendedActionKey } from '@lightdash/common';
import { ActionIcon, Button, Stack, Tooltip } from '@mantine-8/core';
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
import { useCallback, useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import classes from './blockStyles.module.css';
import {
    RECOMMENDED_ACTION_KEYS,
    SKIPPABLE_ACTION_KEYS,
    writeSkippedActions,
} from './recommendedActionDefaults';
import styles from './RecommendedActionsChecklist.module.css';
import {
    type ActionStatus,
    type RecommendedActionsState,
} from './useRecommendedActions';

type ActionDefinition = {
    icon: Icon;
    title: string;
    subtitle: string;
};

const ACTION_DEFINITIONS: Record<
    HomepageRecommendedActionKey,
    ActionDefinition
> = {
    'connect-warehouse': {
        icon: IconDatabase,
        title: 'Connect a data warehouse',
        subtitle: 'Query your data directly',
    },
    'add-semantic-layer': {
        icon: IconActivity,
        title: 'Add a semantic layer',
        subtitle: 'Answers grounded in your business definitions',
    },
    'connect-source-control': {
        icon: IconGitBranch,
        title: 'Connect source control',
        subtitle: 'Sync dbt models & version control',
    },
    'connect-slack': {
        icon: IconBrandSlack,
        title: 'Connect Slack',
        subtitle: 'Ask Aurora from your channels',
    },
};

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
    const { track } = useTracking();
    const definition = ACTION_DEFINITIONS[actionKey];
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
        <div className={rowClassName} aria-hidden={isBehind}>
            {status.isComplete ? (
                <div className={styles.doneCircle}>
                    <MantineIcon icon={IconCheck} size={16} />
                </div>
            ) : (
                <div className={styles.emptyCircle} />
            )}
            <div
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
            </div>
            <div className={styles.rowBody}>
                <div
                    className={
                        status.isComplete
                            ? `${styles.rowTitle} ${styles.rowTitleDone}`
                            : styles.rowTitle
                    }
                >
                    {definition.title}
                </div>
                <div className={styles.rowSubtitle}>
                    {status.isComplete
                        ? status.annotation
                        : isSkipped
                          ? 'Skipped'
                          : definition.subtitle}
                </div>
            </div>
            {!status.isComplete && isSkipped && (
                <Tooltip label="Restore this step" withinPortal>
                    <ActionIcon
                        className={styles.skipButton}
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label={`Restore ${definition.title}`}
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
                                properties: { actionKey },
                            })
                        }
                    >
                        Set up
                    </Button>
                    {SKIPPABLE_ACTION_KEYS.includes(actionKey) && (
                        <Tooltip label="Skip this step" withinPortal>
                            <ActionIcon
                                className={styles.skipButton}
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label={`Skip ${definition.title}`}
                                onClick={() => onSkip(actionKey)}
                            >
                                <MantineIcon icon={IconX} size={14} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </>
            )}
        </div>
    );
};

export const RecommendedActionsChecklist: FC<{
    projectUuid: string | null;
    actions: RecommendedActionsState;
}> = ({ projectUuid, actions }) => {
    const { track } = useTracking();
    const { statuses, skippedActions, setSkippedActions, visibleActions } =
        actions;
    const [carouselIndex, setCarouselIndex] = useState(0);

    const handleSkip = useCallback(
        (actionKey: HomepageRecommendedActionKey) => {
            setSkippedActions((previous) => {
                if (previous.includes(actionKey)) return previous;
                const next = [...previous, actionKey];
                writeSkippedActions(projectUuid, next);
                return next;
            });
            track({
                name: EventName.HOMEPAGE_RECOMMENDED_ACTION_SKIPPED,
                properties: { actionKey },
            });
        },
        [projectUuid, track, setSkippedActions],
    );

    const handleRestore = useCallback(
        (actionKey: HomepageRecommendedActionKey) => {
            setSkippedActions((previous) => {
                if (!previous.includes(actionKey)) return previous;
                const next = previous.filter((key) => key !== actionKey);
                writeSkippedActions(projectUuid, next);
                // Keep the restored card active — it moves groups, which
                // would otherwise silently change what's on top
                const nextIncomplete = RECOMMENDED_ACTION_KEYS.filter(
                    (key) =>
                        statuses[key].isVisible &&
                        !statuses[key].isComplete &&
                        !next.includes(key),
                );
                setCarouselIndex(
                    Math.max(nextIncomplete.indexOf(actionKey), 0),
                );
                return next;
            });
        },
        [projectUuid, statuses, setSkippedActions],
    );

    if (visibleActions.length === 0) return null;

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

    return (
        <Stack gap={8} className={styles.checklistRoot}>
            <div className={styles.headerRow}>
                <span className={classes.sectionTitle}>Finish setting up</span>
                <div className={styles.headerControls}>
                    {showArrows && (
                        <>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label="Previous step"
                                onClick={() =>
                                    setCarouselIndex(
                                        (activeIndex - 1 + orderedAll.length) %
                                            orderedAll.length,
                                    )
                                }
                            >
                                <MantineIcon icon={IconChevronUp} size={14} />
                            </ActionIcon>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label="Next step"
                                onClick={() =>
                                    setCarouselIndex(
                                        (activeIndex + 1) % orderedAll.length,
                                    )
                                }
                            >
                                <MantineIcon icon={IconChevronDown} size={14} />
                            </ActionIcon>
                        </>
                    )}
                </div>
            </div>
            <div
                className={`${styles.cardStack} ${stackHeightClass(
                    orderedAll.length,
                )}`}
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
            </div>
        </Stack>
    );
};
