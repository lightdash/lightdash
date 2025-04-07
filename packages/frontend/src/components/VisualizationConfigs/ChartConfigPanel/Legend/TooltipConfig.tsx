import type {
    CompiledDimension,
    CustomDimension,
    Field,
    TableCalculation,
} from '@lightdash/common';
import { Collapse, Group, Switch, Textarea } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useEffect, useState, type FC } from 'react';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';

type Props = {
    items: (Field | TableCalculation | CustomDimension | CompiledDimension)[];
    projectUuid: string;
};

export const TooltipConfig: FC<Props> = ({}) => {
    const { visualizationConfig } = useVisualizationContext();
    const isCartesianChart =
        isCartesianVisualizationConfig(visualizationConfig);

    const [tooltipValue, setTooltipValue] = useState<string>('');
    const [debouncedTooltipValue] = useDebouncedValue(tooltipValue, 1000);

    useEffect(() => {
        if (!isCartesianChart) return;

        const { setTooltip } = visualizationConfig.chartConfig;

        setTooltip(debouncedTooltipValue);
    }, [
        isCartesianChart,
        debouncedTooltipValue,
        visualizationConfig.chartConfig,
    ]);

    const [show, setShow] = useState<boolean>(
        isCartesianChart ? !!visualizationConfig.chartConfig.tooltip : false,
    );

    return (
        <Config>
            <Config.Section>
                <Group spacing="xs" align="center">
                    <Config.Heading>Custom Tooltip</Config.Heading>
                    <Switch checked={show} onChange={() => setShow(!show)} />
                </Group>

                <Collapse in={show}>
                    <Textarea
                        maxRows={10}
                        autosize
                        value={tooltipValue}
                        onChange={(
                            e: React.ChangeEvent<HTMLTextAreaElement>,
                        ) => {
                            setTooltipValue(e.target.value);
                        }}
                        placeholder="<p>Place your HTML code here</p>"
                    />
                </Collapse>
            </Config.Section>
        </Config>
    );
};
