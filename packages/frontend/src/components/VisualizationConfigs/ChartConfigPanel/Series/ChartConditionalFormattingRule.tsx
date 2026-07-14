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
} from '@mantine-8/core';
import { Tooltip } from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconChevronDown, IconChevronUp, IconTrash } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
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
    const { projectUuid } = useParams<{ projectUuid: string }>();
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
            { value: FilterOperator.EQUALS, label: 'Equals' },
            { value: FilterOperator.NOT_EQUALS, label: 'Does not equal' },
            { value: FilterOperator.INCLUDE, label: 'Contains' },
        ];
    }, [filterType]);

    return (
        <Stack gap="xs" ref={ref}>
            <Group wrap="nowrap" justify="space-between">
                <Group gap="xs">
                    <Text fw={500} fz="xs">
                        Condition {ruleIndex + 1}
                    </Text>
                    {hasRemove && hovered && (
                        <Tooltip
                            label="Remove condition"
                            position="left"
                            withinPortal
                        >
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                onClick={onRemoveRule}
                            >
                                <MantineIcon icon={IconTrash} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={() => setIsOpen(!isOpen)}
                    size="sm"
                >
                    <MantineIcon
                        icon={isOpen ? IconChevronUp : IconChevronDown}
                    />
                </ActionIcon>
            </Group>
            <Collapse in={isOpen}>
                <Group wrap="nowrap" gap="xs">
                    <Select
                        allowDeselect={false}
                        value={rule.operator}
                        data={filterOperatorOptions}
                        onChange={(value) => {
                            if (!value) return;
                            onChangeRuleOperator(value as FilterOperator);
                        }}
                        placeholder="Condition"
                        disabled={!field || !filterType}
                    />
                    <Select
                        allowDeselect={false}
                        display={field && filterType ? 'none' : 'block'}
                        placeholder="Value(s)"
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
                                    placeholder="Values"
                                />
                            )}
                        </FiltersProvider>
                    ) : null}
                </Group>
            </Collapse>
        </Stack>
    );
};
