import { friendlyName, type DrillPath } from '@lightdash/common';
import { Anchor, CloseButton, Text } from '@mantine-8/core';
import { IconArrowNarrowRight } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import styles from './DrillDownBreadcrumb.module.css';
import MantineIcon from './MantineIcon';

type DrillLevel = {
    drillPath: DrillPath;
    filterLabels: Record<string, string>;
};

type Props = {
    stack: DrillLevel[];
    onReset: () => void;
    onPopTo: (index: number) => void;
    /** Compact mode: no border, less padding. For dashboard tiles. */
    compact?: boolean;
};

const DrillDownBreadcrumb: FC<Props> = ({
    stack,
    onReset,
    onPopTo,
    compact,
}) => {
    const { track } = useTracking();

    const handleReset = useCallback(() => {
        track({
            name: EventName.DRILL_INTO_BACK_CLICKED,
            properties: { action: 'reset' },
        });
        onReset();
    }, [onReset, track]);

    const handlePopTo = useCallback(
        (index: number) => {
            track({
                name: EventName.DRILL_INTO_BACK_CLICKED,
                properties: { action: 'popTo', level: index },
            });
            onPopTo(index);
        },
        [onPopTo, track],
    );

    return (
        <div
            className={`${styles.breadcrumb} ${compact ? styles.compact : styles.root}`}
        >
            <CloseButton
                size="xs"
                aria-label="Exit drill-down view"
                onClick={handleReset}
                className={styles.closeButton}
            />
            {stack.flatMap((level, index) => {
                const isLast = index === stack.length - 1;
                const filterEntries = Object.entries(level.filterLabels);

                const pairs =
                    filterEntries.length > 0
                        ? filterEntries.map(([fieldId, value]) => {
                              const parts = fieldId.split('_');
                              const name =
                                  parts.length > 1
                                      ? parts.slice(1).join('_')
                                      : fieldId;
                              return {
                                  dim: friendlyName(name),
                                  value,
                              };
                          })
                        : [{ dim: level.drillPath.label, value: '' }];

                const elements = [];

                if (index > 0) {
                    elements.push(
                        <MantineIcon
                            key={`arrow-${level.drillPath.id}`}
                            icon={IconArrowNarrowRight}
                            size={14}
                            color="dimmed"
                            display="inline"
                            className={styles.arrowIcon}
                        />,
                    );
                }

                if (isLast) {
                    pairs.forEach((pair, pairIndex) => {
                        elements.push(
                            <Text
                                key={`${level.drillPath.id}-${pairIndex}`}
                                component="span"
                                fz="xs"
                                c="dimmed"
                            >
                                {pairIndex > 0 && ', '}
                                <Text
                                    fz="xs"
                                    fw={600}
                                    c="foreground"
                                    component="span"
                                >
                                    {pair.dim}
                                </Text>
                                {pair.value ? `: ${pair.value}` : ''}
                            </Text>,
                        );
                    });
                } else {
                    elements.push(
                        <Anchor
                            key={`link-${level.drillPath.id}`}
                            fz="xs"
                            fw={600}
                            component="span"
                            role="button"
                            tabIndex={0}
                            className={styles.inlineAnchor}
                            onClick={() => handlePopTo(index)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handlePopTo(index);
                                }
                            }}
                        >
                            {pairs
                                .map(
                                    (pair) =>
                                        `${pair.dim}${pair.value ? `: ${pair.value}` : ''}`,
                                )
                                .join(', ')}
                        </Anchor>,
                    );
                }

                return elements;
            })}
        </div>
    );
};

export default DrillDownBreadcrumb;
