import {
    FilterOperator,
    FilterType,
    isNumericItem,
    isStringDimension,
    type ConditionalFormattingWithConditionalOperator,
    type ConditionalOperator,
    type FilterableItem,
} from '@lightdash/common';
import {
    ActionIcon,
    Collapse,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconChevronDown, IconChevronUp, IconTrash } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import FilterInputComponent from '../../common/Filters/FilterInputs';
import {
    getFilterOperatorOptions,
    getFilterOptions,
} from '../../common/Filters/FilterInputs/utils';
import FiltersProvider from '../../common/Filters/FiltersProvider';
import MantineIcon from '../../common/MantineIcon';

interface ConditionalFormattingRuleProps {
    isDefaultOpen?: boolean;
    ruleIndex: number;
    rule: ConditionalFormattingWithConditionalOperator;
    field: FilterableItem;
    hasRemove?: boolean;
    onChangeRule: (
        newRule: ConditionalFormattingWithConditionalOperator,
    ) => void;
    onChangeRuleOperator: (newOperator: ConditionalOperator) => void;
    onRemoveRule: () => void;
}

const ConditionalFormattingRule: FC<ConditionalFormattingRuleProps> = ({
    isDefaultOpen = true,
    ruleIndex,
    rule,
    field,
    onChangeRule,
    onChangeRuleOperator,
    onRemoveRule,
    hasRemove,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { ref, hovered } = useHover();
    const [isOpen, setIsOpen] = useState(isDefaultOpen);
    // conditional formatting only supports number filters or string filters
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
        if (filterType === FilterType.STRING) {
            return getFilterOptions([
                FilterOperator.EQUALS,
                FilterOperator.INCLUDE,
            ]);
        }
        return [];
    }, [filterType]);

    if (!filterType) return null;

    return (
        <Stack spacing="xs" ref={ref}>
            <Group noWrap position="apart">
                <Group spacing="xs">
                    <Text fw={500} fz="xs">
                        Condition {ruleIndex + 1}
                    </Text>

                    {hasRemove && hovered && (
                        <Tooltip
                            variant="xs"
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
                            onChangeRuleOperator(value as ConditionalOperator);
                        }}
                    />

                    {projectUuid && (
                        <FiltersProvider projectUuid={projectUuid}>
                            <FilterInputComponent
                                filterType={filterType}
                                field={field}
                                rule={rule}
                                onChange={onChangeRule}
                            />
                        </FiltersProvider>
                    )}
                </Group>
            </Collapse>
        </Stack>
    );
};

export default ConditionalFormattingRule;
