import {
    FilterOperator,
    FilterType,
    isNumericItem,
    isStringDimension,
    type ConditionalFormattingWithFilterOperator,
    type FilterableItem,
} from '@lightdash/common';
import {
    TextInput,
    Collapse,
    Group,
    Stack,
    Text,
    ActionIcon,
    Select,
    Tooltip,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconChevronDown, IconChevronUp, IconTrash } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';
import FilterInputComponent from '../../../common/Filters/FilterInputs';
import { getFilterOperatorOptions } from '../../../common/Filters/FilterInputs/utils';
import FiltersProvider from '../../../common/Filters/FiltersProvider';
import MantineIcon from '../../../common/MantineIcon';

type Props = {
    field: FilterableItem | undefined;
    rule: ConditionalFormattingWithFilterOperator;
    ruleIndex: number;
    hasRemove?: boolean;
    onChangeRule: (newRule: ConditionalFormattingWithFilterOperator) => void;
    onChangeRuleOperator: (operator: FilterOperator) => void;
    onRemoveRule: () => void;
};

export const ChartConditionalFormattingRule: FC<Props> = ({
    field,
    rule,
    ruleIndex,
    hasRemove,
    onChangeRule,
    onChangeRuleOperator,
    onRemoveRule,
}) => {
    const { t } = useTranslation('vizConfig');
    const projectUuid = useProjectUuid();
    const { ref, hovered } = useHover();
    const [isOpen, setIsOpen] = useState(ruleIndex === 0);

    const filterType: FilterType.NUMBER | FilterType.STRING | undefined =
        useMemo(() => {
            if (isNumericItem(field)) return FilterType.NUMBER;
            if (isStringDimension(field)) return FilterType.STRING;
            return undefined;
        }, [field]);

    const filterOperatorOptions = useMemo(() => {
        if (!filterType) return [];
        if (filterType === FilterType.NUMBER) {
            return getFilterOperatorOptions(filterType);
        }
        return [
            {
                value: FilterOperator.EQUALS,
                label: t('chartConditionalFormatting.operator.equals'),
            },
            {
                value: FilterOperator.NOT_EQUALS,
                label: t('chartConditionalFormatting.operator.notEquals'),
            },
            {
                value: FilterOperator.INCLUDE,
                label: t('chartConditionalFormatting.operator.contains'),
            },
        ];
    }, [filterType, t]);

    return (
        <Stack gap="xs" ref={ref}>
            <Group wrap="nowrap" justify="space-between">
                <Group gap="xs">
                    <Text fw={500} fz="xs">
                        {t('chartConditionalFormatting.conditionNumber', {
                            number: ruleIndex + 1,
                        })}
                    </Text>
                    {hasRemove && hovered && (
                        <Tooltip
                            label={t(
                                'chartConditionalFormatting.removeCondition',
                            )}
                            position="left"
                        >
                            <ActionIcon onClick={onRemoveRule}>
                                <MantineIcon icon={IconTrash} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
                <ActionIcon onClick={() => setIsOpen(!isOpen)} size="sm">
                    <MantineIcon
                        icon={isOpen ? IconChevronUp : IconChevronDown}
                    />
                </ActionIcon>
            </Group>
            <Collapse expanded={isOpen}>
                <Group wrap="nowrap" gap="xs">
                    <Select
                        allowDeselect={false}
                        value={rule.operator}
                        data={filterOperatorOptions}
                        onChange={(value) => {
                            if (!value) return;
                            onChangeRuleOperator(value as FilterOperator);
                        }}
                        placeholder={t('chartConditionalFormatting.condition')}
                        disabled={!field || !filterType}
                    />
                    <Select
                        allowDeselect={false}
                        display={field && filterType ? 'none' : 'block'}
                        placeholder={t(
                            'chartConditionalFormatting.valuesPlaceholder',
                        )}
                        data={[]}
                        disabled={!field || !filterType}
                    />
                    {projectUuid && filterType ? (
                        <FiltersProvider projectUuid={projectUuid}>
                            {field ? (
                                <FilterInputComponent
                                    filterType={filterType}
                                    field={field}
                                    rule={rule}
                                    onChange={onChangeRule}
                                />
                            ) : (
                                <TextInput
                                    size="xs"
                                    disabled
                                    placeholder={t(
                                        'chartConditionalFormatting.values',
                                    )}
                                />
                            )}
                        </FiltersProvider>
                    ) : null}
                </Group>
            </Collapse>
        </Stack>
    );
};
