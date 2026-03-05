import {
    friendlyName,
    getFieldLabel,
    isDimension,
    WindowFunctionType,
    type TableCalculationTemplate,
} from '@lightdash/common';
import { Badge, Group, MultiSelect, Stack, Text } from '@mantine/core';
import { useCallback, useMemo, type FC } from 'react';
import { useColumns } from '../../../../hooks/useColumns';
import { selectDimensions, useExplorerSelector } from '../../../explorer/store';
import {
    formatTemplateType,
    getTemplateDescription,
} from '../../utils/templateFormatting';

interface TemplateViewerProps {
    template?: TableCalculationTemplate;
    readOnly?: boolean;
    onTemplateChange?: (template: TableCalculationTemplate) => void;
}

export const TemplateViewer: FC<TemplateViewerProps> = ({
    template,
    readOnly = true,
    onTemplateChange,
}) => {
    const columns = useColumns();
    const activeDimensions = useExplorerSelector(selectDimensions);

    const columnsMap = useMemo(() => {
        return new Map(columns.map((c) => [c.id, c.meta?.item]));
    }, [columns]);

    const getLabel = useCallback(
        (fieldId: string) => {
            const field = columnsMap.get(fieldId);
            return field && 'label' in field
                ? getFieldLabel(field)
                : friendlyName(fieldId);
        },
        [columnsMap],
    );

    const formatWindowFunction = useCallback(
        (windowFunction: WindowFunctionType) => {
            switch (windowFunction) {
                case WindowFunctionType.ROW_NUMBER:
                    return 'ROW_NUMBER()';
                case WindowFunctionType.PERCENT_RANK:
                    return 'PERCENT_RANK()';
                default:
                    return windowFunction;
            }
        },
        [],
    );

    const fieldLabel = useMemo(
        () =>
            template && 'fieldId' in template && template.fieldId !== null
                ? getLabel(template.fieldId)
                : undefined,
        [template, getLabel],
    );

    const orderByText = useMemo(() => {
        if (!template || !('orderBy' in template) || !template.orderBy) {
            return null;
        }
        return template.orderBy
            .map(
                ({ fieldId, order }) =>
                    `${getLabel(fieldId)} ${order?.toUpperCase() || 'ASC'}`,
            )
            .join(', ');
    }, [template, getLabel]);

    const partitionByText = useMemo(() => {
        if (
            !template ||
            !('partitionBy' in template) ||
            !template.partitionBy
        ) {
            return null;
        }
        return template.partitionBy
            .map((fieldId) => getLabel(fieldId))
            .join(', ');
    }, [template, getLabel]);

    const supportsPartitionBy = template && 'partitionBy' in template;

    const dimensionOptions = useMemo(
        () =>
            activeDimensions
                .filter((fieldId) => {
                    const item = columnsMap.get(fieldId);
                    return item && isDimension(item);
                })
                .map((fieldId) => ({
                    value: fieldId,
                    label: getLabel(fieldId),
                })),
        [activeDimensions, columnsMap, getLabel],
    );

    const handlePartitionByChange = useCallback(
        (value: string[]) => {
            if (template && supportsPartitionBy && onTemplateChange) {
                onTemplateChange({ ...template, partitionBy: value });
            }
        },
        [template, supportsPartitionBy, onTemplateChange],
    );

    if (!template) {
        return (
            <Text c="dimmed" size="sm">
                No template available
            </Text>
        );
    }

    return (
        <Stack spacing="md">
            <Stack spacing="xs">
                <Group>
                    <Text fw={600} size="sm">
                        Type:
                    </Text>
                    <Badge color="blue" variant="light">
                        {formatTemplateType(template.type)}
                    </Badge>
                </Group>

                <Text size="sm" c="dimmed">
                    {getTemplateDescription(template.type)}
                </Text>
            </Stack>

            {'windowFunction' in template && (
                <Group>
                    <Text fw={600} size="sm">
                        Window Function:
                    </Text>
                    <Text size="sm">
                        {formatWindowFunction(template.windowFunction)}
                    </Text>
                </Group>
            )}

            {fieldLabel && (
                <Group>
                    <Text fw={600} size="sm">
                        Field:
                    </Text>
                    {fieldLabel}
                </Group>
            )}

            {orderByText && (
                <Group>
                    <Text fw={600} size="sm">
                        Order By:
                    </Text>
                    <Text size="sm">{orderByText}</Text>
                </Group>
            )}

            {supportsPartitionBy && !readOnly && (
                <Stack spacing="xs">
                    <Text fw={600} size="sm">
                        Partition By:
                    </Text>
                    <MultiSelect
                        data={dimensionOptions}
                        value={template.partitionBy ?? []}
                        onChange={handlePartitionByChange}
                        placeholder="No partitioning (all rows)"
                        searchable
                        clearable
                    />
                </Stack>
            )}

            {supportsPartitionBy && readOnly && partitionByText && (
                <Group>
                    <Text fw={600} size="sm">
                        Partition By:
                    </Text>
                    <Text size="sm">{partitionByText}</Text>
                </Group>
            )}
        </Stack>
    );
};
