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
    Stack,
    SegmentedControl,
    Switch,
} from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { lazy, Suspense, useMemo, useState, type FC } from 'react';
import { useToggle } from 'react-use';
import useEmbed from '../../../../ee/providers/Embed/useEmbed';
import {
    selectCartesianEchartsConfig,
    selectCartesianSeries,
    useVisualizationSelector,
    type VisualizationStoreState,
} from '../../../../features/visualization/store';
import { useCartesianEditorActions } from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';
import UnitInput from '../../../common/UnitInput';
import { Config } from '../../common/Config';
import { UnitInputsGrid } from '../common/UnitInputsGrid';
import classes from './Legend.module.css';
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
    const debouncedOnCommit = useDebouncedCallback(onCommit, {
        delay: 300,
        flushOnUnmount: true,
    });

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
            onBlur={() => debouncedOnCommit.flush()}
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
                    size="xs"
                    labelPosition="left"
                    label={`Custom position`}
                    checked={!isAutoPosition}
                    onChange={toggleAuto}
                    classNames={{
                        label: classes.leftPositionedSwitchLabel,
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

const selectLegend = (state: VisualizationStoreState) =>
    selectCartesianEchartsConfig(state)?.legend;
const selectGrid = (state: VisualizationStoreState) =>
    selectCartesianEchartsConfig(state)?.grid;

export const Legend: FC<Props> = ({ items }) => {
    const projectUuid = useProjectUuid();
    // The SDK bundle ships no Monaco workers, so the HTML tooltip editor is not offered in embeds.
    const { embedToken } = useEmbed();

    const series = useVisualizationSelector(selectCartesianSeries);
    const legend = useVisualizationSelector(selectLegend);
    const grid = useVisualizationSelector(selectGrid);
    const { setLegend, mergeGrid } = useCartesianEditorActions();

    // Extract fields used in autocomplete for tooltip
    // for non pivot charts, we can use all items in results
    // for pivot charts, we need to extract the fields used in the chart config, including pivot values
    const autocompleteFieldsTooltip = useMemo(() => {
        const allEncodes: Series['encode'][] =
            series?.map((serie) => serie.encode) ?? [];

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
    }, [series, items]);

    const legendConfig = legend ?? {};

    const handleChange = (
        prop: string,
        newValue: string | boolean | undefined,
    ) => {
        const newState = { ...legendConfig, [prop]: newValue };
        setLegend(newState);
        return newState;
    };

    const showDefault = (series || []).length > 1;
    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Group gap="xs" align="center">
                        <Config.Heading>Legend</Config.Heading>
                        <Switch
                            size="xs"
                            checked={legendConfig.show ?? showDefault}
                            onChange={(e) =>
                                handleChange('show', e.currentTarget.checked)
                            }
                        />
                    </Group>

                    <Collapse expanded={legendConfig.show ?? showDefault}>
                        <Stack gap="xs">
                            <Group gap="xs">
                                <Config.Label>Placement</Config.Label>
                                <SegmentedControl
                                    size="xs"
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
                                    <Group gap="xs">
                                        <Config.Label>
                                            Scroll behavior
                                        </Config.Label>
                                        <SegmentedControl
                                            size="xs"
                                            value={legend?.type ?? 'scroll'}
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
                                    <Group gap="xs">
                                        <Config.Label>Orientation</Config.Label>
                                        <SegmentedControl
                                            size="xs"
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
                                <Group gap="xs">
                                    <Config.Label>
                                        Legend area width
                                    </Config.Label>
                                    <LegendAreaWidthInput
                                        key={legendConfig.placement}
                                        initialValue={
                                            (legendConfig.placement ===
                                            'outsideRight'
                                                ? grid?.right
                                                : grid?.left) || '25%'
                                        }
                                        onCommit={(value) => {
                                            const gridSide =
                                                legendConfig.placement ===
                                                'outsideRight'
                                                    ? 'right'
                                                    : 'left';
                                            mergeGrid({ [gridSide]: value });
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
                    {projectUuid && !embedToken && (
                        <Suspense fallback={<Loader size="sm" />}>
                            <TooltipConfig fields={autocompleteFieldsTooltip} />
                        </Suspense>
                    )}
                </Config.Section>
            </Config>
        </Stack>
    );
};
