import {
    FilterOperator,
    FilterType,
    isNumericItem,
    isStringDimension,
    type ConditionalFormattingWithFilterOperator,
    type FilterableItem,
} from '@lightdash/common';
import {
    ActionIcon,
    Collapse,
    Group,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
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
        <Stack spacing="xs" ref={ref}>
            <Group noWrap position="apart">
                <Group spacing="xs">
                    <Text fw={500} fz="xs">
                        Condition {ruleIndex + 1}
                    </Text>
                    {hasRemove && hovered && (
                        <Tooltip
                            label="Remove condition"
                            position="left"
                            withinPortal
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
            <Collapse in={isOpen}>
                <Group noWrap spacing="xs">
                    <Select
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
                                <TextInput disabled placeholder="Values" />
                            )}
                        </FiltersProvider>
                    ) : null}
                </Group>
            </Collapse>
        </Stack>
    );
};
