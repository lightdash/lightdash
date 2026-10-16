import {
    friendlyName,
    getFieldLabel,
    isDimension,
    TableCalculationTemplateType,
    WindowFunctionType,
    type TableCalculationTemplate,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Group,
    MultiSelect,
    SegmentedControl,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconMinus } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useColumns } from '../../../../hooks/useColumns';
import {
    selectDimensions,
    selectSorts,
    useExplorerSelector,
} from '../../../explorer/store';
import {
    formatTemplateType,
    getTemplateDescription,
} from '../../utils/templateFormatting';

interface TemplateViewerProps {
    template?: TableCalculationTemplate;
    excludedFieldId?: string;
    readOnly?: boolean;
    onTemplateChange?: (template: TableCalculationTemplate) => void;
}

export const TemplateViewer: FC<TemplateViewerProps> = ({
    template,
    excludedFieldId,
    readOnly = true,
    onTemplateChange,
}) => {
    const { t } = useTranslation('tableCalculation');
    const columns = useColumns();
    const activeDimensions = useExplorerSelector(selectDimensions);
    const resultSorts = useExplorerSelector(selectSorts);

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

    const hasOrderBy = template && 'orderBy' in template;
    const supportsOrderBy =
        hasOrderBy ||
        template?.type === TableCalculationTemplateType.RUNNING_TOTAL;
    const supportsPartitionBy = template && 'partitionBy' in template;
    // The table can be sorted by the calculation itself — freezing that into
    // orderBy would compile a self-referential ORDER BY, so exclude it.
    const legacyRunningTotalOrderBy = resultSorts
        .filter((sort) => sort.fieldId !== excludedFieldId)
        .map((sort) => ({
            fieldId: sort.fieldId,
            order: sort.descending ? ('desc' as const) : ('asc' as const),
        }));
    const orderBy = hasOrderBy
        ? (template.orderBy ?? [])
        : template?.type === TableCalculationTemplateType.RUNNING_TOTAL
          ? legacyRunningTotalOrderBy
          : [];

    const orderByOptions = useMemo(
        () =>
            columns.flatMap((column) => {
                if (
                    !column.id ||
                    column.id === excludedFieldId ||
                    !column.meta?.item
                )
                    return [];
                return [
                    {
                        value: column.id,
                        label: getLabel(column.id),
                    },
                ];
            }),
        [columns, excludedFieldId, getLabel],
    );

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

    const handleOrderByChange = useCallback(
        (nextOrderBy: typeof orderBy) => {
            if (template && supportsOrderBy && onTemplateChange) {
                onTemplateChange({ ...template, orderBy: nextOrderBy });
            }
        },
        [template, supportsOrderBy, onTemplateChange],
    );

    const availableOrderByOptions = orderByOptions.filter(
        (option) =>
            !orderBy.some((orderItem) => orderItem.fieldId === option.value),
    );

    if (!template) {
        return (
            <Text c="dimmed" size="sm">
                {t('templateViewer.noTemplate')}
            </Text>
        );
    }

    return (
        <Stack gap="md">
            <Stack gap="xs">
                <Group>
                    <Text fw={600} size="sm">
                        {t('templateViewer.type')}
                    </Text>
                    <Badge color="blue">
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
                        {t('templateViewer.windowFunction')}
                    </Text>
                    <Text size="sm">
                        {formatWindowFunction(template.windowFunction)}
                    </Text>
                </Group>
            )}

            {fieldLabel && (
                <Group>
                    <Text fw={600} size="sm">
                        {t('templateViewer.field')}
                    </Text>
                    {fieldLabel}
                </Group>
            )}

            {supportsOrderBy && !readOnly && (
                <Stack gap="xs">
                    <Text fw={600} size="sm">
                        {t('templateViewer.orderBy')}
                    </Text>
                    {orderBy.map((orderItem, index) => (
                        <Group key={orderItem.fieldId} gap="xs" wrap="nowrap">
                            <Select
                                flex={1}
                                data={orderByOptions.filter(
                                    (option) =>
                                        option.value === orderItem.fieldId ||
                                        !orderBy.some(
                                            (item) =>
                                                item.fieldId === option.value,
                                        ),
                                )}
                                value={orderItem.fieldId}
                                onChange={(fieldId) => {
                                    if (!fieldId) return;
                                    handleOrderByChange(
                                        orderBy.map((item, itemIndex) =>
                                            itemIndex === index
                                                ? { ...item, fieldId }
                                                : item,
                                        ),
                                    );
                                }}
                                searchable
                                allowDeselect={false}
                            />
                            <SegmentedControl
                                value={orderItem.order ?? 'asc'}
                                data={[
                                    {
                                        value: 'asc',
                                        label: t('templateViewer.ascending'),
                                    },
                                    {
                                        value: 'desc',
                                        label: t('templateViewer.descending'),
                                    },
                                ]}
                                onChange={(order) =>
                                    handleOrderByChange(
                                        orderBy.map((item, itemIndex) =>
                                            itemIndex === index
                                                ? {
                                                      ...item,
                                                      order: order as
                                                          | 'asc'
                                                          | 'desc',
                                                  }
                                                : item,
                                        ),
                                    )
                                }
                            />
                            <Tooltip label={t('templateViewer.moveUp')}>
                                <ActionIcon
                                    disabled={index === 0}
                                    onClick={() => {
                                        const nextOrderBy = [...orderBy];
                                        [
                                            nextOrderBy[index - 1],
                                            nextOrderBy[index],
                                        ] = [
                                            nextOrderBy[index],
                                            nextOrderBy[index - 1],
                                        ];
                                        handleOrderByChange(nextOrderBy);
                                    }}
                                >
                                    <MantineIcon icon={IconArrowUp} />
                                </ActionIcon>
                            </Tooltip>
                            <Tooltip label={t('templateViewer.moveDown')}>
                                <ActionIcon
                                    disabled={index === orderBy.length - 1}
                                    onClick={() => {
                                        const nextOrderBy = [...orderBy];
                                        [
                                            nextOrderBy[index],
                                            nextOrderBy[index + 1],
                                        ] = [
                                            nextOrderBy[index + 1],
                                            nextOrderBy[index],
                                        ];
                                        handleOrderByChange(nextOrderBy);
                                    }}
                                >
                                    <MantineIcon icon={IconArrowDown} />
                                </ActionIcon>
                            </Tooltip>
                            <Tooltip label={t('templateViewer.removeSort')}>
                                <ActionIcon
                                    onClick={() =>
                                        handleOrderByChange(
                                            orderBy.filter(
                                                (_, itemIndex) =>
                                                    itemIndex !== index,
                                            ),
                                        )
                                    }
                                >
                                    <MantineIcon icon={IconMinus} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                    ))}
                    {availableOrderByOptions.length > 0 && (
                        <Select
                            data={availableOrderByOptions}
                            value={null}
                            onChange={(fieldId) => {
                                if (!fieldId) return;
                                handleOrderByChange([
                                    ...orderBy,
                                    { fieldId, order: 'asc' },
                                ]);
                            }}
                            placeholder={t('templateViewer.addSortField')}
                            searchable
                            clearable
                        />
                    )}
                    {orderBy.length === 0 &&
                        availableOrderByOptions.length === 0 && (
                            <Text size="sm" c="dimmed">
                                {t('templateViewer.noSortFields')}
                            </Text>
                        )}
                </Stack>
            )}

            {supportsOrderBy && readOnly && orderByText && (
                <Group>
                    <Text fw={600} size="sm">
                        {t('templateViewer.orderBy')}
                    </Text>
                    <Text size="sm">{orderByText}</Text>
                </Group>
            )}

            {supportsPartitionBy && !readOnly && (
                <Stack gap="xs">
                    <Text fw={600} size="sm">
                        {t('templateViewer.partitionBy')}
                    </Text>
                    <MultiSelect
                        data={dimensionOptions}
                        value={template.partitionBy ?? []}
                        onChange={handlePartitionByChange}
                        placeholder={t('templateViewer.noPartitioning')}
                        searchable
                        clearable
                        maxDropdownHeight={220}
                        hidePickedOptions
                    />
                </Stack>
            )}

            {supportsPartitionBy && readOnly && partitionByText && (
                <Group>
                    <Text fw={600} size="sm">
                        {t('templateViewer.partitionBy')}
                    </Text>
                    <Text size="sm">{partitionByText}</Text>
                </Group>
            )}
        </Stack>
    );
};
