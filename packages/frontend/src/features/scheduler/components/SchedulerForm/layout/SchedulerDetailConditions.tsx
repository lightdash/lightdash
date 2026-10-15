import {
    NotificationFrequency,
    type SchedulerAndTargets,
} from '@lightdash/common'; // pragma: allowlist secret
import { Collapse, Group, Paper, Stack, Text } from '@mantine/core';
import {
    IconBell,
    IconChevronDown,
    IconChevronRight,
    IconFilter,
    IconVariable,
    type Icon,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { PolymorphicGroupButton } from '../../../../../components/common/PolymorphicGroupButton';
import classes from './SchedulerDeliveryModal.module.css';
import {
    getAlertConditionSummaries,
    getSchedulerFilterSummaries,
    getSchedulerParameterSummaries,
    type ConditionSummary,
} from './schedulerDetailSummary';

const SUMMARY_PREVIEW_COUNT = 2;

const conditionKey = (condition: ConditionSummary): string =>
    `${condition.field}|${condition.operator}|${condition.value}`;

const ConditionPart: FC<{ children: string; emphasis?: boolean }> = ({
    children,
    emphasis,
}) => (
    <Paper radius="xl" px="xs" py={2}>
        <Text size="xs" fw={emphasis ? 600 : 500}>
            {children}
        </Text>
    </Paper>
);

const ConditionRow: FC<{ condition: ConditionSummary }> = ({ condition }) => (
    <Group gap={6} wrap="wrap">
        <ConditionPart>{condition.field}</ConditionPart>
        <Text size="xs" c="dimmed">
            {condition.operator}
        </Text>
        {condition.value && (
            <ConditionPart emphasis>{condition.value}</ConditionPart>
        )}
    </Group>
);

const ConditionSection: FC<{
    icon: Icon;
    label: string;
    items: ConditionSummary[];
    expandable: boolean;
    footnote?: string;
}> = ({ icon, label, items, expandable, footnote }) => {
    const { t } = useTranslation('scheduler');
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
                <Stack gap={6}>
                    {previewItems.map((item) => (
                        <ConditionRow
                            key={conditionKey(item)}
                            condition={item}
                        />
                    ))}
                </Stack>
                {extraItems.length > 0 && (
                    <>
                        <Collapse expanded={expanded}>
                            <Stack gap={6}>
                                {extraItems.map((item) => (
                                    <ConditionRow
                                        key={conditionKey(item)}
                                        condition={item}
                                    />
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
                                    ? t('detail.showLess')
                                    : t('detail.andMore', {
                                          count: extraItems.length,
                                      })}
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
                {footnote && (
                    <Text size="xs" c="dimmed">
                        {footnote}
                    </Text>
                )}
            </Stack>
        </Group>
    );
};

type Props = {
    scheduler: SchedulerAndTargets;
};

export const SchedulerDetailConditions: FC<Props> = ({ scheduler }) => {
    const { t } = useTranslation('scheduler');
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
                <ConditionSection
                    icon={IconBell}
                    label={t('detail.alert')}
                    items={alertSummaries}
                    expandable={false}
                    footnote={
                        scheduler.notificationFrequency ===
                        NotificationFrequency.ONCE
                            ? t('detail.notifiesOnce')
                            : undefined
                    }
                />
            )}

            {filterSummaries.length > 0 && (
                <ConditionSection
                    icon={IconFilter}
                    label={t('detail.filterCount', {
                        count: filterSummaries.length,
                    })}
                    items={filterSummaries}
                    expandable
                />
            )}

            {parameterSummaries.length > 0 && (
                <ConditionSection
                    icon={IconVariable}
                    label={t('detail.parameterCount', {
                        count: parameterSummaries.length,
                    })}
                    items={parameterSummaries}
                    expandable
                />
            )}
        </>
    );
};
