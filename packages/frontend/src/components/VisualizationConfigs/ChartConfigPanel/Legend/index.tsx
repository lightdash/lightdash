import {
    getFieldRef,
    isField,
    isPivotReferenceWithValues,
    type CompiledDimension,
    type CustomDimension,
    type EchartsLegend,
    type Field,
    type LegendPlacement,
    type Series,
    type TableCalculation,
} from '@lightdash/common';
import {
    Collapse,
    Group,
    Loader,
    SegmentedControl,
    Stack,
    Switch,
} from '@mantine/core';
import { useDebouncedCallback } from '@mantine-8/hooks';
import { lazy, Suspense, useMemo, useState, type FC } from 'react';
import { useParams } from 'react-router';
import { useToggle } from 'react-use';
import UnitInput from '../../../common/UnitInput';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';
import { UnitInputsGrid } from '../common/UnitInputsGrid';
import { ReferenceLines } from './ReferenceLines';
import { TooltipSortConfig } from './TooltipSortConfig';

// Lazy load because it imports heavy module "@monaco-editor/react"
const TooltipConfig = lazy(() =>
    import('./TooltipConfig').then((module) => ({
        default: module.TooltipConfig,
    })),
);

enum Positions {
    Left = 'left',
    Right = 'right',
    Top = 'top',
    Bottom = 'bottom',
}

type MarginConfigurationProps = {
    legendConfig: EchartsLegend;
    handleChange: (prop: string, newValue: string | undefined) => void;
};

type LegendAreaWidthInputProps = {
    /** Initial value from the chart's grid config. */
    initialValue: string;
    /** Called with the debounced value so the chart re-renders less often. */
    onCommit: (value: string) => void;
};

const LegendAreaWidthInput: FC<LegendAreaWidthInputProps> = ({
    initialValue,
    onCommit,
}) => {
    const [value, setValue] = useState(initialValue);
    const debouncedOnCommit = useDebouncedCallback(onCommit, 300);

    return (
        <UnitInput
            size="xs"
            w={80}
            name="legendAreaWidth"
            units={['%', 'px']}
            value={value}
            defaultValue={initialValue}
            onChange={(next) => {
                const v = next ?? '';
                setValue(v);
                if (v) debouncedOnCommit(v);
            }}
        />
    );
};

const PositionConfiguration: FC<MarginConfigurationProps> = ({
    legendConfig,
    handleChange,
}) => {
    const hasPositionConfigChanged = (
        config: MarginConfigurationProps['legendConfig'],
    ) => {
        const positionValues = Object.values(Positions);

        return Object.keys(config).some((key) =>
            positionValues.includes(key as Positions),
        );
    };

    const [isAutoPosition, toggleAuto] = useToggle(
        !hasPositionConfigChanged(legendConfig),
    );

    const defaultConfig = {
        top: 'auto',
        left: 'auto',
        right: 'auto',
        bottom: 'auto',
    };

    return (
        <Config>
            <Config.Section>
                <Switch
                    labelPosition="left"
                    label={`Custom position`}
                    checked={!isAutoPosition}
                    onChange={toggleAuto}
                    styles={{
                        label: {
                            paddingLeft: 0,
                        },
                    }}
                />

                {!isAutoPosition && (
                    <UnitInputsGrid
                        centerLabel="Position"
                        config={legendConfig}
                        onChange={(position, newValue) =>
                            handleChange(position, newValue)
                        }
                        defaultConfig={defaultConfig}
                    />
                )}
            </Config.Section>
        </Config>
    );
};

type Props = {
    items: (Field | TableCalculation | CompiledDimension | CustomDimension)[];
};

export const Legend: FC<Props> = ({ items }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const { visualizationConfig } = useVisualizationContext();

    // Extract fields used in autocomplete for tooltip
    // for non pivot charts, we can use all items in results
    // for pivot charts, we need to extract the fields used in the chart config, including pivot values
    const autocompleteFieldsTooltip = useMemo(() => {
        if (!isCartesianVisualizationConfig(visualizationConfig)) return [];

        const { dirtyEchartsConfig: echartsConfig } =
            visualizationConfig.chartConfig;

        const allEncodes: Series['encode'][] =
            echartsConfig?.series?.map((serie) => serie.encode) ?? [];

        const hasPivot = allEncodes.some((serie) =>
            isPivotReferenceWithValues(serie.yRef),
        );
        if (!hasPivot)
            return items.map((item) =>
                isField(item)
                    ? getFieldRef(item).replace(/\./g, '_')
                    : item.name,
            );

        const fieldSet = allEncodes.reduce<Set<string>>((acc, encode) => {
            acc.add(encode.xRef.field);
            if (encode.yRef.pivotValues !== undefined) {
                // Add the simple metric name for convenience
                acc.add(encode.yRef.field);
                // Add the full pivot reference format
                encode.yRef.pivotValues.forEach((pivotValue) => {
                    acc.add(
                        `${encode.yRef.field}.${pivotValue.field}.${pivotValue.value}`,
                    );
                });
            } else {
                acc.add(encode.yRef.field);
            }
            return acc;
        }, new Set<string>());

        return [...fieldSet];
    }, [visualizationConfig, items]);
    if (!isCartesianVisualizationConfig(visualizationConfig)) return null;

    const { dirtyEchartsConfig, setLegend, setGrid } =
        visualizationConfig.chartConfig;

    const legendConfig = dirtyEchartsConfig?.legend ?? {};

    const handleChange = (
        prop: string,
        newValue: string | boolean | undefined,
    ) => {
        const newState = { ...legendConfig, [prop]: newValue };
        setLegend(newState);
        return newState;
    };

    const showDefault = (dirtyEchartsConfig?.series || []).length > 1;
    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Group spacing="xs" align="center">
                        <Config.Heading>Legend</Config.Heading>
                        <Switch
                            checked={legendConfig.show ?? showDefault}
                            onChange={(e) =>
                                handleChange('show', e.currentTarget.checked)
                            }
                        />
                    </Group>

                    <Collapse in={legendConfig.show ?? showDefault}>
                        <Stack spacing="xs">
                            <Group spacing="xs">
                                <Config.Label>Placement</Config.Label>
                                <SegmentedControl
                                    name="placement"
                                    value={legendConfig.placement ?? 'custom'}
                                    onChange={(val) =>
                                        handleChange(
                                            'placement',
                                            val as LegendPlacement,
                                        )
                                    }
                                    data={[
                                        {
                                            label: 'Chart area',
                                            value: 'custom',
                                        },
                                        {
                                            label: 'Outside right',
                                            value: 'outsideRight',
                                        },
                                        {
                                            label: 'Outside left',
                                            value: 'outsideLeft',
                                        },
                                    ]}
                                />
                            </Group>
                            {(legendConfig.placement ?? 'custom') ===
                                'custom' && (
                                <>
                                    <Group spacing="xs">
                                        <Config.Label>
                                            Scroll behavior
                                        </Config.Label>
                                        <SegmentedControl
                                            value={
                                                dirtyEchartsConfig?.legend
                                                    ?.type ?? 'scroll'
                                            }
                                            data={[
                                                {
                                                    label: 'Scroll',
                                                    value: 'scroll',
                                                },
                                                {
                                                    label: 'Wrap',
                                                    value: 'plain',
                                                },
                                            ]}
                                            onChange={(value) =>
                                                handleChange('type', value)
                                            }
                                        />
                                    </Group>
                                    <Group spacing="xs">
                                        <Config.Label>Orientation</Config.Label>
                                        <SegmentedControl
                                            name="orient"
                                            value={
                                                legendConfig.orient ??
                                                'horizontal'
                                            }
                                            onChange={(val) =>
                                                handleChange('orient', val)
                                            }
                                            data={[
                                                {
                                                    label: 'Horizontal',
                                                    value: 'horizontal',
                                                },
                                                {
                                                    label: 'Vertical',
                                                    value: 'vertical',
                                                },
                                            ]}
                                        />
                                    </Group>
                                    <PositionConfiguration
                                        legendConfig={legendConfig}
                                        handleChange={handleChange}
                                    />
                                </>
                            )}
                            {(legendConfig.placement === 'outsideRight' ||
                                legendConfig.placement === 'outsideLeft') && (
                                <Group spacing="xs">
                                    <Config.Label>
                                        Legend area width
                                    </Config.Label>
                                    <LegendAreaWidthInput
                                        key={legendConfig.placement}
                                        initialValue={
                                            (legendConfig.placement ===
                                            'outsideRight'
                                                ? dirtyEchartsConfig?.grid
                                                      ?.right
                                                : dirtyEchartsConfig?.grid
                                                      ?.left) || '25%'
                                        }
                                        onCommit={(value) => {
                                            const gridSide =
                                                legendConfig.placement ===
                                                'outsideRight'
                                                    ? 'right'
                                                    : 'left';
                                            setGrid({
                                                ...(dirtyEchartsConfig?.grid ??
                                                    {}),
                                                [gridSide]: value,
                                            });
                                        }}
                                    />
                                </Group>
                            )}
                        </Stack>
                    </Collapse>
                </Config.Section>
            </Config>
            {projectUuid && (
                <ReferenceLines items={items} projectUuid={projectUuid} />
            )}
            <Config>
                <Config.Section>
                    <Config.Heading>Tooltips</Config.Heading>
                    <TooltipSortConfig />
                    {projectUuid && (
                        <Suspense fallback={<Loader size="sm" />}>
                            <TooltipConfig fields={autocompleteFieldsTooltip} />
                        </Suspense>
                    )}
                </Config.Section>
            </Config>
        </Stack>
    );
};
