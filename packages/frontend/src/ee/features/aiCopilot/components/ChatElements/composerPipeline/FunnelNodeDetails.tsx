import {
    assertUnreachable,
    friendlyName,
    interpolateUiString,
    type FunnelConversionWindowUnit,
    type FunnelDatePreset,
    type FunnelDateRange,
    type FunnelSourceQuery,
    type ItemsMap,
    type UiStringKey,
} from '@lightdash/common';
import { Box, Group, Stack, Text } from '@mantine/core';
import {
    IconArrowNarrowRight,
    IconCalendar,
    IconCategory,
    IconListNumbers,
    IconTable,
    IconTableExport,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Fragment, type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import ErrorBoundary from '../../../../../../features/errorBoundary/ErrorBoundary';
import { useUiStrings } from '../../../../../providers/Embed/useUiStrings';
import chipClasses from '../QueryChip.module.css';
import styles from './FunnelNodeDetails.module.css';
import { DetailsRow, FieldChip } from './NodeDetailsRow';
import { ExploreSource } from './notebook/ExploreSource';

dayjs.extend(utc);

const DEFAULT_CONVERSION_WINDOW = { value: 30, unit: 'days' } as const;

/** The columns every funnel result carries, read by downstream nodes. */
const funnelResultColumnsOf = (query: FunnelSourceQuery) => [
    'step_order',
    'step_name',
    'total_users',
    'conversion_rate',
    'step_conversion_rate',
    'median_time_to_convert',
    ...(query.breakdownDimensionId ? ['breakdown_value'] : []),
];

const WINDOW_UNIT_KEYS = {
    hours: {
        singular: 'aiAgent.composer.funnelNode.window.hours.singular',
        plural: 'aiAgent.composer.funnelNode.window.hours.plural',
    },
    days: {
        singular: 'aiAgent.composer.funnelNode.window.days.singular',
        plural: 'aiAgent.composer.funnelNode.window.days.plural',
    },
    weeks: {
        singular: 'aiAgent.composer.funnelNode.window.weeks.singular',
        plural: 'aiAgent.composer.funnelNode.window.weeks.plural',
    },
} as const satisfies Record<
    FunnelConversionWindowUnit,
    { singular: UiStringKey; plural: UiStringKey }
>;

const PRESET_KEYS = {
    last_7_days: 'aiAgent.composer.funnelNode.range.last7Days',
    last_14_days: 'aiAgent.composer.funnelNode.range.last14Days',
    last_30_days: 'aiAgent.composer.funnelNode.range.last30Days',
    last_90_days: 'aiAgent.composer.funnelNode.range.last90Days',
    last_6_months: 'aiAgent.composer.funnelNode.range.last6Months',
    last_12_months: 'aiAgent.composer.funnelNode.range.last12Months',
} as const satisfies Record<Exclude<FunnelDatePreset, 'custom'>, UiStringKey>;

const formatRangeDate = (iso: string) => dayjs.utc(iso).format('D MMM YYYY');

const useRangeLabel = () => {
    const getUiString = useUiStrings();
    return (dateRange: FunnelDateRange) => {
        switch (dateRange.type) {
            case 'preset':
                return getUiString(PRESET_KEYS[dateRange.preset]);
            case 'custom':
                return interpolateUiString(
                    getUiString('aiAgent.composer.funnelNode.range.custom'),
                    {
                        start: formatRangeDate(dateRange.start),
                        end: formatRangeDate(dateRange.end),
                    },
                );
            default:
                return assertUnreachable(dateRange, 'Unknown date range');
        }
    };
};

const RowText: FC<{ children: string }> = ({ children }) => (
    <Text component="span" fz="xs" c="dimmed" className={styles.rowText}>
        {children}
    </Text>
);

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
    projectUuid: string;
};

/** Steps, source events, range, breakdown and result columns of a funnel. */
export const FunnelNodeDetails: FC<Props> = ({
    query,
    fieldsMap,
    projectUuid,
}) => {
    const getUiString = useUiStrings();
    const rangeLabel = useRangeLabel();
    const steps = [...query.steps].sort((a, b) => a.stepOrder - b.stepOrder);
    const conversionWindow =
        query.conversionWindow ?? DEFAULT_CONVERSION_WINDOW;
    const windowKeys = WINDOW_UNIT_KEYS[conversionWindow.unit];
    const windowLabel = interpolateUiString(
        getUiString('aiAgent.composer.funnelNode.window'),
        {
            window: interpolateUiString(
                getUiString(
                    conversionWindow.value === 1
                        ? windowKeys.singular
                        : windowKeys.plural,
                ),
                { count: conversionWindow.value },
            ),
        },
    );
    const eventFields = [
        {
            prefix: getUiString('aiAgent.composer.funnelNode.who'),
            fieldId: query.userIdFieldId,
        },
        {
            prefix: getUiString('aiAgent.composer.funnelNode.when'),
            fieldId: query.timestampFieldId,
        },
        {
            prefix: getUiString('aiAgent.composer.funnelNode.event'),
            fieldId: query.eventNameFieldId,
        },
    ];

    return (
        <Stack gap={6}>
            <ErrorBoundary>
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
                                    <Group
                                        gap={4}
                                        wrap="nowrap"
                                        miw={0}
                                        maw="100%"
                                    >
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
                        <RowText>{windowLabel}</RowText>
                    </Group>
                </DetailsRow>
                <DetailsRow
                    icon={IconTable}
                    label={getUiString('aiAgent.composer.funnelNode.source')}
                >
                    <Group gap={4}>
                        <ExploreSource
                            exploreName={query.exploreName}
                            projectUuid={projectUuid}
                        />
                        {eventFields.map(({ prefix, fieldId }) => (
                            <FieldChip
                                key={prefix}
                                prefix={prefix}
                                fieldId={fieldId}
                                fieldsMap={fieldsMap}
                                data-testid="funnel-node-event-field"
                            />
                        ))}
                    </Group>
                </DetailsRow>
                <DetailsRow
                    icon={IconCalendar}
                    label={getUiString('aiAgent.composer.funnelNode.range')}
                >
                    <Text
                        component="span"
                        fz="xs"
                        fw={500}
                        className={styles.rowText}
                    >
                        {rangeLabel(query.dateRange)}
                    </Text>
                </DetailsRow>
                {query.breakdownDimensionId && (
                    <DetailsRow
                        icon={IconCategory}
                        label={getUiString(
                            'aiAgent.composer.funnelNode.breakdown',
                        )}
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
                    <Group gap={4}>
                        <RowText>
                            {getUiString(
                                query.breakdownDimensionId
                                    ? 'aiAgent.composer.funnelNode.returnsNoteBreakdown'
                                    : 'aiAgent.composer.funnelNode.returnsNote',
                            )}
                        </RowText>
                        {funnelResultColumnsOf(query).map((column) => (
                            <Box
                                key={column}
                                component="span"
                                className={chipClasses.chip}
                                data-testid="funnel-node-column"
                            >
                                {column}
                            </Box>
                        ))}
                    </Group>
                </DetailsRow>
            </ErrorBoundary>
        </Stack>
    );
};
