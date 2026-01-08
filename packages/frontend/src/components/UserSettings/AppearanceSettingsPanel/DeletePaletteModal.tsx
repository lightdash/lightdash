import { type OrganizationColorPalette } from '@lightdash/common';
import {
    type ModalProps,
    Center,
    ColorSwatch,
    SimpleGrid,
    Text,
} from '@mantine-8/core';
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
        title="Delete color palette"
        variant="delete"
        resourceType="color palette"
        resourceLabel={palette.name}
        size="md"
        onConfirm={onConfirm}
    >
        <Text fz="sm" c="dimmed">
            This action cannot be undone.
        </Text>
        <Center>
            <SimpleGrid cols={10} spacing="xs">
                {palette.colors.map((color, index) => (
                    <ColorSwatch key={color + index} size={24} color={color} />
                ))}
            </SimpleGrid>
        </Center>
    </MantineModal>
);
