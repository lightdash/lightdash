import {
    friendlyName,
    getFieldLabel,
    type TableCalculationTemplate,
} from '@lightdash/common';
import { Badge, Group, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
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

    if (!template) {
        return (
            <Text c="dimmed" size="sm">
                No template available
            </Text>
        );
    }

    const getLabel = (fieldId: string) => {
        const field = columns.find((c) => c.id === fieldId)?.meta?.item;

        return field && 'label' in field
            ? getFieldLabel(field)
            : friendlyName(template.fieldId);
    };

    const fieldLabel = getLabel(template.fieldId);

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

            <Group>
                <Text fw={600} size="sm">
                    Field:
                </Text>
                {fieldLabel}
            </Group>

            {'orderBy' in template &&
                template.orderBy &&
                template.orderBy.length > 0 && (
                    <Group>
                        <Text fw={600} size="sm">
                            Order By:
                        </Text>
                        <Text size="sm">
                            {template.orderBy
                                .map(
                                    ({ fieldId, order }) =>
                                        `${getLabel(fieldId)} ${
                                            order?.toUpperCase() || 'ASC'
                                        }`,
                                )
                                .join(', ')}
                        </Text>
                    </Group>
                )}

            {'partitionBy' in template &&
                template.partitionBy &&
                template.partitionBy.length > 0 && (
                    <Group>
                        <Text fw={600} size="sm">
                            Partition By:
                        </Text>
                        <Text size="sm">
                            {template.partitionBy
                                .map((fieldId) => getLabel(fieldId))
                                .join(', ')}
                        </Text>
                    </Group>
                )}
        </Stack>
    );
};
