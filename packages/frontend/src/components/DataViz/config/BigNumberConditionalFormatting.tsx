import {
    FilterOperator,
    type VizBigNumberConditionalOperator,
    type VizBigNumberConditionalRule,
} from '@lightdash/common';
import { ActionIcon, Box, Button, Group, Select, Stack } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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

const getOperatorOptions = (
    t: TFunction,
): {
    value: VizBigNumberConditionalOperator;
    label: string;
}[] => [
    {
        value: FilterOperator.GREATER_THAN,
        label: t('bigNumber.rules.operators.greaterThan'),
    },
    {
        value: FilterOperator.GREATER_THAN_OR_EQUAL,
        label: t('bigNumber.rules.operators.greaterThanOrEqual'),
    },
    {
        value: FilterOperator.LESS_THAN,
        label: t('bigNumber.rules.operators.lessThan'),
    },
    {
        value: FilterOperator.LESS_THAN_OR_EQUAL,
        label: t('bigNumber.rules.operators.lessThanOrEqual'),
    },
    {
        value: FilterOperator.EQUALS,
        label: t('bigNumber.rules.operators.equals'),
    },
    {
        value: FilterOperator.NOT_EQUALS,
        label: t('bigNumber.rules.operators.notEquals'),
    },
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
    const { t } = useTranslation('dataViz');
    const operatorOptions = useMemo(() => getOperatorOptions(t), [t]);
    const dispatch = useVizDispatch();
    const rules = useVizSelector(
        (state) => state.bigNumberConfig.display?.conditionalFormatting ?? [],
    );

    return (
        <Stack gap="sm" mb="lg">
            <Config.Section>
                <Config.Heading>{t('bigNumber.rules.title')}</Config.Heading>
                <Config.Label>{t('bigNumber.rules.description')}</Config.Label>

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
                            data={operatorOptions}
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
                            aria-label={t('bigNumber.rules.remove')}
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
                    {t('bigNumber.rules.add')}
                </Button>
            </Config.Section>
        </Stack>
    );
};
