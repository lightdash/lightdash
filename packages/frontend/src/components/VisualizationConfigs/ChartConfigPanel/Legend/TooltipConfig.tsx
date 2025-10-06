import { Box, Collapse, Group, Switch, Text, Tooltip } from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useFieldAutocompletions } from '../../../../hooks/codemirror/useFieldAutocompletions';
import { HtmlEditor } from '../../../CodeMirror';
import MantineIcon from '../../../common/MantineIcon';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';

type Props = {
    fields: string[];
};

export const TooltipConfig: FC<Props> = ({ fields }) => {
    const { visualizationConfig } = useVisualizationContext();
    const isCartesianChart =
        isCartesianVisualizationConfig(visualizationConfig);

    const [tooltipValue, setTooltipValue] = useState<string>(
        (isCartesianChart && visualizationConfig.chartConfig.tooltip) || '',
    );

    const autocompletions = useFieldAutocompletions(fields);

    useEffect(() => {
        if (!isCartesianChart) return;

        const { setTooltip } = visualizationConfig.chartConfig;
        setTooltip(tooltipValue);
    }, [isCartesianChart, tooltipValue, visualizationConfig.chartConfig]);

    const [show, setShow] = useState<boolean>(
        isCartesianChart ? !!visualizationConfig.chartConfig.tooltip : false,
    );

    return (
        <Config>
            <Config.Section>
                <Group spacing="xs" align="center">
                    <Config.Heading>Custom Tooltip</Config.Heading>
                    <Switch checked={show} onChange={() => setShow(!show)} />
                    <Tooltip
                        withinPortal={true}
                        maw={350}
                        variant="xs"
                        multiline
                        label="Use this input to enhance chart tooltips with additional content. You can incorporate HTML code and include dynamic values using the format ${variable_name}.
                                    Click here to read more about this on our docs."
                    >
                        <MantineIcon
                            onClick={() => {
                                window.open(
                                    'https://docs.lightdash.com/references/custom-tooltip',
                                    '_blank',
                                );
                            }}
                            icon={IconHelpCircle}
                            size="md"
                            display="inline"
                            color="gray"
                        />
                    </Tooltip>
                </Group>

                <Collapse in={show}>
                    {/* CodeMirror does not support placeholders natively, so this is a workaround to show the example tooltip
                    we show some text, by giving position absolute, it is placed on top of the editor*/}
                    {tooltipValue?.length === 0 ? (
                        <Text
                            ml="xxs"
                            pos="absolute"
                            w="400px"
                            c="gray.5"
                            style={{
                                pointerEvents: 'none',
                                zIndex: 100,
                                fontFamily: 'monospace',
                                fontSize: '12px',
                            }}
                        >
                            {`- Total orders: \${orders_total_amount}`}
                        </Text>
                    ) : null}
                    <Box
                        sx={(theme) => ({
                            boxShadow: theme.shadows.subtle,
                        })}
                    >
                        <HtmlEditor
                            value={tooltipValue}
                            onChange={setTooltipValue}
                            debounceMs={1000}
                            autocompletions={
                                autocompletions ? [autocompletions] : undefined
                            }
                            height="76px"
                            showLineNumbers={false}
                        />
                    </Box>
                </Collapse>
            </Config.Section>
        </Config>
    );
};
