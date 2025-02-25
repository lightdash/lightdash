import { type OrganizationColorPalette } from '@lightdash/common';
import {
    Button,
    Card,
    ColorSwatch,
    Group,
    Modal,
    type ModalProps,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC, useState } from 'react';
import {
    useColorPalettes,
    useCreateColorPalette,
} from '../../../hooks/appearance/useOrganizationAppearance';
import useToaster from '../../../hooks/toaster/useToaster';
import { PRESET_COLOR_PALETTES } from './palettes';
type Props = ModalProps;

export const CreatePaletteModal: FC<Props> = ({ opened, onClose }) => {
    const { data: palettes } = useColorPalettes();
    const { showToastSuccess, showToastApiError } = useToaster();
    const [selectedPreset, setSelectedPreset] = useState<
        Pick<OrganizationColorPalette, 'name' | 'colors'> | undefined
    >();

    const presetForm = useForm<{
        name: string;
        colors: string[];
    }>({
        initialValues: {
            name: '',
            colors: PRESET_COLOR_PALETTES[0].colors,
        },
        validate: {
            name: (value) =>
                value.trim().length >= 3
                    ? null
                    : 'Name must be at least 3 characters',
            colors: (value) =>
                value.length > 0 ? null : 'Please select a base preset',
        },
    });
    const createColorPalette = useCreateColorPalette();

    const handleSubmit = presetForm.onSubmit((values) => {
        if (palettes?.some((palette) => palette.name === values.name)) {
            presetForm.setFieldError('name', 'Name must be unique');
            return;
        }
        createColorPalette.mutate(
            {
                name: values.name,
                colors: values.colors,
            },
            {
                onSuccess: (newPalette) => {
                    onClose();
                    presetForm.reset();
                    setSelectedPreset(undefined);

                    showToastSuccess({
                        title: `Palette "${newPalette.name}" created successfully`,
                    });
                },
                onError: (error) => {
                    showToastApiError({
                        title: 'Failed to create palette',
                        apiError: error.error,
                    });
                },
            },
        );
    });

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Create new palette"
            size="xl"
        >
            <form onSubmit={handleSubmit}>
                <TextInput
                    label="Palette name"
                    placeholder="Enter a unique name"
                    required
                    radius="md"
                    {...presetForm.getInputProps('name')}
                    error={presetForm.errors.name}
                />

                <Text mt="md" fw={500} color="gray.7">
                    Choose a base preset:
                </Text>
                {presetForm.errors.colors && (
                    <Text color="red" size="sm" mt="xs">
                        {presetForm.errors.colors}
                    </Text>
                )}

                <SimpleGrid cols={3} mt="sm">
                    {PRESET_COLOR_PALETTES.map((preset) => (
                        <Card
                            key={preset.name}
                            withBorder
                            sx={(theme) => ({
                                cursor: 'pointer',

                                '&:hover': {
                                    borderColor: theme.colors.blue[4],
                                },
                                '&[data-with-border]': {
                                    border: `1px solid ${
                                        selectedPreset?.name === preset.name
                                            ? theme.colors.blue[6]
                                            : theme.colors.gray[3]
                                    }`,
                                },
                                transition: 'border-color 150ms ease',
                            })}
                            onClick={() => {
                                setSelectedPreset(preset);
                                presetForm.setFieldValue(
                                    'colors',
                                    preset.colors,
                                );
                            }}
                            radius="md"
                            shadow="subtle"
                        >
                            <Stack spacing="xs">
                                <Group spacing={4}>
                                    {preset.colors.slice(0, 5).map((color) => (
                                        <ColorSwatch
                                            key={color}
                                            color={color}
                                            size={16}
                                        />
                                    ))}
                                </Group>
                                <Group spacing="xs">
                                    <Text size="sm" fw={500}>
                                        {preset.name}
                                    </Text>
                                </Group>
                            </Stack>
                        </Card>
                    ))}
                </SimpleGrid>

                <Group position="right" mt="md">
                    <Button
                        type="submit"
                        disabled={!presetForm.isValid()}
                        loading={createColorPalette.isLoading}
                    >
                        Create palette
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};
