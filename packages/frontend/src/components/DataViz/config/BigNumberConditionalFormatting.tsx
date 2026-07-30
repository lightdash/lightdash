import {
    FilterOperator,
    type VizBigNumberConditionalOperator,
    type VizBigNumberConditionalRule,
} from '@lightdash/common';
import { ActionIcon, Box, Button, Group, Select, Stack } from '@mantine-8/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import {
    useAppDispatch as useVizDispatch,
    useAppSelector as useVizSelector,
} from '../../../features/sqlRunner/store/hooks';
import MantineIcon from '../../common/MantineIcon';
import { NumberInput } from '../../common/NumberInput';
import ColorSelector from '../../VisualizationConfigs/ColorSelector';
import { Config } from '../../VisualizationConfigs/common/Config';
import {
    addConditionalFormattingRule,
    removeConditionalFormattingRule,
    updateConditionalFormattingRule,
} from '../store/bigNumberSlice';

const OPERATOR_OPTIONS: {
    value: VizBigNumberConditionalOperator;
    label: string;
}[] = [
    { value: FilterOperator.GREATER_THAN, label: 'is greater than' },
    {
        value: FilterOperator.GREATER_THAN_OR_EQUAL,
        label: 'is greater than or equal to',
    },
    { value: FilterOperator.LESS_THAN, label: 'is less than' },
    {
        value: FilterOperator.LESS_THAN_OR_EQUAL,
        label: 'is less than or equal to',
    },
    { value: FilterOperator.EQUALS, label: 'is equal to' },
    { value: FilterOperator.NOT_EQUALS, label: 'is not equal to' },
];

const DEFAULT_RULE: VizBigNumberConditionalRule = {
    operator: FilterOperator.GREATER_THAN,
    value: 0,
    color: '#00A47E',
};

export const BigNumberConditionalFormatting = ({
    colors,
}: {
    colors: string[];
}) => {
    const dispatch = useVizDispatch();
    const rules = useVizSelector(
        (state) => state.bigNumberConfig.display?.conditionalFormatting ?? [],
    );

    return (
        <Stack gap="sm" mb="lg">
            <Config.Section>
                <Config.Heading>Rules</Config.Heading>
                <Config.Label>
                    The value takes the colour of the first rule it matches.
                </Config.Label>

                {rules.map((rule, index) => (
                    // Rules are an ordered list with no stable id; the index is
                    // the identity here.
                    // eslint-disable-next-line react/no-array-index-key
                    <Group key={index} gap="xs" wrap="nowrap" align="flex-end">
                        <Box>
                            <ColorSelector
                                color={rule.color}
                                swatches={colors}
                                onColorChange={(color) =>
                                    dispatch(
                                        updateConditionalFormattingRule({
                                            index,
                                            rule: { ...rule, color },
                                        }),
                                    )
                                }
                            />
                        </Box>

                        <Select
                            size="xs"
                            flex={1}
                            data={OPERATOR_OPTIONS}
                            value={rule.operator}
                            allowDeselect={false}
                            onChange={(operator) => {
                                if (!operator) return;
                                dispatch(
                                    updateConditionalFormattingRule({
                                        index,
                                        rule: {
                                            ...rule,
                                            operator:
                                                operator as VizBigNumberConditionalOperator,
                                        },
                                    }),
                                );
                            }}
                        />

                        <NumberInput
                            size="xs"
                            w={90}
                            decimalScale="unlimited"
                            value={rule.value}
                            onNumberChange={(value: number | undefined) =>
                                dispatch(
                                    updateConditionalFormattingRule({
                                        index,
                                        rule: { ...rule, value: value ?? 0 },
                                    }),
                                )
                            }
                        />

                        <ActionIcon
                            variant="subtle"
                            color="ldGray.6"
                            aria-label="Remove rule"
                            onClick={() =>
                                dispatch(removeConditionalFormattingRule(index))
                            }
                        >
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    </Group>
                ))}

                <Button
                    size="xs"
                    variant="subtle"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={() =>
                        dispatch(addConditionalFormattingRule(DEFAULT_RULE))
                    }
                >
                    Add rule
                </Button>
            </Config.Section>
        </Stack>
    );
};
