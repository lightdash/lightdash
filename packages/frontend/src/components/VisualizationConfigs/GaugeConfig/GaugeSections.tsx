import { type GaugeSection } from '@lightdash/common';
import { Accordion, Stack } from '@mantine/core';
import { memo, useCallback, type FC } from 'react';
import { isGaugeVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { AddButton } from '../common/AddButton';
import { Config } from '../common/Config';
import { useControlledAccordion } from '../common/hooks/useControlledAccordion';
import GaugeSectionComponent from './GaugeSection';

const GaugeSections: FC = memo(() => {
    const { openItems, handleAccordionChange, addNewItem, removeItem } =
        useControlledAccordion();

    const { visualizationConfig } = useVisualizationContext();

    const isGaugeChart = isGaugeVisualizationConfig(visualizationConfig);

    const addSection = useCallback(() => {
        if (!isGaugeChart) {
            return;
        }
        const {
            chartConfig: { setSections, min, max },
        } = visualizationConfig;

        const newSection: GaugeSection = {
            min: min,
            max: max,
            color: '#5470c6',
        };
        setSections((prev) => {
            const newSections = [...prev, newSection];
            addNewItem(`${newSections.length}`);
            return newSections;
        });
    }, [addNewItem, isGaugeChart, visualizationConfig]);

    const updateSection = useCallback(
        (index: number, updatedSection: Partial<GaugeSection>) => {
            if (!isGaugeChart) {
                return;
            }
            const {
                chartConfig: { setSections },
            } = visualizationConfig;

            setSections((prev) => {
                const newSections = [...prev];
                newSections[index] = {
                    ...newSections[index],
                    ...updatedSection,
                };
                return newSections;
            });
        },
        [isGaugeChart, visualizationConfig],
    );

    const removeSection = useCallback(
        (index: number) => {
            if (!isGaugeChart) {
                return;
            }
            const {
                chartConfig: { setSections },
            } = visualizationConfig;
            setSections((prev) => prev.filter((_, i) => i !== index));
        },
        [isGaugeChart, visualizationConfig],
    );

    if (!isGaugeChart) {
        return null;
    }

    const {
        chartConfig: { sections },
    } = visualizationConfig;

    return (
        <Config>
            <Config.Section>
                <Config.Group>
                    <Config.Heading>Sections</Config.Heading>
                    <AddButton onClick={addSection} />
                </Config.Group>

                <Stack spacing="md">
                    {sections.length > 0 && (
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
                            {sections.map((section, index) => (
                                <GaugeSectionComponent
                                    key={index}
                                    index={index}
                                    onClick={() => {
                                        const indexString = `${index}`;
                                        return openItems.includes(indexString)
                                            ? removeItem(indexString)
                                            : addNewItem(indexString);
                                    }}
                                    onUpdate={updateSection}
                                    onRemove={removeSection}
                                    section={section}
                                />
                            ))}
                        </Accordion>
                    )}
                </Stack>
            </Config.Section>
        </Config>
    );
});
export default GaugeSections;
