import { type OrganizationColorPalette } from '@lightdash/common';
import { type ModalProps } from '@mantine/core';
import { type FC } from 'react';
import {
    useColorPalettes,
    useUpdateColorPalette,
} from '../../../hooks/appearance/useOrganizationAppearance';
import useToaster from '../../../hooks/toaster/useToaster';
import { PaletteModalBase, type PaletteFormValues } from './PaletteModalBase';

type EditPaletteModalProps = Pick<ModalProps, 'opened' | 'onClose'> & {
    palette: OrganizationColorPalette;
};

export const EditPaletteModal: FC<EditPaletteModalProps> = ({
    palette,
    opened,
    onClose,
}) => {
    const { data: palettes = [] } = useColorPalettes();
    const updateColorPalette = useUpdateColorPalette();
    const { showToastSuccess, showToastApiError } = useToaster();

    const handleUpdatePalette = (values: PaletteFormValues) => {
        if (!values.name) return;

        updateColorPalette.mutate(
            {
                uuid: palette.colorPaletteUuid,
                name: values.name,
                colors: values.colors,
            },
            {
                onSuccess: (updatedPalette) => {
                    onClose();
                    showToastSuccess({
                        title: `Palette "${updatedPalette.name}" updated successfully`,
                    });
                },
                onError: (error) => {
                    showToastApiError({
                        title: 'Failed to update palette',
                        apiError: error.error,
                    });
                },
            },
        );
    };

    // Filter out the current palette from the existing names to avoid self-comparison
    const existingPaletteNames = palettes
        .filter((p) => p.colorPaletteUuid !== palette.colorPaletteUuid)
        .map((p) => p.name);

    return (
        <PaletteModalBase
            opened={opened}
            onClose={onClose}
            onSubmit={handleUpdatePalette}
            isLoading={updateColorPalette.isLoading}
            initialValues={{
                name: palette.name,
                colors: palette.colors,
            }}
            title={`Edit "${palette.name}" Palette`}
            submitButtonText="Save changes"
            existingPaletteNames={existingPaletteNames}
        />
    );
};
