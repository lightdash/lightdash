import {
    ChartType,
    type CreateSavedChartVersion,
    type UpstreamFieldChangeKind,
    type UpstreamFieldDiff,
} from '@lightdash/common';
import { Button, Center, Group, Loader, Stack, Text } from '@mantine-8/core';
import {
    Icon123,
    IconAbc,
    IconChartBar,
    IconCircle,
    IconColumns,
    IconMinus,
    IconPlus,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../../../hooks/useExplorerRoute';
import styles from './ReviewFieldsModal.module.css';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    fields: UpstreamFieldDiff[];
    isLoading: boolean;
};

const CHANGE_LABEL: Record<UpstreamFieldChangeKind, string> = {
    added: 'Added',
    label_changed: 'Updated',
    removed: 'Removed',
};

const CHANGE_ICON: Record<UpstreamFieldChangeKind, typeof IconPlus> = {
    added: IconPlus,
    label_changed: IconCircle,
    removed: IconMinus,
};

const CHANGE_COLOR: Record<UpstreamFieldChangeKind, string> = {
    added: 'green.7',
    label_changed: 'yellow.7',
    removed: 'red.7',
};

const CHANGE_ORDER: UpstreamFieldChangeKind[] = [
    'added',
    'label_changed',
    'removed',
];

const buildChartVersion = (
    field: UpstreamFieldDiff,
): CreateSavedChartVersion => {
    const fieldId = `${field.tableName}_${field.fieldName}`;
    const isMetric = field.fieldType === 'metric';
    return {
        tableName: field.exploreName,
        metricQuery: {
            exploreName: field.exploreName,
            dimensions: isMetric ? [] : [fieldId],
            metrics: isMetric ? [fieldId] : [],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            customDimensions: [],
        },
        chartConfig: { type: ChartType.TABLE },
        tableConfig: { columnOrder: [] },
        pivotConfig: undefined,
    };
};

const fieldLabel = (field: UpstreamFieldDiff): string =>
    field.previewLabel ?? field.upstreamLabel ?? field.fieldName;

const fieldTypeRank = (field: UpstreamFieldDiff): number => {
    if (field.fieldType === 'dimension') return 0;
    if (field.fieldType === 'metric') return 1;
    return 2;
};

// Dimensions first, then metrics, alphabetical by label within each.
const compareFields = (a: UpstreamFieldDiff, b: UpstreamFieldDiff): number =>
    fieldTypeRank(a) - fieldTypeRank(b) ||
    fieldLabel(a).localeCompare(fieldLabel(b));

export const ReviewFieldsModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    fields,
    isLoading,
}) => {
    const groups = CHANGE_ORDER.map((change) => ({
        change,
        fields: fields
            .filter((field) => field.change === change)
            .sort(compareFields),
    })).filter((group) => group.fields.length > 0);

    const handleCreateChart = (field: UpstreamFieldDiff) => {
        const { pathname, search } = getExplorerUrlFromCreateSavedChartVersion(
            projectUuid,
            buildChartVersion(field),
        );
        window.open(`${pathname}?${search}`, '_blank', 'noopener,noreferrer');
    };

    const renderField = (field: UpstreamFieldDiff) => (
        <div
            key={`${field.exploreName}.${field.tableName}.${field.fieldType}.${field.fieldName}`}
            className={styles.row}
        >
            <MantineIcon
                icon={field.fieldType === 'metric' ? Icon123 : IconAbc}
                size="lg"
                color={field.fieldType === 'metric' ? 'orange.6' : 'blue.6'}
            />
            <Text fz="sm" fw={500} className={styles.label} truncate>
                {fieldLabel(field)}
            </Text>
            {field.change === 'added' && (
                <div className={styles.action}>
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        leftSection={
                            <MantineIcon icon={IconChartBar} size="sm" />
                        }
                        onClick={() => handleCreateChart(field)}
                    >
                        Create chart
                    </Button>
                </div>
            )}
        </div>
    );

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Fields"
            icon={IconColumns}
            size="md"
        >
            {isLoading ? (
                <Center py="xl">
                    <Loader size="md" color="gray" />
                </Center>
            ) : fields.length === 0 ? (
                <Text fz="sm" c="dimmed" py="md">
                    No field changes between this preview and its upstream
                    project.
                </Text>
            ) : (
                <Stack gap="md">
                    {groups.map((group) => (
                        <Stack key={group.change} gap={2}>
                            <Group gap={6} mb={2}>
                                <MantineIcon
                                    icon={CHANGE_ICON[group.change]}
                                    size="sm"
                                    color={CHANGE_COLOR[group.change]}
                                />
                                <Text fz="sm" fw={600}>
                                    {CHANGE_LABEL[group.change]}
                                </Text>
                            </Group>
                            {group.fields.map(renderField)}
                        </Stack>
                    ))}
                </Stack>
            )}
        </MantineModal>
    );
};
