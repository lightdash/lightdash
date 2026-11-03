import {
    friendlyName,
    interpolateUiString,
    type FunnelSourceQuery,
    type ItemsMap,
} from '@lightdash/common';
import { Box, Group, Stack, Text } from '@mantine/core';
import { IconClock } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import {
    funnelMetricColumnsOf,
    sortedFunnelSteps,
    useWindowPhrase,
} from './funnelNodeLabels';
import { FunnelEventFieldChips, FunnelRangeChip } from './FunnelNodeParts';
import styles from './FunnelNodeSpine.module.css';
import { FieldChip } from './NodeDetailsRow';

/** Steps as a numbered spine, stating the window between each pair. */
export const FunnelNodeSpine: FC<{
    query: FunnelSourceQuery;
    fieldsMap: ItemsMap;
}> = ({ query, fieldsMap }) => {
    const getUiString = useUiStrings();
    const windowPhrase = useWindowPhrase();
    const steps = sortedFunnelSteps(query);
    const thenLabel = interpolateUiString(
        getUiString('aiAgent.composer.funnelNode.spine.then'),
        { window: windowPhrase(query) },
    );

    return (
        <Box>
            {steps.map((step, index) => {
                const label = friendlyName(step.eventName);
                const isLast = index === steps.length - 1;
                return (
                    <Box
                        key={step.stepOrder}
                        className={styles.step}
                        data-testid="funnel-spine-step"
                    >
                        <Box className={styles.gutter}>
                            <Box
                                className={styles.circle}
                                data-testid="funnel-spine-circle"
                            >
                                {index + 1}
                            </Box>
                            {!isLast && <Box className={styles.connector} />}
                        </Box>
                        <Box miw={0} pb={isLast ? 0 : 'xs'}>
                            <Group gap={6} wrap="nowrap" miw={0}>
                                <Text
                                    fz="xs"
                                    fw={600}
                                    truncate
                                    className={styles.stepLabel}
                                >
                                    {label}
                                </Text>
                                {label !== step.eventName && (
                                    <Text className={styles.meta} truncate>
                                        {step.eventName}
                                    </Text>
                                )}
                            </Group>
                            {!isLast && (
                                <Group
                                    gap={4}
                                    wrap="nowrap"
                                    className={styles.meta}
                                    data-testid="funnel-spine-then"
                                >
                                    <MantineIcon
                                        icon={IconClock}
                                        size={12}
                                        color="ldGray.5"
                                        aria-hidden
                                    />
                                    <Text span inherit>
                                        {thenLabel}
                                    </Text>
                                </Group>
                            )}
                        </Box>
                    </Box>
                );
            })}
            <Stack gap={6} className={styles.footer}>
                <Group gap={4}>
                    <FunnelEventFieldChips
                        query={query}
                        fieldsMap={fieldsMap}
                    />
                    <FunnelRangeChip query={query} />
                    {query.breakdownDimensionId && (
                        <Group gap={4} wrap="nowrap" miw={0}>
                            <FieldChip
                                fieldId={query.breakdownDimensionId}
                                fieldsMap={fieldsMap}
                                data-testid="funnel-node-breakdown"
                            />
                            <Text component="span" fz="xs" c="dimmed">
                                {getUiString(
                                    'aiAgent.composer.funnelNode.breakdownNote',
                                )}
                            </Text>
                        </Group>
                    )}
                </Group>
                <Text fz="xs" c="dimmed">
                    {interpolateUiString(
                        getUiString(
                            query.breakdownDimensionId
                                ? 'aiAgent.composer.funnelNode.spine.returnsBreakdown'
                                : 'aiAgent.composer.funnelNode.spine.returns',
                        ),
                        { columns: funnelMetricColumnsOf(query).join(', ') },
                    )}
                </Text>
            </Stack>
        </Box>
    );
};
