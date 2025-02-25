import { type OrganizationColorPalette } from '@lightdash/common';
import {
    Accordion,
    Badge,
    Button,
    ColorInput,
    ColorSwatch,
    Group,
    Stack,
    Text,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconTrash } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import {
    useDeleteColorPalette,
    useUpdateColorPalette,
} from '../../../hooks/appearance/useOrganizationAppearance';
import MantineIcon from '../../common/MantineIcon';

interface PaletteAccordionItemProps {
    palette: OrganizationColorPalette;
    isDefault: boolean;
    onSetDefault: (uuid: string) => void;
}

export const PaletteAccordionItem: FC<PaletteAccordionItemProps> = ({
    palette,
    isDefault,
    onSetDefault,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const updateColorPalette = useUpdateColorPalette();
    const deleteColorPalette = useDeleteColorPalette();
    const form = useForm<{ colors: string[] }>({
        initialValues: { colors: palette.colors },
        validate: {
            colors: (value) =>
                value.every((c) => c.startsWith('#')) ? null : 'Invalid colors',
        },
    });

    const handleUpdatePalette = () => {
        updateColorPalette.mutate({
            uuid: palette.colorPaletteUuid,
            colors: form.values.colors,
        });
        setIsEditing(false);
    };

    const handleDeletePalette = () => {
        deleteColorPalette.mutate(palette.colorPaletteUuid);
    };

    const getColorPaletteColorStops = useCallback(
        (colors: string[], stops: number) => {
            const deltaAmount = Math.floor(colors.length / stops);
            /**
    
         * If for some reason we don't get enough color stops, or the number of stops
         * matches the available colors, we short-circuit and just return an equivalent
         * subset of colors:
         */
            if (deltaAmount <= 0 || stops === colors.length) {
                return colors.slice(0, colors.length);
            }

            /**
             * This is fairly inefficient, but we're doing this over a very small list,
             * in a very specific place only.
             */
            return colors
                .filter((c, i) => i % deltaAmount === 0)
                .slice(0, stops);
        },
        [],
    );

    return (
        <Accordion.Item value={palette.colorPaletteUuid}>
            <Accordion.Control>
                <Group spacing="xs">
                    <Text fw={500}>{palette.name}</Text>
                    <Group spacing="xxs">
                        {getColorPaletteColorStops(palette.colors, 4).map(
                            (color, index) => (
                                <ColorSwatch
                                    key={color + index}
                                    size={16}
                                    color={color}
                                />
                            ),
                        )}
                    </Group>
                    {isDefault && (
                        <Badge color="green" variant="light" radius="sm">
                            Active
                        </Badge>
                    )}
                    {isEditing && (
                        <Badge color="yellow" variant="light" radius="sm">
                            Editing...
                        </Badge>
                    )}
                </Group>
            </Accordion.Control>

            <Accordion.Panel>
                <Stack spacing="md">
                    <Group spacing="xs">
                        {form.values.colors.map((color, index) => (
                            <ColorInput
                                key={index}
                                value={color}
                                onChange={(newColor) =>
                                    form.setFieldValue(
                                        `colors.${index}`,
                                        newColor,
                                    )
                                }
                                readOnly={!isEditing}
                                size="xs"
                                radius="md"
                                swatches={palette.colors}
                            />
                        ))}
                    </Group>

                    <Group position="right" spacing="xs">
                        <Button
                            size="xs"
                            compact
                            variant="default"
                            onClick={() => {
                                setIsEditing(false);
                                handleDeletePalette();
                            }}
                            leftIcon={
                                <MantineIcon size="sm" icon={IconTrash} />
                            }
                            disabled={isDefault}
                        >
                            Delete
                        </Button>
                        <Button
                            size="xs"
                            compact
                            variant="default"
                            onClick={() => {
                                if (isEditing) {
                                    handleUpdatePalette();
                                } else {
                                    setIsEditing(true);
                                }
                            }}
                            loading={updateColorPalette.isLoading}
                        >
                            {isEditing ? 'Save Changes' : 'Edit Colors'}
                        </Button>

                        <Button
                            size="xs"
                            compact
                            onClick={() =>
                                onSetDefault(palette.colorPaletteUuid)
                            }
                            disabled={isDefault}
                        >
                            {isDefault ? 'Active' : 'Use This Theme'}
                        </Button>
                    </Group>
                </Stack>
            </Accordion.Panel>
        </Accordion.Item>
    );
};
