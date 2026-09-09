import {
    NotificationFrequency,
    type SchedulerAndTargets,
} from '@lightdash/common'; // pragma: allowlist secret
import { Collapse, Group, Stack, Text } from '@mantine/core';
import {
    IconBell,
    IconChevronDown,
    IconChevronRight,
    IconFilter,
    IconVariable,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../../../components/common/PolymorphicGroupButton';
import classes from './SchedulerDeliveryModal.module.css';
import {
    getAlertConditionSummaries,
    getSchedulerFilterSummaries,
    getSchedulerParameterSummaries,
} from './schedulerDetailSummary';

const SUMMARY_PREVIEW_COUNT = 2;

const ConditionSection: FC<{
    icon: typeof IconBell;
    label: string;
    items: string[];
    expandable: boolean;
}> = ({ icon, label, items, expandable }) => {
    const [expanded, setExpanded] = useState(false);
    const extraItems = expandable ? items.slice(SUMMARY_PREVIEW_COUNT) : [];
    const previewItems = extraItems.length
        ? items.slice(0, SUMMARY_PREVIEW_COUNT)
        : items;

    return (
        <Group gap="sm" wrap="nowrap" align="flex-start">
            <MantineIcon icon={icon} size="md" color="ldGray.5" />
            <Stack gap={4}>
                <span className={classes.detailMetaLabel}>{label}</span>
                <Stack gap={2}>
                    {previewItems.map((item) => (
                        <Text key={item} size="sm">
                            {item}
                        </Text>
                    ))}
                </Stack>
                {extraItems.length > 0 && (
                    <>
                        <Collapse in={expanded}>
                            <Stack gap={2}>
                                {extraItems.map((item) => (
                                    <Text key={item} size="sm">
                                        {item}
                                    </Text>
                                ))}
                            </Stack>
                        </Collapse>
                        <PolymorphicGroupButton
                            component="button"
                            type="button"
                            gap={4}
                            wrap="nowrap"
                            w="fit-content"
                            aria-expanded={expanded}
                            onClick={() => setExpanded((value) => !value)}
                        >
                            <Text size="xs" c="dimmed">
                                {expanded
                                    ? 'Show less'
                                    : `and ${extraItems.length} more`}
                            </Text>
                            <MantineIcon
                                icon={
                                    expanded
                                        ? IconChevronDown
                                        : IconChevronRight
                                }
                                size="sm"
                                color="dimmed"
                            />
                        </PolymorphicGroupButton>
                    </>
                )}
            </Stack>
        </Group>
    );
};

type Props = {
    scheduler: SchedulerAndTargets;
};

export const SchedulerDetailConditions: FC<Props> = ({ scheduler }) => {
    const alertSummaries = getAlertConditionSummaries(scheduler.thresholds);
    const filterSummaries = getSchedulerFilterSummaries(scheduler);
    const parameterSummaries = getSchedulerParameterSummaries(
        'parameters' in scheduler ? scheduler.parameters : undefined,
    );

    if (
        alertSummaries.length === 0 &&
        filterSummaries.length === 0 &&
        parameterSummaries.length === 0
    ) {
        return null;
    }

    return (
        <>
            {alertSummaries.length > 0 && (
                <Group gap="sm" wrap="nowrap" align="flex-start">
                    <MantineIcon icon={IconBell} size="md" color="ldGray.5" />
                    <Stack gap={4}>
                        <span className={classes.detailMetaLabel}>Alert</span>
                        <Stack gap={2}>
                            {alertSummaries.map((summary) => (
                                <Text key={summary} size="sm">
                                    {summary}
                                </Text>
                            ))}
                        </Stack>
                        {scheduler.notificationFrequency ===
                            NotificationFrequency.ONCE && (
                            <Text size="xs" c="dimmed">
                                Notifies only once
                            </Text>
                        )}
                    </Stack>
                </Group>
            )}

            {filterSummaries.length > 0 && (
                <ConditionSection
                    icon={IconFilter}
                    label={
                        filterSummaries.length === 1
                            ? '1 filter'
                            : `${filterSummaries.length} filters`
                    }
                    items={filterSummaries}
                    expandable
                />
            )}

            {parameterSummaries.length > 0 && (
                <ConditionSection
                    icon={IconVariable}
                    label={
                        parameterSummaries.length === 1
                            ? '1 parameter'
                            : `${parameterSummaries.length} parameters`
                    }
                    items={parameterSummaries}
                    expandable
                />
            )}
        </>
    );
};
