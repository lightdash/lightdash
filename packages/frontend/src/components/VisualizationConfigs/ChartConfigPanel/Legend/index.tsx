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
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';
import useEmbed from '../../../../ee/providers/Embed/useEmbed';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';
import UnitInput from '../../../common/UnitInput';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
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

    const { t } = useTranslation('vizConfig');
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
                    label={t('legend.customPosition')}
                    checked={!isAutoPosition}
                    onChange={toggleAuto}
                    classNames={{
                        label: classes.leftPositionedSwitchLabel,
                    }}
                />

                {!isAutoPosition && (
                    <UnitInputsGrid
                        centerLabel={t('legend.position')}
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
    const { t } = useTranslation('vizConfig');
    const projectUuid = useProjectUuid();
    // The SDK bundle ships no Monaco workers, so the HTML tooltip editor is not offered in embeds.
    const { embedToken } = useEmbed();

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
                    <Group gap="xs" align="center">
                        <Config.Heading>{t('legend.legend')}</Config.Heading>
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
                                <Config.Label>
                                    {t('legend.placement')}
                                </Config.Label>
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
                                            label: t('legend.chartArea'),
                                            value: 'custom',
                                        },
                                        {
                                            label: t('legend.outsideRight'),
                                            value: 'outsideRight',
                                        },
                                        {
                                            label: t('legend.outsideLeft'),
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
                                            {t('legend.scrollBehavior')}
                                        </Config.Label>
                                        <SegmentedControl
                                            size="xs"
                                            value={
                                                dirtyEchartsConfig?.legend
                                                    ?.type ?? 'scroll'
                                            }
                                            data={[
                                                {
                                                    label: t('legend.scroll'),
                                                    value: 'scroll',
                                                },
                                                {
                                                    label: t('legend.wrap'),
                                                    value: 'plain',
                                                },
                                            ]}
                                            onChange={(value) =>
                                                handleChange('type', value)
                                            }
                                        />
                                    </Group>
                                    <Group gap="xs">
                                        <Config.Label>
                                            {t('legend.orientation')}
                                        </Config.Label>
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
                                                    label: t(
                                                        'legend.horizontal',
                                                    ),
                                                    value: 'horizontal',
                                                },
                                                {
                                                    label: t('legend.vertical'),
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
                                        {t('legend.legendAreaWidth')}
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
                    <Config.Heading>{t('legend.tooltips')}</Config.Heading>
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
