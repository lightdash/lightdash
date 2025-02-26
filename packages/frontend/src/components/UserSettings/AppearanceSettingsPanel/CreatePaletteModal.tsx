import { type ModalProps } from '@mantine/core';
import { type FC } from 'react';
import {
    useColorPalettes,
    useCreateColorPalette,
} from '../../../hooks/appearance/useOrganizationAppearance';
import useToaster from '../../../hooks/toaster/useToaster';
import { PaletteModalBase, type PaletteFormValues } from './PaletteModalBase';
import { PRESET_COLOR_PALETTES } from './palettes';

type Props = Pick<ModalProps, 'opened' | 'onClose'>;

export const CreatePaletteModal: FC<Props> = ({ opened, onClose }) => {
    const { data: palettes = [] } = useColorPalettes();
    const { showToastSuccess, showToastApiError } = useToaster();
    const createColorPalette = useCreateColorPalette();

    const handleCreatePalette = (values: PaletteFormValues) => {
        if (!values.name) return;

        createColorPalette.mutate(
            {
                name: values.name,
                colors: values.colors,
            },
            {
                onSuccess: (newPalette) => {
                    onClose();
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
    };

    return (
        <PaletteModalBase
            opened={opened}
            onClose={onClose}
            onSubmit={handleCreatePalette}
            isLoading={createColorPalette.isLoading}
            initialValues={{
                name: '',
                colors: PRESET_COLOR_PALETTES[0].colors,
            }}
            title="Create new palette"
            submitButtonText="Create palette"
            existingPaletteNames={palettes.map((p) => p.name)}
        />
    );
};
