import { lightdashEchartsTheme } from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { forwardRef, useMemo } from 'react';
import { resolveCssVariablesInOptions } from '../utils/resolveEchartsCssVariables';
import { sanitizeEchartsFontFamily } from '../utils/sanitizeEchartsFontFamily';
import EChartsReact, {
    type EChartsReact as EChartsReactInstance,
    type EChartsReactProps,
} from './EChartsReactWrapper';

// Opt in only the visualization renderers whose options use these defaults.
const LightdashECharts = forwardRef<EChartsReactInstance, EChartsReactProps>(
    ({ option, theme: themeOverride, ...props }, ref) => {
        const mantineTheme = useMantineTheme();
        const chartFont = sanitizeEchartsFontFamily(
            mantineTheme.other.chartFont,
        );
        const theme = useMemo(
            () =>
                props.opts?.renderer === 'canvas'
                    ? resolveCssVariablesInOptions(
                          lightdashEchartsTheme,
                          (variable) => {
                              const color = variable.match(
                                  /^--mantine-color-(.+)-(\d+)$/,
                              );
                              return color
                                  ? (mantineTheme.colors[color[1]]?.[
                                        Number(color[2])
                                    ] ?? '')
                                  : '';
                          },
                      )
                    : lightdashEchartsTheme,
            [props.opts?.renderer, mantineTheme],
        );
        // Apply font changes through setOption to retain the chart instance.
        const themedOption = useMemo(
            () => ({
                ...option,
                textStyle: { fontFamily: chartFont, ...option.textStyle },
            }),
            [option, chartFont],
        );

        return (
            <EChartsReact
                {...props}
                ref={ref}
                theme={themeOverride ?? theme}
                option={themedOption}
            />
        );
    },
);

LightdashECharts.displayName = 'LightdashECharts';

export default LightdashECharts;
