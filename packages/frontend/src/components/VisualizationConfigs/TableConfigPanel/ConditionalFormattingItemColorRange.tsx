import {
    hasPercentageFormat,
    type ConditionalFormattingColorRange,
    type ConditionalFormattingConfigWithColorRange,
    type ConditionalFormattingMinMax,
    type FilterableItem,
} from '@lightdash/common';
import { Group, Stack } from '@mantine/core';
import { IconPercentage } from '@tabler/icons-react';
import capitalize from 'lodash/capitalize';
import { startTransition, useCallback, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../ColorSelector';
import RangeBoundInput from '../common/RangeBoundInput';

type Props = {
    config: ConditionalFormattingConfigWithColorRange;
    field: FilterableItem | undefined;
    colorPalette: string[];
    onChangeColorRange: (
        newColorRange: Partial<ConditionalFormattingColorRange>,
    ) => void;
    onChangeMinMax: (
        newMinMax: Partial<ConditionalFormattingMinMax<number | 'auto'>>,
    ) => void;
};

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
    const handleOnChangeColorRange = useCallback(
        (newColor: string, rangeName: string) => {
            startTransition(() => {
                onChangeColorRange({
                    [rangeName]: newColor,
                });
            });
        },
        [onChangeColorRange],
    );

    return (
        <Stack gap="xs">
            {groups.map(([rangeName, minMaxName]) => (
                <Group key={rangeName} gap="xs" wrap="nowrap" align="end">
                    <RangeBoundInput
                        bound={minMaxName}
                        value={config.rule[minMaxName]}
                        autoLabel={`${capitalize(minMaxName)} value in table`}
                        leftSection={
                            hasPercentageFormat(field) ? (
                                <MantineIcon icon={IconPercentage} />
                            ) : null
                        }
                        onChange={(value) =>
                            onChangeMinMax({ [minMaxName]: value })
                        }
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
                        onColorChange={(newColor) =>
                            handleOnChangeColorRange(newColor, rangeName)
                        }
                    />
                </Group>
            ))}
        </Stack>
    );
};

export default ConditionalFormattingItemColorRange;
