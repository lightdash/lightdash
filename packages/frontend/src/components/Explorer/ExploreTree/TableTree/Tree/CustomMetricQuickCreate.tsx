import {
    applyCustomFormat,
    CustomFormatType,
    friendlyName,
    getItemId,
    MetricType,
    type CustomSqlDimension,
    type Dimension,
} from '@lightdash/common';
import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    explorerActions,
    selectAdditionalMetrics,
    selectMetricQuery,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../../../features/explorer/store';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { useExplore } from '../../../../../hooks/useExplore';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../../types/Events';
import { NumberInput } from '../../../../common/NumberInput';
import {
    buildNewAdditionalMetric,
    getCustomMetricLabelError,
    getInheritedCustomMetricFormat,
} from '../../../CustomMetricModal/utils';
import { describeCustomFormat } from '../../../FormatForm/getFormatSummary';
import { MetricTypeBadge } from '../ItemDetailPreview';

type Props = {
    item: Dimension | CustomSqlDimension;
    type: MetricType;
    onClose: () => void;
};

const SAMPLE_VALUE = 1234.567;
const SAMPLE_RATIO = 0.1234;

const CustomMetricQuickCreate: FC<Props> = ({ item, type, onClose }) => {
    const { t } = useTranslation('explorer');
    const dispatch = useExplorerDispatch();
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const tableName = useExplorerSelector(selectTableName);
    const { data: exploreData } = useExplore(tableName);
    const { showToastSuccess } = useToaster();
    const { track } = useTracking();

    const sourceLabel = 'label' in item ? item.label : item.name;

    const inheritedFormat = useMemo(
        () =>
            getInheritedCustomMetricFormat(
                item,
                type,
                metricQuery.dimensionOverrides?.[getItemId(item)]
                    ?.formatOptions,
            ),
        [item, metricQuery.dimensionOverrides, type],
    );

    const formatSample = useMemo(() => {
        if (!inheritedFormat) return null;
        const sample =
            inheritedFormat.type === CustomFormatType.PERCENT
                ? SAMPLE_RATIO
                : SAMPLE_VALUE;
        return applyCustomFormat(sample, inheritedFormat);
    }, [inheritedFormat]);

    const form = useForm({
        validateInputOnChange: true,
        initialValues: {
            label: t('customMetric.defaultLabel', {
                type: friendlyName(type),
                field: sourceLabel,
            }),
            percentile: 50,
        },
        validate: {
            label: (label) =>
                !label
                    ? t('customMetric.labelRequired')
                    : getCustomMetricLabelError({
                          label,
                          item,
                          isEditing: false,
                          exploreData,
                          additionalMetrics,
                      }),
            percentile: (percentile) =>
                percentile < 0 || percentile > 100
                    ? t('customMetric.percentileRange')
                    : null,
        },
    });

    const handleSubmit = form.onSubmit(({ label, percentile }) => {
        dispatch(
            explorerActions.addAdditionalMetric(
                buildNewAdditionalMetric({
                    item,
                    type,
                    customMetricLabel: label,
                    customMetricFiltersWithIds: [],
                    exploreData,
                    percentile,
                    formatOptions: inheritedFormat,
                }),
            ),
        );
        track({ name: EventName.ADD_CUSTOM_METRIC_CLICKED });
        showToastSuccess({ title: t('customMetric.addedSuccess') });
        onClose();
    });

    const handleMoreOptions = () => {
        dispatch(
            explorerActions.toggleAdditionalMetricModal({
                type,
                item,
                isEditing: false,
                label: form.values.label,
            }),
        );
        onClose();
    };

    return (
        <form onSubmit={handleSubmit}>
            <Stack gap="sm">
                <Group justify="space-between" gap="xs" wrap="nowrap">
                    <Text fz="sm" fw={600}>
                        {t('customMetric.quickCreate.title')}
                    </Text>
                    <MetricTypeBadge type={type} />
                </Group>
                <TextInput
                    label={t('customMetric.label')}
                    size="sm"
                    data-autofocus
                    onFocus={(e) => e.currentTarget.select()}
                    {...form.getInputProps('label')}
                />
                {type === MetricType.PERCENTILE && (
                    <NumberInput
                        label={t('customMetric.percentile')}
                        size="sm"
                        w={100}
                        min={0}
                        max={100}
                        decimalScale={2}
                        {...form.getInputProps('percentile')}
                    />
                )}
                {inheritedFormat && formatSample !== null && (
                    <Group
                        gap="xs"
                        wrap="nowrap"
                        data-testid="quick-create-format"
                    >
                        <Text fz="xs" c="dimmed" flex="0 0 auto">
                            {t('customMetric.quickCreate.format')}
                        </Text>
                        <Text fz="xs" truncate flex={1}>
                            {describeCustomFormat(inheritedFormat)}
                        </Text>
                        <Text fz="xs" c="dimmed" flex="0 0 auto">
                            {formatSample}
                        </Text>
                    </Group>
                )}
                <Group justify="space-between" gap="xs">
                    <Button
                        variant="subtle"
                        size="compact-sm"
                        onClick={handleMoreOptions}
                    >
                        {t('customMetric.quickCreate.moreOptions')}
                    </Button>
                    <Button type="submit" size="sm" disabled={!form.isValid()}>
                        {t('actions.create', { ns: 'common' })}
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};

export default CustomMetricQuickCreate;
