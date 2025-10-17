import {
    assertUnreachable,
    type Change,
    friendlyName,
    getItemColor,
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
import { toPairs } from 'lodash';
import FieldIcon from '../../../../../../../components/common/Filters/FieldIcon';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import { mergeCreateMetricData } from './changeDataMerger';
import { OperationRenderer } from './OperationRenderer';
import { FieldBreadcrumb, TableBreadcrumb } from './SupportElements';
import type {
    CreateMetric as CreateMetricPayload,
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
// [ separate into entity-specific components if needed in the future ]
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
// Metric Creation Component
// ============================================================================

type CreateMetricProps = {
    change: CreateMetricPayload;
    changePayload: Change['payload'] | undefined;
};

const CreateMetric = ({ change, changePayload }: CreateMetricProps) => {
    const [opened, { toggle }] = useDisclosure(false);

    const metric = mergeCreateMetricData(change, changePayload);

    if (!metric) {
        return null;
    }

    const color = getItemColor(metric);

    return (
        <Box mx="xs">
            <Paper bg="gray.0" component={Group} p="xs" w="100%">
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

                        <Text size="xs" fw={400} c="dimmed">
                            Base dimension:{' '}
                            <Text fw={500} span c="gray.8">
                                {metric.baseDimensionName}
                            </Text>
                        </Text>

                        {metric.description && (
                            <Text size="xs" fw={400} c="dimmed">
                                Description:{' '}
                                <Text span c="gray.8">
                                    {metric.description}
                                </Text>
                            </Text>
                        )}

                        <Text size="xs" fw={400} c="dimmed">
                            SQL: <Code c="gray.8">{metric.compiledSql}</Code>
                        </Text>
                    </Stack>
                </Collapse>
            </Paper>
        </Box>
    );
};

// ============================================================================
// Table Changes
// ============================================================================

type TableChangeProps = {
    change: TableChange;
    entityTableName: string;
};

const TableChangeRender = ({ change, entityTableName }: TableChangeProps) => {
    switch (change.value.type) {
        case 'update':
            return (
                <Stack gap="xs">
                    <TableBreadcrumb entityTableName={entityTableName} />
                    <UpdateChange patch={change.value.patch} />
                </Stack>
            );
        default:
            return assertUnreachable(
                change.value.type,
                'Unknown table change type',
            );
    }
};

// ============================================================================
// Dimension Changes
// ============================================================================

type DimensionChangeProps = {
    change: DimensionChange;
    entityTableName: string;
};

const DimensionChangeRender = ({
    change,
    entityTableName,
}: DimensionChangeProps) => {
    switch (change.value.type) {
        case 'update':
            return (
                <Stack gap="xs">
                    <FieldBreadcrumb
                        entityTableName={entityTableName}
                        fieldType="dimension"
                        fieldId={change.fieldId}
                    />
                    <UpdateChange patch={change.value.patch} />
                </Stack>
            );
        default:
            return assertUnreachable(
                change.value.type,
                'Unknown dimension change type',
            );
    }
};

// ============================================================================
// Metric Changes
// ============================================================================

type MetricChangeProps = {
    change: MetricChange;
    entityTableName: string;
    changePayload: Change['payload'] | undefined;
};

const MetricChangeRender = ({
    change,
    entityTableName,
    changePayload,
}: MetricChangeProps) => {
    switch (change.value.type) {
        case 'update':
            return (
                <Stack gap="xs">
                    <FieldBreadcrumb
                        entityTableName={entityTableName}
                        fieldType="metric"
                        fieldId={change.fieldId}
                    />
                    <UpdateChange patch={change.value.patch} />
                </Stack>
            );
        case 'create':
            return (
                <Stack gap="xs">
                    <FieldBreadcrumb
                        entityTableName={entityTableName}
                        fieldType="metric"
                        fieldId={change.fieldId}
                    />
                    <CreateMetric
                        change={change.value}
                        changePayload={changePayload}
                    />
                </Stack>
            );
        default:
            return assertUnreachable(
                change.value,
                'Unknown metric change type',
            );
    }
};

// ============================================================================
// Main Renderer
// ============================================================================

type ChangeRendererProps = {
    change: EntityChange;
    changePayload: Change['payload'] | undefined;
    entityTableName: string;
};

export const ChangeRenderer = ({
    change,
    changePayload,
    entityTableName,
}: ChangeRendererProps) => {
    switch (change.entityType) {
        case 'table':
            return (
                <TableChangeRender
                    change={change}
                    entityTableName={entityTableName}
                />
            );
        case 'dimension':
            return (
                <DimensionChangeRender
                    change={change}
                    entityTableName={entityTableName}
                />
            );
        case 'metric':
            return (
                <MetricChangeRender
                    change={change}
                    changePayload={changePayload}
                    entityTableName={entityTableName}
                />
            );
        default:
            return assertUnreachable(change, 'Unknown entity type');
    }
};
