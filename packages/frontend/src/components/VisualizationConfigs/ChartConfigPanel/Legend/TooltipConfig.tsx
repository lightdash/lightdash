import { Accordion, Textarea } from '@mantine/core';
import { useCallback, type FC } from 'react';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import { Config } from '../../common/Config';
import { useControlledAccordion } from '../../common/hooks/useControlledAccordion';

type Props = {};

export const TooltipConfig: FC<Props> = ({}) => {
    const { openItems, handleAccordionChange } = useControlledAccordion();

    const { visualizationConfig } = useVisualizationContext();
    const isCartesianChart =
        isCartesianVisualizationConfig(visualizationConfig);

    const setTooltipText = useCallback(
        (value: string) => {
            if (!isCartesianChart) return;

            const { setTooltip } = visualizationConfig.chartConfig;

            setTooltip(value);
        },
        [isCartesianChart, visualizationConfig],
    );

    return (
        <Config>
            <Config.Section>
                <Config.Group>
                    <Config.Heading>Tooltip config</Config.Heading>
                </Config.Group>

                <Accordion
                    multiple
                    variant="contained"
                    value={openItems}
                    onChange={handleAccordionChange}
                    styles={(theme) => ({
                        control: {
                            padding: theme.spacing.xs,
                        },
                        label: {
                            padding: 0,
                        },
                        panel: {
                            padding: 0,
                        },
                    })}
                >
                    <Textarea
                        maxRows={10}
                        autosize
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                            setTooltipText(e.target.value)
                        }
                    />
                </Accordion>
            </Config.Section>
        </Config>
    );
};
