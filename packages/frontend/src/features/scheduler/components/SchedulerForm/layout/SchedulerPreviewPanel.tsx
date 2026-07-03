import {
    applyDimensionOverrides,
    SchedulerFormat,
    type Dashboard,
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
    IconMail,
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

const EmailMock: FC<{ format: SchedulerFormat; withAi: boolean }> = ({
    format,
    withAi,
}) => {
    const ext = format === SchedulerFormat.XLSX ? 'xlsx' : 'csv';
    return (
        <Paper withBorder radius="md" p="md" bg="var(--mantine-color-body)">
            <Stack gap="sm">
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                    Email preview
                </Text>
                <Text fw={600} size="sm">
                    <MantineIcon
                        icon={IconMail}
                        size="sm"
                        display="inline"
                        style={{ marginRight: 6, marginBottom: -2 }}
                    />
                    Your scheduled delivery
                </Text>
                {withAi && <AiSummaryChip />}
                <Paper
                    radius="sm"
                    h={64}
                    bg="var(--mantine-color-default-hover)"
                />
                <Paper withBorder radius="sm" p="xs">
                    <Text size="xs">
                        <MantineIcon
                            icon={IconPaperclip}
                            size="sm"
                            display="inline"
                            style={{ marginRight: 6, marginBottom: -2 }}
                        />
                        data.{ext}
                    </Text>
                </Paper>
            </Stack>
        </Paper>
    );
};

type Props = {
    dashboard: Dashboard | undefined;
};

export const SchedulerPreviewPanel: FC<Props> = ({ dashboard }) => {
    const form = useSchedulerFormContext();
    const format = form.values.format;
    const isImageLike =
        format === SchedulerFormat.IMAGE || format === SchedulerFormat.PDF;
    const canRender = isImageLike && dashboard !== undefined;
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
                {isImageLike ? (
                    <Stack gap="sm">
                        {withAi && <AiSummaryChip />}
                        {previewUrl ? (
                            <Image
                                src={previewUrl}
                                radius="md"
                                style={{ cursor: 'zoom-in' }}
                                onClick={() => setIsEnlarged(true)}
                            />
                        ) : (
                            <Paper
                                withBorder
                                radius="md"
                                p="md"
                                bg="var(--mantine-color-body)"
                            >
                                <Stack gap="sm">
                                    <Skeleton
                                        height={140}
                                        radius="sm"
                                        animate={
                                            exportDashboardMutation.isLoading
                                        }
                                    />
                                    <Text size="xs" c="dimmed">
                                        {canRender
                                            ? exportDashboardMutation.isLoading
                                                ? 'Rendering your delivery…'
                                                : 'Generate a preview to see exactly what recipients receive.'
                                            : 'Image previews are available for dashboards.'}
                                    </Text>
                                </Stack>
                            </Paper>
                        )}
                    </Stack>
                ) : (
                    <EmailMock format={format} withAi={withAi} />
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
