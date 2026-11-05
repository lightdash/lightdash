import { Accordion, Stack } from '@mantine/core';
import { memo, type FC } from 'react';
import {
    selectGaugeEditor,
    useVisualizationSelector,
} from '../../../features/visualization/store';
import { useGaugeEditorActions } from '../../../hooks/useGaugeChartConfig';
import accordionClasses from '../common/Accordion.module.css';
import { AddButton } from '../common/AddButton';
import { Config } from '../common/Config';
import { useControlledAccordion } from '../common/hooks/useControlledAccordion';
import GaugeSectionComponent from './GaugeSection';

const GaugeSections: FC = memo(() => {
    const { openItems, handleAccordionChange, addNewItem, removeItem } =
        useControlledAccordion();
    const sections = useVisualizationSelector(
        (state) => selectGaugeEditor(state).sections,
    );
    const { addSection, updateSection, removeSection } =
        useGaugeEditorActions();

    return (
        <Config>
            <Config.Section>
                <Config.Group>
                    <Config.Heading>Sections</Config.Heading>
                    <AddButton
                        onClick={() => {
                            addSection();
                            addNewItem(`${sections.length}`);
                        }}
                    />
                </Config.Group>

                <Stack gap="md">
                    {sections.length > 0 && (
                        <Accordion
                            multiple
                            variant="contained"
                            value={openItems}
                            onChange={handleAccordionChange}
                            className={accordionClasses.containedList}
                            classNames={{
                                control: accordionClasses.containedControl,
                                label: accordionClasses.containedLabel,
                            }}
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
