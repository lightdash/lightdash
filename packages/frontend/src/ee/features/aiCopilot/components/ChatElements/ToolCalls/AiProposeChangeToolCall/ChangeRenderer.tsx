import { assertUnreachable } from '@lightdash/common';
import { Stack } from '@mantine-8/core';
import { toPairs } from 'lodash';
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
};

const MetricChangeRender = ({ change, entityTableName }: MetricChangeProps) => {
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
    entityTableName: string;
};

export const ChangeRenderer = ({
    change,
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
                    entityTableName={entityTableName}
                />
            );
        default:
            return assertUnreachable(change, 'Unknown entity type');
    }
};
