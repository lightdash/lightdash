import {
    hasPercentageFormat,
    type ConditionalFormattingColorRange,
    type ConditionalFormattingConfigWithColorRange,
    type ConditionalFormattingMinMax,
    type FilterableItem,
} from '@lightdash/common';
import { Group, Stack } from '@mantine/core';
import { IconPercentage } from '@tabler/icons-react';
import { startTransition, useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../ColorSelector';
import { RangeBoundInput } from '../common/RangeBoundInput';

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
    const { t } = useTranslation('vizConfig');
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
                        label={
                            minMaxName === 'min'
                                ? t(
                                      'tableConditionalFormatting.colorRange.minValue',
                                  )
                                : t(
                                      'tableConditionalFormatting.colorRange.maxValue',
                                  )
                        }
                        autoLabel={
                            minMaxName === 'min'
                                ? t(
                                      'tableConditionalFormatting.colorRange.minValueInTable',
                                  )
                                : t(
                                      'tableConditionalFormatting.colorRange.maxValueInTable',
                                  )
                        }
                        value={config.rule[minMaxName]}
                        onChange={(newValue) =>
                            onChangeMinMax({ [minMaxName]: newValue })
                        }
                        leftSection={
                            hasPercentageFormat(field) ? (
                                <MantineIcon icon={IconPercentage} />
                            ) : null
                        }
                    />

                    <ColorSelector
                        colorSwatchProps={{
                            flex: '0 0 auto',
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
