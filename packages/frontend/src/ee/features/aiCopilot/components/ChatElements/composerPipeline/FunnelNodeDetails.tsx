import {
    friendlyName,
    interpolateUiString,
    type FunnelSourceQuery,
    type ItemsMap,
} from '@lightdash/common';
import { Box, Group, Stack, Text } from '@mantine/core';
import {
    IconArrowNarrowRight,
    IconCalendar,
    IconCategory,
    IconListNumbers,
    IconTableExport,
    IconUsers,
} from '@tabler/icons-react';
import { Fragment, type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import ErrorBoundary from '../../../../../../features/errorBoundary/ErrorBoundary';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import chipClasses from '../QueryChip.module.css';
import styles from './FunnelNodeDetails.module.css';
import {
    funnelResultColumnsOf,
    sortedFunnelSteps,
    useWindowPhrase,
} from './funnelNodeLabels';
import { FunnelEventFieldChips, FunnelRangeChip } from './FunnelNodeParts';
import { DetailsRow, FieldChip, OutputChip, RowText } from './NodeDetailsRow';

const StepChip: FC<{ position: number; eventName: string }> = ({
    position,
    eventName,
}) => (
    <Box
        component="span"
        className={chipClasses.chip}
        data-testid="funnel-node-step"
    >
        <Text component="span" fz="xs" c="dimmed" className={styles.stepNumber}>
            {position}
        </Text>
        <Text fz="xs" fw={600} truncate>
            {friendlyName(eventName)}
        </Text>
    </Box>
);

type Props = {
    query: FunnelSourceQuery;
    fieldsMap: ItemsMap;
};

const FunnelNodeRows: FC<Props> = ({ query, fieldsMap }) => {
    const getUiString = useUiStrings();
    const windowPhrase = useWindowPhrase();
    const steps = sortedFunnelSteps(query);

    return (
        <Stack gap={6}>
            <DetailsRow
                icon={IconListNumbers}
                label={getUiString('aiAgent.composer.funnelNode.steps')}
            >
                <Group gap={4}>
                    {steps.map((step, index) => (
                        <Fragment key={step.stepOrder}>
                            {index === 0 ? (
                                <StepChip
                                    position={1}
                                    eventName={step.eventName}
                                />
                            ) : (
                                <Group gap={4} wrap="nowrap" miw={0} maw="100%">
                                    <MantineIcon
                                        icon={IconArrowNarrowRight}
                                        size={12}
                                        color="ldGray.5"
                                        aria-hidden
                                    />
                                    <StepChip
                                        position={index + 1}
                                        eventName={step.eventName}
                                    />
                                </Group>
                            )}
                        </Fragment>
                    ))}
                    <RowText>
                        {interpolateUiString(
                            getUiString('aiAgent.composer.funnelNode.window'),
                            { window: windowPhrase(query) },
                        )}
                    </RowText>
                </Group>
            </DetailsRow>
            <DetailsRow
                icon={IconUsers}
                label={getUiString('aiAgent.composer.funnelNode.source')}
            >
                <Group gap={4}>
                    <FunnelEventFieldChips
                        query={query}
                        fieldsMap={fieldsMap}
                    />
                </Group>
            </DetailsRow>
            <DetailsRow
                icon={IconCalendar}
                label={getUiString('aiAgent.composer.funnelNode.range')}
            >
                <FunnelRangeChip query={query} />
            </DetailsRow>
            {query.breakdownDimensionId && (
                <DetailsRow
                    icon={IconCategory}
                    label={getUiString('aiAgent.composer.funnelNode.breakdown')}
                >
                    <Group gap={4}>
                        <FieldChip
                            fieldId={query.breakdownDimensionId}
                            fieldsMap={fieldsMap}
                            data-testid="funnel-node-breakdown"
                        />
                        <RowText>
                            {getUiString(
                                'aiAgent.composer.funnelNode.breakdownNote',
                            )}
                        </RowText>
                    </Group>
                </DetailsRow>
            )}
            <DetailsRow
                icon={IconTableExport}
                label={getUiString('aiAgent.composer.funnelNode.returns')}
            >
                <Stack gap={4}>
                    <RowText>
                        {getUiString(
                            query.breakdownDimensionId
                                ? 'aiAgent.composer.funnelNode.returnsNoteBreakdown'
                                : 'aiAgent.composer.funnelNode.returnsNote',
                        )}
                    </RowText>
                    <Group gap={4}>
                        {funnelResultColumnsOf(query).map((column) => (
                            <OutputChip key={column}>{column}</OutputChip>
                        ))}
                    </Group>
                </Stack>
            </DetailsRow>
        </Stack>
    );
};

/** Steps, source events, range, breakdown and result columns of a funnel. */
export const FunnelNodeDetails: FC<Props> = (props) => (
    <ErrorBoundary>
        <FunnelNodeRows {...props} />
    </ErrorBoundary>
);
