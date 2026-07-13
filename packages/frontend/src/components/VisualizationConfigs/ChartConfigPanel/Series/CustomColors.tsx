import {
    createConditionalFormattingConfigWithSingleColor,
    getItemId,
    isFilterableItem,
    type ConditionalFormattingConfig,
    type CustomDimension,
    type Field,
    type ResultRow,
    type TableCalculation,
} from '@lightdash/common';
import { Box, Group, ScrollArea, Stack } from '@mantine-8/core';
import { Divider, SegmentedControl, Text } from '@mantine/core';
import { useCallback, useMemo, useState, type FC } from 'react';
import ColorSelector from '../../ColorSelector';
import { ChartConditionalFormatting } from './ChartConditionalFormatting';

const MAX_COLOR_VALUES = 50;
const CUSTOM_COLOR_MODE = {
    CATEGORY: 'category',
    CONDITIONAL_FORMATTING: 'conditional_formatting',
} as const;

type Props = {
    items: (Field | TableCalculation | CustomDimension)[];
    rows: ResultRow[] | undefined;
    xField: string | undefined;
    yFields: string[];
    canColorByCategory: boolean;
    enforceSingleTarget: boolean;
    colorPalette: string[];
    colorByCategory: boolean;
    categoryColorOverrides: Record<string, string>;
    conditionalFormattings: ConditionalFormattingConfig[];
    setColorByCategory: (enabled: boolean) => void;
    setCategoryColorOverride: (categoryValue: string, color: string) => void;
    setAllCategoryColorOverrides: (overrides: Record<string, string>) => void;
    onSetConditionalFormattings: (
        configs: ConditionalFormattingConfig[],
    ) => void;
};

export const CustomColors: FC<Props> = ({
    items,
    rows,
    xField,
    yFields,
    canColorByCategory,
    enforceSingleTarget,
    colorPalette,
    colorByCategory,
    categoryColorOverrides,
    conditionalFormattings,
    setColorByCategory,
    setCategoryColorOverride,
    setAllCategoryColorOverrides,
    onSetConditionalFormattings,
}) => {
    const { uniqueCategories, allRawKeys, remainingCount } = useMemo(() => {
        if (!colorByCategory || !rows || !xField) {
            return { uniqueCategories: [], allRawKeys: [], remainingCount: 0 };
        }

        const seen = new Map<string, string>();
        for (const row of rows) {
            const cell = row[xField];
            if (cell?.value != null) {
                const rawKey = String(cell.value.raw ?? cell.value.formatted);
                if (!seen.has(rawKey)) {
                    seen.set(
                        rawKey,
                        String(cell.value.formatted ?? cell.value.raw),
                    );
                }
            }
        }

        const entries = Array.from(seen.entries());
        return {
            uniqueCategories: entries.slice(0, MAX_COLOR_VALUES),
            allRawKeys: Array.from(seen.keys()),
            remainingCount: Math.max(0, entries.length - MAX_COLOR_VALUES),
        };
    }, [colorByCategory, rows, xField]);

    const [setAllColor, setSetAllColor] = useState<string | undefined>();

    const customColorMode =
        canColorByCategory &&
        (colorByCategory || conditionalFormattings.length === 0)
            ? CUSTOM_COLOR_MODE.CATEGORY
            : CUSTOM_COLOR_MODE.CONDITIONAL_FORMATTING;

    const targetFields = useMemo(
        () =>
            yFields.flatMap((yFieldId) => {
                const candidate = items.find(
                    (item) => getItemId(item) === yFieldId,
                );
                return candidate && isFilterableItem(candidate)
                    ? [candidate]
                    : [];
            }),
        [items, yFields],
    );

    const handleSetAllCategoryColors = useCallback(
        (color: string) => {
            setSetAllColor(color);

            const overrides: Record<string, string> = {};
            for (const rawKey of allRawKeys) {
                overrides[rawKey] = color;
            }

            setAllCategoryColorOverrides(overrides);
        },
        [allRawKeys, setAllCategoryColorOverrides],
    );

    return (
        <>
            {canColorByCategory && (
                <SegmentedControl
                    size="xs"
                    value={customColorMode}
                    data={[
                        {
                            value: CUSTOM_COLOR_MODE.CATEGORY,
                            label: 'Category',
                        },
                        {
                            value: CUSTOM_COLOR_MODE.CONDITIONAL_FORMATTING,
                            label: 'Conditional formatting',
                        },
                    ]}
                    onChange={(value) => {
                        if (value === CUSTOM_COLOR_MODE.CATEGORY) {
                            setColorByCategory(true);
                            return;
                        }

                        setColorByCategory(false);
                        if (conditionalFormattings.length === 0) {
                            onSetConditionalFormattings([
                                createConditionalFormattingConfigWithSingleColor(
                                    colorPalette[0],
                                    targetFields[0]
                                        ? {
                                              fieldId: getItemId(
                                                  targetFields[0],
                                              ),
                                          }
                                        : null,
                                ),
                            ]);
                        }
                    }}
                />
            )}
            {customColorMode === CUSTOM_COLOR_MODE.CATEGORY ? (
                uniqueCategories.length > 0 && (
                    <>
                        <Divider />
                        <Group gap="xs" wrap="nowrap">
                            <ColorSelector
                                color={setAllColor ?? colorPalette[0]}
                                swatches={colorPalette}
                                onColorChange={handleSetAllCategoryColors}
                            />
                            <Text fz="xs" fw={600} c="dimmed">
                                Set all
                            </Text>
                        </Group>
                        <Box
                            bg="ldGray.1"
                            p="xxs"
                            py="xs"
                            style={{
                                borderRadius: 'var(--mantine-radius-sm)',
                            }}
                        >
                            <ScrollArea.Autosize mah={300}>
                                <Stack gap="xs">
                                    {uniqueCategories.map(
                                        ([rawKey, label], idx) => (
                                            <Group
                                                key={rawKey}
                                                gap="xs"
                                                wrap="nowrap"
                                            >
                                                <ColorSelector
                                                    color={
                                                        categoryColorOverrides[
                                                            rawKey
                                                        ] ??
                                                        colorPalette[
                                                            idx %
                                                                colorPalette.length
                                                        ]
                                                    }
                                                    swatches={colorPalette}
                                                    onColorChange={(color) =>
                                                        setCategoryColorOverride(
                                                            rawKey,
                                                            color,
                                                        )
                                                    }
                                                />
                                                <Text fz="xs" truncate>
                                                    {label}
                                                </Text>
                                            </Group>
                                        ),
                                    )}
                                    {remainingCount > 0 && (
                                        <Text fz="xs" c="dimmed" fs="italic">
                                            {remainingCount} more colored
                                            automatically
                                        </Text>
                                    )}
                                </Stack>
                            </ScrollArea.Autosize>
                        </Box>
                    </>
                )
            ) : (
                <ChartConditionalFormatting
                    colorPalette={colorPalette}
                    fields={targetFields}
                    enforceSingleTarget={enforceSingleTarget}
                    conditionalFormattings={conditionalFormattings}
                    onSetConditionalFormattings={onSetConditionalFormattings}
                />
            )}
        </>
    );
};
