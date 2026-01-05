import { type OrganizationColorPalette } from '@lightdash/common';
import {
    type ModalProps,
    Button,
    Center,
    ColorSwatch,
    SimpleGrid,
} from '@mantine-8/core';
import { IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../../common/MantineModal';

type DeletePaletteModalProps = Pick<ModalProps, 'opened' | 'onClose'> & {
    palette: OrganizationColorPalette;
    onConfirm: () => void;
};

export const DeletePaletteModal: FC<DeletePaletteModalProps> = ({
    palette,
    opened,
    onClose,
    onConfirm,
}) => (
    <MantineModal
        opened={opened}
        onClose={onClose}
        title={`Delete "${palette.name}" Palette`}
        icon={IconTrash}
        size="md"
        actions={
            <Button color="red" onClick={onConfirm}>
                Delete Palette
            </Button>
        }
        description="Are you sure you want to delete this color palette? This action cannot be undone."
    >
        <Center>
            <SimpleGrid cols={10} spacing="xs">
                {palette.colors.map((color, index) => (
                    <ColorSwatch key={color + index} size={24} color={color} />
                ))}
            </SimpleGrid>
        </Center>
    </MantineModal>
);
