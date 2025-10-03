import {
    assertUnreachable,
    type ToolProposeChangeOutput,
} from '@lightdash/common';
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
    metadata: ToolProposeChangeOutput['metadata'] | null;
};

const UpdateChange: React.FC<UpdateChangeProps> = ({ patch, metadata }) => {
    const operations = toPairs(patch)
        .filter(([, op]) => op !== null)
        .map(([property, op]) => ({ property, op: op! }));

    return (
        <Stack gap="xs">
            {operations.map(({ property, op }) => (
                <OperationRenderer
                    key={property}
                    operation={op}
                    property={property}
                    metadata={metadata}
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
    metadata: ToolProposeChangeOutput['metadata'] | null;
};

const TableChangeRender = ({
    change,
    entityTableName,
    metadata,
}: TableChangeProps) => {
    switch (change.value.type) {
        case 'update':
            return (
                <Stack gap="xs">
                    <TableBreadcrumb entityTableName={entityTableName} />
                    <UpdateChange
                        patch={change.value.patch}
                        metadata={metadata}
                    />
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
    metadata: ToolProposeChangeOutput['metadata'] | null;
};

const DimensionChangeRender = ({
    change,
    entityTableName,
    metadata,
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
                    <UpdateChange
                        patch={change.value.patch}
                        metadata={metadata}
                    />
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
    metadata: ToolProposeChangeOutput['metadata'] | null;
};

const MetricChangeRender = ({
    change,
    entityTableName,
    metadata,
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
                    <UpdateChange
                        patch={change.value.patch}
                        metadata={metadata}
                    />
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
    metadata: ToolProposeChangeOutput['metadata'] | null;
};

export const ChangeRenderer: React.FC<ChangeRendererProps> = ({
    change,
    entityTableName,
    metadata,
}) => {
    switch (change.entityType) {
        case 'table':
            return (
                <TableChangeRender
                    change={change}
                    entityTableName={entityTableName}
                    metadata={metadata}
                />
            );
        case 'dimension':
            return (
                <DimensionChangeRender
                    change={change}
                    entityTableName={entityTableName}
                    metadata={metadata}
                />
            );
        case 'metric':
            return (
                <MetricChangeRender
                    change={change}
                    entityTableName={entityTableName}
                    metadata={metadata}
                />
            );
        default:
            return assertUnreachable(change, 'Unknown entity type');
    }
};
