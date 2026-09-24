import {
    ECHARTS_DEFAULT_COLORS,
    isHexCodeColor,
    type DataAppVizColorRule,
} from '@lightdash/common';
import {
    Button,
    CloseButton,
    Group,
    Select,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { useState, type FC } from 'react';
import { NumberInput } from '../../common/NumberInput';
import ColorSelector from '../ColorSelector';
import { Config } from '../common/Config';

type Props = {
    value: DataAppVizColorRule[];
    colorPalette: string[];
    onChange: (
        update: (rules: DataAppVizColorRule[]) => DataAppVizColorRule[],
    ) => void;
};

const operatorChoices = [
    { value: 'eq', label: 'Equal to' },
    { value: 'neq', label: 'Not equal to' },
    { value: 'lt', label: 'Less than' },
    { value: 'lte', label: 'Less than or equal to' },
    { value: 'gt', label: 'Greater than' },
    { value: 'gte', label: 'Greater than or equal to' },
    { value: 'between', label: 'Between' },
    { value: 'notBetween', label: 'Outside range' },
];

const isRangeRule = (
    rule: DataAppVizColorRule,
): rule is Extract<
    DataAppVizColorRule,
    { operator: 'between' | 'notBetween' }
> => rule.operator === 'between' || rule.operator === 'notBetween';

const DataAppVizRulesControl: FC<Props> = ({
    value,
    colorPalette,
    onChange,
}) => {
    const [structureVersion, setStructureVersion] = useState(0);
    const swatches =
        colorPalette.length > 0 ? colorPalette : ECHARTS_DEFAULT_COLORS;
    const updateRule = (
        index: number,
        update: (rule: DataAppVizColorRule) => DataAppVizColorRule,
    ) =>
        onChange((rules) =>
            rules.map((rule, currentIndex) =>
                currentIndex === index ? update(rule) : rule,
            ),
        );

    const addRule = () => {
        setStructureVersion((current) => current + 1);
        onChange((rules) => [
            ...rules,
            {
                enabled: true,
                color:
                    swatches.find(isHexCodeColor) ?? ECHARTS_DEFAULT_COLORS[0],
                operator: 'gt',
                value: 0,
            },
        ]);
    };

    return (
        <Stack gap="xs">
            <Group justify="space-between" gap="xs">
                <Config.Label>Color rules</Config.Label>
                <Button size="xs" variant="light" onClick={addRule}>
                    Add rule
                </Button>
            </Group>
            <Text size="xs" c="dimmed">
                Last matching rule wins. If none matches, the gradient or chart
                color applies.
            </Text>
            {value.map((rule, index) => (
                <Stack key={`${structureVersion}-${index}`} gap="xs">
                    <Group justify="space-between" gap="xs">
                        <Text size="xs" fw={500}>
                            Rule {index + 1}
                        </Text>
                        <CloseButton
                            size="xs"
                            aria-label={`Remove rule ${index + 1}`}
                            onClick={() => {
                                setStructureVersion((current) => current + 1);
                                onChange((rules) =>
                                    rules.filter(
                                        (_, currentIndex) =>
                                            currentIndex !== index,
                                    ),
                                );
                            }}
                        />
                    </Group>
                    <Config.Group>
                        <Config.Label>Enabled</Config.Label>
                        <Switch
                            size="xs"
                            aria-label="Enabled"
                            checked={rule.enabled}
                            onChange={(event) => {
                                const enabled = event.currentTarget.checked;
                                updateRule(index, (current) => ({
                                    ...current,
                                    enabled,
                                }));
                            }}
                        />
                    </Config.Group>
                    <Select
                        size="xs"
                        label="Condition"
                        data={operatorChoices}
                        value={rule.operator}
                        allowDeselect={false}
                        onChange={(next) => {
                            if (!next) return;
                            const operator =
                                next as DataAppVizColorRule['operator'];
                            updateRule(index, (current) => {
                                if (
                                    operator === 'between' ||
                                    operator === 'notBetween'
                                ) {
                                    return {
                                        enabled: current.enabled,
                                        color: current.color,
                                        operator,
                                        min: isRangeRule(current)
                                            ? current.min
                                            : 0,
                                        max: isRangeRule(current)
                                            ? current.max
                                            : 1,
                                    };
                                }
                                return {
                                    enabled: current.enabled,
                                    color: current.color,
                                    operator,
                                    value: isRangeRule(current)
                                        ? 0
                                        : current.value,
                                };
                            });
                        }}
                    />
                    {isRangeRule(rule) ? (
                        <Group grow align="flex-start" gap="xs">
                            <NumberInput
                                size="xs"
                                label="Minimum"
                                decimalScale="unlimited"
                                value={rule.min}
                                onNumberChange={(next) =>
                                    updateRule(index, (current) =>
                                        isRangeRule(current)
                                            ? { ...current, min: next ?? 0 }
                                            : current,
                                    )
                                }
                            />
                            <NumberInput
                                size="xs"
                                label="Maximum"
                                decimalScale="unlimited"
                                value={rule.max}
                                onNumberChange={(next) =>
                                    updateRule(index, (current) =>
                                        isRangeRule(current)
                                            ? { ...current, max: next ?? 0 }
                                            : current,
                                    )
                                }
                            />
                        </Group>
                    ) : (
                        <NumberInput
                            size="xs"
                            label="Value"
                            decimalScale="unlimited"
                            value={rule.value}
                            onNumberChange={(next) =>
                                updateRule(index, (current) =>
                                    isRangeRule(current)
                                        ? current
                                        : { ...current, value: next ?? 0 },
                                )
                            }
                        />
                    )}
                    {isRangeRule(rule) && rule.min > rule.max && (
                        <Text size="xs" c="red" role="alert">
                            Minimum must be less than or equal to maximum.
                        </Text>
                    )}
                    <Config.Group>
                        <Config.Label>Color</Config.Label>
                        <ColorSelector
                            color={rule.color}
                            swatches={swatches}
                            ariaLabel="Rule color"
                            onColorChange={(color) => {
                                if (isHexCodeColor(color))
                                    updateRule(index, (current) => ({
                                        ...current,
                                        color,
                                    }));
                            }}
                        />
                    </Config.Group>
                </Stack>
            ))}
        </Stack>
    );
};

export default DataAppVizRulesControl;
