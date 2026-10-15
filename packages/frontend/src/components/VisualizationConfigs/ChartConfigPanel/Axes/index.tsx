import { CartesianSeriesType, type ItemsMap } from '@lightdash/common';
import { Button, Checkbox, Group, Stack } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberInput } from '../../../common/NumberInput';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';
import { AxesLabelSections } from './AxesLabelSections';

type Props = {
    itemsMap: ItemsMap | undefined;
};

export const Axes: FC<Props> = ({ itemsMap }) => {
    const { t } = useTranslation('vizConfig');
    const { visualizationConfig } = useVisualizationContext();

    if (!isCartesianVisualizationConfig(visualizationConfig)) return null;

    const {
        dirtyLayout,
        dirtyEchartsConfig,
        setShowGridX,
        setShowGridY,
        setShowXAxis,
        setShowLeftYAxis,
        setShowRightYAxis,
        setShowAxisTicks,
        setConnectNulls,
        setAxisLabelFontSize,
        setAxisTitleFontSize,
        dirtyChartType,
    } = visualizationConfig.chartConfig;

    const showXAxis =
        dirtyLayout?.showXAxis !== undefined ? dirtyLayout?.showXAxis : true;
    // Legacy showYAxis is used as fallback for independent axis controls
    const legacyShowYAxis =
        dirtyLayout?.showYAxis !== undefined ? dirtyLayout?.showYAxis : true;
    const showLeftYAxis =
        dirtyLayout?.showLeftYAxis !== undefined
            ? dirtyLayout?.showLeftYAxis
            : legacyShowYAxis;
    const showRightYAxis =
        dirtyLayout?.showRightYAxis !== undefined
            ? dirtyLayout?.showRightYAxis
            : legacyShowYAxis;
    // Determine if there are series on each Y-axis
    const hasSeriesOnLeftAxis = (dirtyEchartsConfig?.series || []).some(
        (series) => (series.yAxisIndex || 0) === 0,
    );
    const hasSeriesOnRightAxis = (dirtyEchartsConfig?.series || []).some(
        (series) => series.yAxisIndex === 1,
    );
    // Only show axis controls when not flipped and there are series on that axis
    const hasPrimaryYAxis = !dirtyLayout?.flipAxes && hasSeriesOnLeftAxis;
    const hasSecondaryYAxis = !dirtyLayout?.flipAxes && hasSeriesOnRightAxis;

    return (
        <Stack>
            <AxesLabelSections itemsMap={itemsMap} />

            <Config>
                <Config.Section>
                    <Config.Heading>{t('axes.showGrid')}</Config.Heading>

                    <Stack gap="xs">
                        <Checkbox
                            size="xs"
                            label={
                                dirtyLayout?.flipAxes
                                    ? t('axes.yAxis')
                                    : t('axes.xAxis')
                            }
                            checked={!!dirtyLayout?.showGridX}
                            onChange={() => {
                                setShowGridX(!dirtyLayout?.showGridX);
                            }}
                        />

                        <Checkbox
                            size="xs"
                            label={
                                dirtyLayout?.flipAxes
                                    ? t('axes.xAxis')
                                    : t('axes.yAxis')
                            }
                            checked={
                                dirtyLayout?.showGridY !== undefined
                                    ? dirtyLayout?.showGridY
                                    : true
                            }
                            onChange={() => {
                                setShowGridY(
                                    dirtyLayout?.showGridY !== undefined
                                        ? !dirtyLayout?.showGridY
                                        : false,
                                );
                            }}
                        />
                    </Stack>
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>{t('axes.showAxis')}</Config.Heading>

                    <Stack gap="xs">
                        <Checkbox
                            size="xs"
                            label={
                                dirtyLayout?.flipAxes
                                    ? t('axes.yAxis')
                                    : t('axes.xAxis')
                            }
                            checked={
                                dirtyLayout?.flipAxes
                                    ? showLeftYAxis
                                    : showXAxis
                            }
                            onChange={() => {
                                if (dirtyLayout?.flipAxes) {
                                    setShowLeftYAxis(!showLeftYAxis);
                                } else {
                                    setShowXAxis(!showXAxis);
                                }
                            }}
                        />
                        {(dirtyLayout?.flipAxes || hasPrimaryYAxis) && (
                            <Checkbox
                                size="xs"
                                label={
                                    dirtyLayout?.flipAxes
                                        ? t('axes.xAxis')
                                        : t('axes.leftYAxis')
                                }
                                checked={
                                    dirtyLayout?.flipAxes
                                        ? showXAxis
                                        : showLeftYAxis
                                }
                                onChange={() => {
                                    if (dirtyLayout?.flipAxes) {
                                        setShowXAxis(!showXAxis);
                                    } else {
                                        setShowLeftYAxis(!showLeftYAxis);
                                    }
                                }}
                            />
                        )}
                        {hasSecondaryYAxis && (
                            <Checkbox
                                size="xs"
                                label={t('axes.rightYAxis')}
                                checked={showRightYAxis}
                                onChange={() => {
                                    setShowRightYAxis(!showRightYAxis);
                                }}
                            />
                        )}
                    </Stack>
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>{t('axes.showTickLines')}</Config.Heading>
                    <Checkbox
                        size="xs"
                        label={t('axes.showTickLinesOnAxes')}
                        checked={!!dirtyEchartsConfig?.showAxisTicks}
                        onChange={(e) => {
                            setShowAxisTicks(e.currentTarget.checked);
                        }}
                    />
                </Config.Section>
            </Config>
            {(dirtyChartType === CartesianSeriesType.LINE ||
                dirtyChartType === CartesianSeriesType.AREA) && (
                <Config>
                    <Config.Section>
                        <Config.Heading>
                            {t('axes.connectNulls')}
                        </Config.Heading>
                        <Checkbox
                            size="xs"
                            label={t('axes.connectNullsLabel')}
                            checked={
                                dirtyLayout?.connectNulls !== undefined
                                    ? dirtyLayout.connectNulls
                                    : true
                            }
                            onChange={(e) => {
                                setConnectNulls(e.currentTarget.checked);
                            }}
                        />
                    </Config.Section>
                </Config>
            )}
            <Config>
                <Config.Section>
                    <Config.Heading>{t('axes.tickLabelSize')}</Config.Heading>
                    <Group gap="xs">
                        <NumberInput
                            size="xs"
                            value={
                                dirtyEchartsConfig?.axisLabelFontSize ?? 11.5
                            }
                            min={8}
                            max={24}
                            step={0.5}
                            decimalScale={1}
                            fixedDecimalScale
                            maw={60}
                            onNumberChange={setAxisLabelFontSize}
                        />
                        {dirtyEchartsConfig?.axisLabelFontSize !==
                            undefined && (
                            <Button
                                variant="subtle"
                                size="xs"
                                onClick={() => setAxisLabelFontSize(undefined)}
                            >
                                {t('axes.reset')}
                            </Button>
                        )}
                    </Group>
                </Config.Section>
            </Config>
            <Config>
                <Config.Section>
                    <Config.Heading>{t('axes.axisTitleSize')}</Config.Heading>
                    <Group gap="xs">
                        <NumberInput
                            size="xs"
                            value={dirtyEchartsConfig?.axisTitleFontSize ?? 12}
                            min={8}
                            max={24}
                            step={0.5}
                            decimalScale={1}
                            fixedDecimalScale
                            maw={60}
                            onNumberChange={setAxisTitleFontSize}
                        />
                        {dirtyEchartsConfig?.axisTitleFontSize !==
                            undefined && (
                            <Button
                                variant="subtle"
                                size="xs"
                                onClick={() => setAxisTitleFontSize(undefined)}
                            >
                                {t('axes.reset')}
                            </Button>
                        )}
                    </Group>
                </Config.Section>
            </Config>
        </Stack>
    );
};
