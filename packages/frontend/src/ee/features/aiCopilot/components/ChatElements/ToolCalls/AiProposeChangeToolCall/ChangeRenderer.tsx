import {
    assertUnreachable,
    friendlyName,
    getItemColor,
    type Change,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Code,
    Collapse,
    Group,
    Paper,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import toPairs from 'lodash/toPairs';
import FieldIcon from '../../../../../../../components/common/Filters/FieldIcon';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { OperationRenderer } from './OperationRenderer';
import { FieldBreadcrumb, TableBreadcrumb } from './SupportElements';
import type {
    DimensionChange,
    EntityChange,
    MetricChange,
    TableChange,
    UpdateDimensionPatch,
    UpdateMetricPatch,
    UpdateTablePatch,
} from './types';

// ============================================================================
// Unified Update Change Component
// ============================================================================

type UpdateChangeProps = {
    patch: UpdateTablePatch | UpdateDimensionPatch | UpdateMetricPatch;
};

const UpdateChange = ({ patch }: UpdateChangeProps) => {
    const operations = toPairs(patch)
        .filter(([, op]) => op !== null)
        .map(([property, op]) => ({ property, op: op! }));

    return (
        <Stack gap="xs" px="xs">
            {operations.map(({ property, op }) => (
                <OperationRenderer
                    key={property}
                    operation={op}
                    property={property}
                />
            ))}
        </Stack>
    );
};

// ============================================================================
// Metric Creation Component (from compiled changeData)
// ============================================================================

type CreateMetricFromChangeDataProps = {
    changeData: Extract<Change, { type: 'create' }>;
};

const CreateMetricFromChangeData = ({
    changeData,
}: CreateMetricFromChangeDataProps) => {
    const [opened, { toggle }] = useDisclosure(false);

    // Extract metric from the backend's compiled change data
    if (changeData.payload.type !== 'metric') {
        return null;
    }

    const metric = changeData.payload.value;
    const color = getItemColor(metric);

    return (
        <Box mx="xs">
            <Paper bg="ldGray.0" component={Group} p="xs" w="100%">
                <UnstyledButton onClick={toggle} w="100%">
                    <Group justify="space-between" w="100%">
                        <Group gap="xs">
                            <FieldIcon item={metric} color={color} size="md" />
                            <Text size="xs" fw={500}>
                                {metric.label}
                            </Text>
                        </Group>
                        <MantineIcon
                            icon={opened ? IconChevronDown : IconChevronRight}
                            size="sm"
                            color="gray"
                        />
                    </Group>
                </UnstyledButton>

                <Collapse in={opened}>
                    <Stack gap="xs">
                        <Text size="xs" fw={400} c="dimmed">
                            Aggregation:{' '}
                            <Badge
                                radius="sm"
                                color="indigo"
                                variant="light"
                                size="sm"
                            >
                                {friendlyName(metric.type)}
                            </Badge>
                        </Text>

                        {metric.description && (
                            <Text size="xs" fw={400} c="dimmed">
                                Description:{' '}
                                <Text span c="ldGray.8">
                                    {metric.description}
                                </Text>
                            </Text>
                        )}

                        <Text size="xs" fw={400} c="dimmed">
                            SQL: <Code c="ldGray.8">{metric.compiledSql}</Code>
                        </Text>
                    </Stack>
                </Collapse>
            </Paper>
        </Box>
    );
};

// ============================================================================
// Fallback: Metric Creation from AI Proposal (loading/error states)
// ============================================================================

type CreateMetricFallbackProps = {
    proposedChange: MetricChange;
};

const CreateMetricFallback = ({
    proposedChange,
}: CreateMetricFallbackProps) => {
    if (proposedChange.value.type !== 'create') {
        return null;
    }

    const { metric } = proposedChange.value.value;

    return (
        <Box mx="xs">
            <Paper bg="ldGray.0" p="xs">
                <Stack gap="xs">
                    <Group gap="xs">
                        <Badge size="sm" color="blue" variant="dot">
                            Creating
                        </Badge>
                        <Text size="xs" fw={500}>
                            {metric.label}
                        </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                        Type: {friendlyName(metric.type)}
                    </Text>
                    {metric.description && (
                        <Text size="xs" c="dimmed">
                            {metric.description}
                        </Text>
                    )}
                </Stack>
            </Paper>
        </Box>
    );
};

// ============================================================================
// Table Changes
// ============================================================================

type TableChangeProps = {
    changeData: Change | undefined;
    proposedChange: TableChange;
    entityTableName: string;
};

const TableChangeRender = ({
    proposedChange,
    entityTableName,
}: TableChangeProps) => {
    // For updates, we use the proposed patches directly
    // (changeData doesn't add value for updates since patches are in the proposal)
    switch (proposedChange.value.type) {
        case 'update':
            return (
                <Stack gap="xs">
                    <TableBreadcrumb entityTableName={entityTableName} />
                    <UpdateChange patch={proposedChange.value.patch} />
                </Stack>
            );
        default:
            return assertUnreachable(
                proposedChange.value.type,
                'Unknown table change type',
            );
    }
};

// ============================================================================
// Dimension Changes
// ============================================================================

type DimensionChangeProps = {
    changeData: Change | undefined;
    proposedChange: DimensionChange;
    entityTableName: string;
};

const DimensionChangeRender = ({
    proposedChange,
    entityTableName,
}: DimensionChangeProps) => {
    switch (proposedChange.value.type) {
        case 'update':
            return (
                <Stack gap="xs">
                    <FieldBreadcrumb
                        entityTableName={entityTableName}
                        fieldType="dimension"
                        fieldId={proposedChange.fieldId}
                    />
                    <UpdateChange patch={proposedChange.value.patch} />
                </Stack>
            );
        default:
            return assertUnreachable(
                proposedChange.value.type,
                'Unknown dimension change type',
            );
    }
};

// ============================================================================
// Metric Changes
// ============================================================================

type MetricChangeProps = {
    changeData: Change | undefined;
    proposedChange: MetricChange;
    entityTableName: string;
};

const MetricChangeRender = ({
    changeData,
    proposedChange,
    entityTableName,
}: MetricChangeProps) => {
    switch (proposedChange.value.type) {
        case 'update':
            return (
                <Stack gap="xs">
                    <FieldBreadcrumb
                        entityTableName={entityTableName}
                        fieldType="metric"
                        fieldId={proposedChange.fieldId}
                    />
                    <UpdateChange patch={proposedChange.value.patch} />
                </Stack>
            );
        case 'create':
            return (
                <Stack gap="xs">
                    <FieldBreadcrumb
                        entityTableName={entityTableName}
                        fieldType="metric"
                        fieldId={proposedChange.fieldId}
                    />
                    {/* Prioritize compiled changeData when available */}
                    {changeData && changeData.type === 'create' ? (
                        <CreateMetricFromChangeData changeData={changeData} />
                    ) : (
                        <CreateMetricFallback proposedChange={proposedChange} />
                    )}
                </Stack>
            );
        default:
            return assertUnreachable(
                proposedChange.value,
                'Unknown metric change type',
            );
    }
};

// ============================================================================
// Main Renderer
// ============================================================================

type ChangeRendererProps = {
    /**
     * The backend's persisted change data (source of truth when available).
     * This contains compiled SQL, full metadata, and all computed fields.
     */
    changeData: Change | undefined;
    /**
     * The AI's proposed change (used as fallback during loading/error states).
     * Contains the lightweight proposal before backend processing.
     */
    proposedChange: EntityChange;
    entityTableName: string;
};

export const ChangeRenderer = ({
    changeData,
    proposedChange,
    entityTableName,
}: ChangeRendererProps) => {
    switch (proposedChange.entityType) {
        case 'table':
            return (
                <TableChangeRender
                    changeData={changeData}
                    proposedChange={proposedChange}
                    entityTableName={entityTableName}
                />
            );
        case 'dimension':
            return (
                <DimensionChangeRender
                    changeData={changeData}
                    proposedChange={proposedChange}
                    entityTableName={entityTableName}
                />
            );
        case 'metric':
            return (
                <MetricChangeRender
                    changeData={changeData}
                    proposedChange={proposedChange}
                    entityTableName={entityTableName}
                />
            );
        default:
            return assertUnreachable(proposedChange, 'Unknown entity type');
    }
};
