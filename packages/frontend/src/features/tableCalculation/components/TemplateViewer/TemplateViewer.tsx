import {
    friendlyName,
    getFieldLabel,
    WindowFunctionType,
    type TableCalculationTemplate,
} from '@lightdash/common';
import { Badge, Group, Stack, Text } from '@mantine/core';
import { useCallback, useMemo, type FC } from 'react';
import { useColumns } from '../../../../hooks/useColumns';
import {
    formatTemplateType,
    getTemplateDescription,
} from '../../utils/templateFormatting';

interface TemplateViewerProps {
    template?: TableCalculationTemplate;
    readOnly: true;
}

export const TemplateViewer: FC<TemplateViewerProps> = ({ template }) => {
    const columns = useColumns();

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

            {partitionByText && (
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
