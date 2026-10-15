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
    Center,
    Image,
    Modal,
    Paper,
    Select,
    Skeleton,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconBell,
    IconChartBar,
    IconFileTypePdf,
    IconPaperclip,
    IconRefresh,
    IconSparkles,
    IconTable,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useExportDashboardContentPreview } from '../../../../../hooks/dashboard/useDashboard';
import { getCustomWidthOptions } from '../../../constants';
import { useSchedulerFormContext } from '../schedulerFormContext';
import classes from './SchedulerDeliveryModal.module.css';
import { THRESHOLD_OPERATOR_KEYS } from './schedulerDetailSummary';
import { SchedulerNextRuns } from './SchedulerNextRuns';

const DEFAULT_WIDTH = '1400';

const AiSummaryChip: FC = () => {
    const { t } = useTranslation('scheduler');
    return (
        <Paper radius="md" p="sm" bg="var(--mantine-color-default-hover)">
            <Stack gap={6}>
                <Text size="xs" fw={600}>
                    <MantineIcon
                        icon={IconSparkles}
                        size="sm"
                        display="inline"
                        style={{ marginRight: 4, marginBottom: -2 }}
                    />
                    {t('preview.aiSummary')}
                </Text>
                <Skeleton height={6} width="90%" animate={false} />
                <Skeleton height={6} width="75%" animate={false} />
                <Skeleton height={6} width="55%" animate={false} />
            </Stack>
        </Paper>
    );
};

const BentoPlaceholder: FC<{ cta?: ReactNode }> = ({ cta }) => (
    <div className={classes.previewBento}>
        {[0, 1, 2, 3].map((tile) => (
            <div key={tile} className={classes.previewBentoTile} />
        ))}
        {cta && <div className={classes.previewBentoCta}>{cta}</div>}
    </div>
);

const AttachmentChip: FC<{ filename: string }> = ({ filename }) => (
    <Paper radius="sm" p="xs">
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

const AlertConditionCard: FC<{
    numericMetrics: Record<
        string,
        TableCalculation | Metric | Field | CustomDimension
    >;
}> = ({ numericMetrics }) => {
    const { t } = useTranslation('scheduler');
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
    const msTeamsCount = form.values.msTeamsTargets?.length || 0;
    const googleChatCount = form.values.googleChatTargets?.length || 0;
    const destinationParts = [
        emailCount > 0 &&
            t('alertSummary.emailRecipients', { count: emailCount }),
        slackCount > 0 &&
            t('alertSummary.slackChannels', { count: slackCount }),
        msTeamsCount > 0 &&
            t('alertSummary.teamsWebhooks', { count: msTeamsCount }),
        googleChatCount > 0 &&
            t('alertSummary.googleChatWebhooks', { count: googleChatCount }),
    ].filter((part): part is string => Boolean(part));
    const destinations =
        destinationParts.length > 1
            ? t('alertSummary.listWithLast', {
                  list: destinationParts
                      .slice(0, -1)
                      .join(t('alertSummary.listSeparator')),
                  last: destinationParts[destinationParts.length - 1],
              })
            : (destinationParts[0] ?? '');

    return (
        <Paper radius="md" p="md" bg="var(--mantine-color-body)">
            <Stack gap="sm">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    {t('alertSummary.title')}
                </Text>
                <Text fw={600} size="sm">
                    <MantineIcon
                        icon={IconBell}
                        size="sm"
                        display="inline"
                        style={{ marginRight: 6, marginBottom: -2 }}
                    />
                    {t('alertSummary.firesWhen')}
                </Text>
                {field && threshold ? (
                    <Text size="sm">
                        <Text span fw={600}>
                            {getItemLabelWithoutTableName(field)}
                        </Text>{' '}
                        {t(THRESHOLD_OPERATOR_KEYS[threshold.operator])}{' '}
                        <Text span fw={600}>
                            {threshold.value}
                            {isPercent ? '%' : ''}
                        </Text>
                    </Text>
                ) : (
                    <Text size="sm" c="dimmed">
                        {t('alertSummary.empty')}
                    </Text>
                )}
                <Text size="xs" c="dimmed">
                    {destinations
                        ? t('alertSummary.notifiedVia', { destinations })
                        : t('alertSummary.addRecipient')}
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
    const { t } = useTranslation('scheduler');
    const form = useSchedulerFormContext();
    const customWidthOptions = useMemo(() => getCustomWidthOptions(t), [t]);
    const format = form.values.format;
    const isDashboard = dashboard !== undefined;
    const isImageLike =
        format === SchedulerFormat.IMAGE || format === SchedulerFormat.PDF;
    const canRender = isImageLike && isDashboard && !isThresholdAlert;
    const withAi = form.values.aiAugmentation !== null;
    const placeholderIcon =
        format === SchedulerFormat.PDF
            ? IconFileTypePdf
            : format === SchedulerFormat.IMAGE
              ? IconChartBar
              : IconTable;

    const exportPreviewMutation = useExportDashboardContentPreview();
    const [previewUrl, setPreviewUrl] = useState<string>();
    const [isEnlarged, setIsEnlarged] = useState(false);

    const widthChoice =
        form.values.customViewportWidth?.toString() ?? DEFAULT_WIDTH;

    const handleGenerate = useCallback(async () => {
        if (!dashboard) return;
        const dashboardFilters = form.values.dashboardFilters
            ? {
                  dimensions: applyDimensionOverrides(
                      dashboard.filters,
                      form.values.dashboardFilters,
                  ),
                  metrics: [],
                  tableCalculations: [],
              }
            : undefined;
        const url = await exportPreviewMutation.mutateAsync({
            dashboard,
            customViewportWidth: parseInt(widthChoice),
            dashboardFilters,
            selectedTabs: form.values.selectedTabs ?? null,
        });
        if (url) setPreviewUrl(url);
    }, [
        dashboard,
        exportPreviewMutation,
        widthChoice,
        form.values.dashboardFilters,
        form.values.selectedTabs,
    ]);

    return (
        <aside className={classes.preview}>
            <div className={classes.previewHeader}>
                <span className={classes.previewLabel}>
                    {t('preview.title')}
                </span>
                {canRender && previewUrl && (
                    <Button
                        variant="subtle"
                        size="compact-xs"
                        leftSection={
                            <MantineIcon icon={IconRefresh} size="sm" />
                        }
                        loading={exportPreviewMutation.isLoading}
                        onClick={handleGenerate}
                    >
                        {t('preview.regenerate')}
                    </Button>
                )}
            </div>
            <div className={classes.previewBody}>
                {isThresholdAlert ? (
                    <AlertConditionCard numericMetrics={numericMetrics} />
                ) : (
                    <Paper radius="md" p="md" bg="var(--mantine-color-body)">
                        <Stack gap="sm">
                            <Text fw={600} size="sm" lineClamp={2}>
                                {form.values.name || t('preview.defaultName')}
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
                                    <Paper
                                        radius="sm"
                                        h={canRender ? 96 : 64}
                                        bg="var(--mantine-color-default-hover)"
                                    >
                                        {isDashboard ? (
                                            <BentoPlaceholder
                                                cta={
                                                    canRender ? (
                                                        <Button
                                                            variant="default"
                                                            size="xs"
                                                            loading={
                                                                exportPreviewMutation.isLoading
                                                            }
                                                            onClick={
                                                                handleGenerate
                                                            }
                                                        >
                                                            {t(
                                                                'preview.generate',
                                                            )}
                                                        </Button>
                                                    ) : undefined
                                                }
                                            />
                                        ) : (
                                            <Center h="100%">
                                                <MantineIcon
                                                    icon={placeholderIcon}
                                                    size="lg"
                                                    color="ldGray.5"
                                                />
                                            </Center>
                                        )}
                                    </Paper>
                                )
                            ) : (
                                <Paper
                                    radius="sm"
                                    h={64}
                                    bg="var(--mantine-color-default-hover)"
                                >
                                    {isDashboard ? (
                                        <BentoPlaceholder />
                                    ) : (
                                        <Center h="100%">
                                            <MantineIcon
                                                icon={placeholderIcon}
                                                size="lg"
                                                color="ldGray.5"
                                            />
                                        </Center>
                                    )}
                                </Paper>
                            )}
                            {(format === SchedulerFormat.CSV ||
                                format === SchedulerFormat.XLSX) &&
                                form.values.options.asAttachment && (
                                    <AttachmentChip
                                        filename={`data.${format}`}
                                    />
                                )}
                            {format === SchedulerFormat.IMAGE &&
                                form.values.options.withPdf && (
                                    <AttachmentChip filename="data.pdf" />
                                )}
                        </Stack>
                    </Paper>
                )}
            </div>
            <SchedulerNextRuns />
            {canRender && (
                <div className={classes.previewFooter}>
                    <Select
                        label={t('preview.renderWidth')}
                        data={customWidthOptions}
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
