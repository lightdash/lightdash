import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import { type ModalProps } from '@mantine-8/core';
import { type FC } from 'react';
import {
    useColorPalettes,
    useCreateColorPalette,
} from '../../../hooks/appearance/useOrganizationAppearance';
import { PaletteModalBase, type PaletteFormValues } from './PaletteModalBase';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    /**
     * Seed values for the form. When omitted the default palette is used. The
     * "from brand colors" flow passes a palette generated from the org brand.
     */
    initialValues?: PaletteFormValues;
    title?: string;
};

const DEFAULT_COLOR_PALETTE = {
    name: 'Default',
    colors: [
        // Use the initial 9 colors directly from ECHARTS to keep them in sync:
        ...ECHARTS_DEFAULT_COLORS,
        '#33ff7d',
        '#33ffb1',
        '#33ffe6',
        '#33e6ff',
        '#33b1ff',
        '#337dff',
        '#3349ff',
        '#5e33ff',
        '#9233ff',
        '#c633ff',
        '#ff33e1',
    ],
};

export const CreatePaletteModal: FC<Props> = ({
    opened,
    onClose,
    initialValues,
    title = 'Create new palette',
}) => {
    const { data: palettes = [] } = useColorPalettes();
    const createColorPalette = useCreateColorPalette();

    const handleCreatePalette = (values: PaletteFormValues) => {
        if (!values.name) return;

        createColorPalette.mutate({
            name: values.name,
            colors: values.colors,
            darkColors: values.darkColors,
        });
    };

    return (
        <PaletteModalBase
            opened={opened}
            onClose={onClose}
            onSubmit={handleCreatePalette}
            isLoading={createColorPalette.isLoading}
            initialValues={
                initialValues ?? {
                    name: '',
                    colors: DEFAULT_COLOR_PALETTE.colors,
                }
            }
            title={title}
            submitButtonText="Create palette"
            existingPaletteNames={palettes.map((p) => p.name)}
            requireDirty={false}
        />
    );
};
