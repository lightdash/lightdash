import { friendlyName, type DrillPath } from '@lightdash/common';
import {
    Anchor,
    CloseButton,
    Group,
    Text,
} from '@mantine-8/core';
import { IconArrowNarrowRight } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from './MantineIcon';
import styles from './DrillDownBreadcrumb.module.css';

type DrillLevel = {
    drillPath: DrillPath;
    filterLabels: Record<string, string>;
};

type Props = {
    stack: DrillLevel[];
    onReset: () => void;
    onPopTo: (index: number) => void;
    /** Compact mode: no background/border, less padding. For dashboard tiles. */
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
        track({ name: EventName.DRILL_INTO_BACK_CLICKED, properties: { action: 'reset' } });
        onReset();
    }, [onReset, track]);

    const handlePopTo = useCallback(
        (index: number) => {
            track({ name: EventName.DRILL_INTO_BACK_CLICKED, properties: { action: 'popTo', level: index } });
            onPopTo(index);
        },
        [onPopTo, track],
    );

    return (
    <Group
        gap={6}
        p={compact ? 4 : 'xs'}
        className={compact ? undefined : styles.root}
        wrap="nowrap"
    >
        <CloseButton
            size="xs"
            aria-label="Exit drill-into view"
            onClick={handleReset}
        />
        {stack.map((level, index) => {
            const isLast = index === stack.length - 1;
            const filterEntries = Object.entries(level.filterLabels);
            const dimLabel =
                filterEntries.length > 0
                    ? filterEntries
                          .map(([fieldId]) => {
                              const parts = fieldId.split('_');
                              const name =
                                  parts.length > 1
                                      ? parts.slice(1).join('_')
                                      : fieldId;
                              return friendlyName(name);
                          })
                          .join(', ')
                    : level.drillPath.label;
            const valueLabel =
                filterEntries.length > 0
                    ? `: ${filterEntries.map(([, v]) => v).join(', ')}`
                    : '';
            return (
                <Group gap={6} key={level.drillPath.id} wrap="nowrap">
                    {index > 0 && (
                        <MantineIcon
                            icon={IconArrowNarrowRight}
                            size={14}
                            color="dimmed"
                        />
                    )}
                    <Text
                        fz="xs"
                        c="dimmed"
                        style={{ whiteSpace: 'nowrap' }}
                    >
                        {isLast ? (
                            <Text fz="xs" fw={600} c="foreground" component="span">
                                {dimLabel}
                            </Text>
                        ) : (
                            <Anchor
                                fz="xs"
                                fw={600}
                                component="button"
                                type="button"
                                onClick={() => handlePopTo(index)}
                            >
                                {dimLabel}
                            </Anchor>
                        )}
                        {valueLabel}
                    </Text>
                </Group>
            );
        })}
    </Group>
    );
};

export default DrillDownBreadcrumb;
