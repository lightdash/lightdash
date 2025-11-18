import { type GaugeSection } from '@lightdash/common';
import { Accordion, Group, NumberInput, Stack } from '@mantine/core';
import { memo, type FC } from 'react';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../ColorSelector';
import { AccordionControl } from '../common/AccordionControl';

export type Props = {
    onClick: () => void;
    index: number;
    section: GaugeSection;
    onUpdate: (index: number, updatedSection: Partial<GaugeSection>) => void;
    onRemove: (index: number) => void;
};

const GaugeSectionComponent: FC<Props> = memo(
    ({ index, onClick, section, onUpdate, onRemove }) => {
        const { colorPalette } = useVisualizationContext();

        return (
            <Accordion.Item value={`${index}`}>
                <AccordionControl
                    label={`Section ${index + 1}`}
                    onControlClick={onClick}
                    onRemove={() => onRemove(index)}
                    extraControlElements={
                        <ColorSelector
                            color={section.color}
                            swatches={colorPalette}
                            onColorChange={(color) =>
                                onUpdate(index, { color })
                            }
                        />
                    }
                />
                <Accordion.Panel>
                    <Stack spacing="sm">
                        <Group spacing="sm">
                            <NumberInput
                                label="Min Value"
                                value={section.min}
                                onChange={(value) =>
                                    onUpdate(index, { min: Number(value) })
                                }
                                style={{ flex: 1 }}
                            />
                            <NumberInput
                                label="Max Value"
                                value={section.max}
                                onChange={(value) =>
                                    onUpdate(index, { max: Number(value) })
                                }
                                style={{ flex: 1 }}
                            />
                        </Group>
                    </Stack>
                </Accordion.Panel>
            </Accordion.Item>
        );
    },
);

export default GaugeSectionComponent;
