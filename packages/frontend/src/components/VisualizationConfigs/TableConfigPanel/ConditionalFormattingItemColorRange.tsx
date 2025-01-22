import {
    type ConditionalFormattingColorRange,
    hasPercentageFormat,
    type ConditionalFormattingConfigWithColorRange,
    type ConditionalFormattingColorMinMaxRange,
    type FilterableItem,
} from '@lightdash/common';
import { Group, Select, Stack } from '@mantine/core';
import { IconPercentage } from '@tabler/icons-react';
import { capitalize } from 'lodash';
import { type FC } from 'react';
import FilterNumberInput from '../../common/Filters/FilterInputs/FilterNumberInput';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../ColorSelector';
import { Config } from '../common/Config';

type Props = {
    config: ConditionalFormattingConfigWithColorRange;
    field: FilterableItem | undefined;
    colorPalette: string[];
    onChangeColorRange: (
        newColorRange: Partial<ConditionalFormattingColorRange>,
    ) => void;
    onChangeMinMax: (
        newMinMax: Partial<
            ConditionalFormattingColorMinMaxRange<number | 'auto'>
        >,
    ) => void;
};

enum RangeValue {
    CUSTOM = 'custom',
    AUTO = 'auto',
}

const groups = [
    ['start', 'min'],
    ['end', 'max'],
] as const;

const ConditionalFormattingItemColorRange: FC<Props> = ({
    config,
    field,
    colorPalette,
    onChangeMinMax,
    onChangeColorRange,
}) => {
    console.log(config);

    return (
        <Stack spacing="xs">
            {groups.map(([rangeName, minMaxName]) => (
                <Group key={rangeName} spacing="xs" noWrap align="end">
                    <Select
                        sx={{ flexBasis: '100%' }}
                        label={`${capitalize(minMaxName)} value type`}
                        data={Object.values(RangeValue).map((value) => ({
                            value,
                            label:
                                value === RangeValue.AUTO
                                    ? `${capitalize(minMaxName)} value in table`
                                    : `Custom`,
                        }))}
                        value={
                            config.rule[minMaxName] === 'auto'
                                ? RangeValue.AUTO
                                : RangeValue.CUSTOM
                        }
                        onChange={(value) => {
                            if (value === RangeValue.AUTO) {
                                onChangeMinMax({ [minMaxName]: 'auto' });
                            } else {
                                onChangeMinMax({ [minMaxName]: 0 });
                            }
                        }}
                    />

                    {/* FIXME: remove this and use NumberInput from @mantine/core once we upgrade to mantine v7 */}
                    {/* INFO: mantine v6 NumberInput does not handle decimal values properly */}
                    <FilterNumberInput
                        sx={{ flexShrink: 1 }}
                        disabled={config.rule[minMaxName] === 'auto'}
                        placeholder={
                            config.rule[minMaxName] === 'auto'
                                ? 'Auto'
                                : undefined
                        }
                        label={
                            <Config.Label>
                                {capitalize(minMaxName)} value
                            </Config.Label>
                        }
                        icon={
                            hasPercentageFormat(field) ? (
                                <MantineIcon icon={IconPercentage} />
                            ) : null
                        }
                        value={config.rule[minMaxName]}
                        onChange={(newValue) => {
                            if (newValue === null) return;

                            onChangeMinMax({
                                [minMaxName]: newValue,
                            });
                        }}
                    />

                    <ColorSelector
                        colorSwatchProps={{
                            style: {
                                flexShrink: '0',
                            },
                            size: '24px',
                            my: 3,
                        }}
                        color={config.color[rangeName]}
                        swatches={colorPalette}
                        onColorChange={(newColor) => {
                            onChangeColorRange({
                                [rangeName]: newColor,
                            });
                        }}
                    />
                </Group>
            ))}
        </Stack>
    );
};

export default ConditionalFormattingItemColorRange;
