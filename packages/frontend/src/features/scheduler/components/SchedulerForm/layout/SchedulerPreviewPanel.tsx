import {
    applyDimensionOverrides,
    getItemId,
    getItemLabelWithoutTableName,
    SchedulerFormat,
    ThresholdOperator,
    type CustomDimension,
    type Dashboard,
    type Field,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import {
    Button,
    Image,
    Modal,
    Paper,
    Select,
    Skeleton,
    Stack,
    Text,
} from '@mantine-8/core';
import {
    IconBell,
    IconPaperclip,
    IconRefresh,
    IconSparkles,
} from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useExportDashboard } from '../../../../../hooks/dashboard/useDashboard';
import { CUSTOM_WIDTH_OPTIONS } from '../../../constants';
import { useSchedulerFormContext } from '../schedulerFormContext';
import classes from './SchedulerDeliveryModal.module.css';

const DEFAULT_WIDTH = '1400';

const AiSummaryChip: FC = () => (
    <Paper radius="md" p="sm" bg="var(--mantine-primary-color-light)">
        <Stack gap={6}>
            <Text
                size="xs"
                fw={600}
                c="var(--mantine-primary-color-light-color)"
            >
                <MantineIcon
                    icon={IconSparkles}
                    size="sm"
                    display="inline"
                    style={{ marginRight: 4, marginBottom: -2 }}
                />
                AI summary
            </Text>
            <Skeleton height={6} width="90%" animate={false} />
            <Skeleton height={6} width="75%" animate={false} />
            <Skeleton height={6} width="55%" animate={false} />
        </Stack>
    </Paper>
);

const AttachmentChip: FC<{ filename: string }> = ({ filename }) => (
    <Paper withBorder radius="sm" p="xs">
        <Text size="xs">
            <MantineIcon
                icon={IconPaperclip}
                size="sm"
                display="inline"
                style={{ marginRight: 6, marginBottom: -2 }}
            />
            {filename}
        </Text>
    </Paper>
);

const OPERATOR_TEXT: Record<ThresholdOperator, string> = {
    [ThresholdOperator.GREATER_THAN]: 'is greater than',
    [ThresholdOperator.LESS_THAN]: 'is less than',
    [ThresholdOperator.INCREASED_BY]: 'increased by',
    [ThresholdOperator.DECREASED_BY]: 'decreased by',
};

const AlertConditionCard: FC<{
    numericMetrics: Record<
        string,
        TableCalculation | Metric | Field | CustomDimension
    >;
}> = ({ numericMetrics }) => {
    const form = useSchedulerFormContext();
    const threshold = form.values.thresholds?.[0];
    const field = threshold
        ? Object.values(numericMetrics).find(
              (metric) => getItemId(metric) === threshold.fieldId,
          )
        : undefined;
    const isPercent =
        threshold?.operator === ThresholdOperator.INCREASED_BY ||
        threshold?.operator === ThresholdOperator.DECREASED_BY;

    const emailCount = form.values.emailTargets?.length || 0;
    const slackCount = form.values.slackTargets?.length || 0;
    const destinations = [
        emailCount > 0 &&
            `${emailCount} email recipient${emailCount > 1 ? 's' : ''}`,
        slackCount > 0 &&
            `${slackCount} Slack channel${slackCount > 1 ? 's' : ''}`,
    ]
        .filter(Boolean)
        .join(' and ');

    return (
        <Paper withBorder radius="md" p="md" bg="var(--mantine-color-body)">
            <Stack gap="sm">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    Alert summary
                </Text>
                <Text fw={600} size="sm">
                    <MantineIcon
                        icon={IconBell}
                        size="sm"
                        display="inline"
                        style={{ marginRight: 6, marginBottom: -2 }}
                    />
                    Fires when…
                </Text>
                {field && threshold ? (
                    <Text size="sm">
                        <Text span fw={600}>
                            {getItemLabelWithoutTableName(field)}
                        </Text>{' '}
                        {OPERATOR_TEXT[threshold.operator]}{' '}
                        <Text span fw={600}>
                            {threshold.value}
                            {isPercent ? '%' : ''}
                        </Text>
                    </Text>
                ) : (
                    <Text size="sm" c="dimmed">
                        Pick an alert field and threshold to see the condition
                        here.
                    </Text>
                )}
                <Text size="xs" c="dimmed">
                    {destinations
                        ? `You'll be notified via ${destinations}.`
                        : 'Add a recipient to get notified.'}
                </Text>
            </Stack>
        </Paper>
    );
};

type Props = {
    dashboard: Dashboard | undefined;
    isThresholdAlert?: boolean;
    numericMetrics: Record<
        string,
        TableCalculation | Metric | Field | CustomDimension
    >;
};

export const SchedulerPreviewPanel: FC<Props> = ({
    dashboard,
    isThresholdAlert,
    numericMetrics,
}) => {
    const form = useSchedulerFormContext();
    const format = form.values.format;
    const isImageLike =
        format === SchedulerFormat.IMAGE || format === SchedulerFormat.PDF;
    const canRender =
        isImageLike && dashboard !== undefined && !isThresholdAlert;
    const withAi = form.values.aiAugmentation !== null;

    const exportDashboardMutation = useExportDashboard();
    const [previewUrl, setPreviewUrl] = useState<string>();
    const [isEnlarged, setIsEnlarged] = useState(false);

    const widthChoice =
        form.values.customViewportWidth?.toString() ?? DEFAULT_WIDTH;

    const handleGenerate = useCallback(async () => {
        if (!dashboard) return;
        let queryFilters = '';
        if (form.values.dashboardFilters) {
            const overriddenDimensions = applyDimensionOverrides(
                dashboard.filters,
                form.values.dashboardFilters,
            );
            queryFilters = `?filters=${encodeURIComponent(
                JSON.stringify({
                    dimensions: overriddenDimensions,
                    metrics: [],
                    tableCalculations: [],
                }),
            )}`;
        }
        const url = await exportDashboardMutation.mutateAsync({
            dashboard,
            gridWidth: parseInt(widthChoice),
            queryFilters,
            isPreview: true,
            selectedTabs: form.values.selectedTabs ?? null,
        });
        if (url) setPreviewUrl(url);
    }, [
        dashboard,
        exportDashboardMutation,
        widthChoice,
        form.values.dashboardFilters,
        form.values.selectedTabs,
    ]);

    return (
        <aside className={classes.preview}>
            <div className={classes.previewHeader}>
                <span className={classes.previewLabel}>Live preview</span>
                {canRender && (
                    <Button
                        variant="subtle"
                        size="compact-xs"
                        leftSection={
                            <MantineIcon icon={IconRefresh} size="sm" />
                        }
                        loading={exportDashboardMutation.isLoading}
                        onClick={handleGenerate}
                    >
                        {previewUrl ? 'Regenerate' : 'Generate'}
                    </Button>
                )}
            </div>
            <div className={classes.previewBody}>
                {isThresholdAlert ? (
                    <AlertConditionCard numericMetrics={numericMetrics} />
                ) : (
                    <Paper
                        withBorder
                        radius="md"
                        p="md"
                        bg="var(--mantine-color-body)"
                    >
                        <Stack gap="sm">
                            <Text fw={600} size="sm" lineClamp={2}>
                                {form.values.name || 'Your scheduled delivery'}
                            </Text>
                            {withAi && <AiSummaryChip />}
                            {isImageLike ? (
                                previewUrl ? (
                                    <Image
                                        src={previewUrl}
                                        radius="sm"
                                        style={{ cursor: 'zoom-in' }}
                                        onClick={() => setIsEnlarged(true)}
                                    />
                                ) : (
                                    <>
                                        {exportDashboardMutation.isLoading ? (
                                            <Skeleton height={64} radius="sm" />
                                        ) : (
                                            <Paper
                                                radius="sm"
                                                h={64}
                                                bg="var(--mantine-color-default-hover)"
                                            />
                                        )}
                                        <Text size="xs" c="dimmed">
                                            {canRender
                                                ? exportDashboardMutation.isLoading
                                                    ? 'Rendering your delivery…'
                                                    : 'Generate a preview to see exactly what recipients receive.'
                                                : 'Image previews are available for dashboards.'}
                                        </Text>
                                    </>
                                )
                            ) : (
                                <Paper
                                    radius="sm"
                                    h={64}
                                    bg="var(--mantine-color-default-hover)"
                                />
                            )}
                            {format === SchedulerFormat.CSV &&
                                form.values.options.asAttachment && (
                                    <AttachmentChip filename="data.csv" />
                                )}
                            {format === SchedulerFormat.IMAGE &&
                                form.values.options.withPdf && (
                                    <AttachmentChip filename="data.pdf" />
                                )}
                        </Stack>
                    </Paper>
                )}
            </div>
            {canRender && (
                <div className={classes.previewFooter}>
                    <Select
                        label="Render width"
                        data={CUSTOM_WIDTH_OPTIONS}
                        value={widthChoice}
                        onChange={(value) => {
                            form.setFieldValue(
                                'customViewportWidth',
                                value && value !== DEFAULT_WIDTH
                                    ? parseInt(value)
                                    : undefined,
                            );
                        }}
                        comboboxProps={{ withinPortal: true }}
                    />
                </div>
            )}
            <Modal
                opened={isEnlarged}
                onClose={() => setIsEnlarged(false)}
                size="auto"
                centered
                withCloseButton={false}
            >
                {previewUrl && <Image src={previewUrl} maw="85vw" />}
            </Modal>
        </aside>
    );
};
