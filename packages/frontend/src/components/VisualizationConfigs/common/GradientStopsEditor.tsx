import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { ActionIcon, Box, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconPlus, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import GradientBar from '../../common/GradientBar';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../ColorSelector';
import classes from './GradientStopsEditor.module.css';

type ColorItemProps = {
    color: string;
    label: string;
    canRemove: boolean;
    onColorChange: (color: string) => void;
    onRemove: () => void;
    swatches: string[];
};

const ColorItem: FC<ColorItemProps> = ({
    color,
    label,
    canRemove,
    onColorChange,
    onRemove,
    swatches,
}) => {
    const { t } = useTranslation('vizConfig');
    return (
        <Stack gap="xs" align="center">
            <Text size="xs" fw={500} h={16}>
                {label || '\u00A0'}
            </Text>
            <Box pos="relative" className={classes.colorItem}>
                <ColorSelector
                    ariaLabel={
                        label
                            ? t('common.gradient.itemColor', { label })
                            : t('common.gradient.intermediateColor')
                    }
                    color={color}
                    swatches={swatches}
                    onColorChange={onColorChange}
                />
                {canRemove && (
                    <Tooltip label={t('common.gradient.removeColor')}>
                        <ActionIcon
                            size={14}
                            variant="filled"
                            color="ldGray"
                            radius="xl"
                            pos="absolute"
                            top={-4}
                            right={-4}
                            onClick={onRemove}
                            aria-label={t('common.gradient.removeColor')}
                            className={classes.removeColor}
                        >
                            <MantineIcon icon={IconX} size={8} />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Box>
        </Stack>
    );
};

type GradientStopsEditorProps = {
    colors: string[];
    onAddColor: () => void;
    onRemoveColor: (index: number) => void;
    onColorChange: (index: number, color: string) => void;
    swatches?: string[];
    startLabel?: string;
    endLabel?: string;
};

export const GradientStopsEditor: FC<GradientStopsEditorProps> = ({
    colors,
    onAddColor,
    onRemoveColor,
    onColorChange,
    swatches = ECHARTS_DEFAULT_COLORS,
    startLabel,
    endLabel,
}) => {
    const { t } = useTranslation('vizConfig');
    const resolvedStartLabel = startLabel ?? t('common.gradient.low');
    const resolvedEndLabel = endLabel ?? t('common.gradient.high');
    return (
        <>
            <Group gap="xs" align="flex-start">
                {colors.map((color, index) => {
                    const isFirst = index === 0;
                    const isLast = index === colors.length - 1;
                    return (
                        <ColorItem
                            key={index}
                            color={color}
                            swatches={swatches}
                            label={
                                isFirst
                                    ? resolvedStartLabel
                                    : isLast
                                      ? resolvedEndLabel
                                      : ''
                            }
                            canRemove={!isFirst && !isLast && colors.length > 2}
                            onColorChange={(newColor) =>
                                onColorChange(index, newColor)
                            }
                            onRemove={() => onRemoveColor(index)}
                        />
                    );
                })}
                {colors.length < 5 && (
                    <Stack gap={4} align="center">
                        <Text size="xs" fw={500} h={16}>
                            {'\u00A0'}
                        </Text>
                        <Tooltip label={t('common.gradient.addColor')}>
                            <ActionIcon
                                size="sm"
                                variant="light"
                                aria-label={t('common.gradient.addColor')}
                                onClick={onAddColor}
                            >
                                <MantineIcon icon={IconPlus} size={14} />
                            </ActionIcon>
                        </Tooltip>
                    </Stack>
                )}
            </Group>
            <GradientBar colors={colors} />
        </>
    );
};
