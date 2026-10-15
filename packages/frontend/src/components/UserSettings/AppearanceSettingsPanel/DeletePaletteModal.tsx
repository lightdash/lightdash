import { type OrganizationColorPalette } from '@lightdash/common';
import {
    Center,
    ColorSwatch,
    SimpleGrid,
    Text,
    type ModalProps,
} from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
}) => {
    const { t } = useTranslation('userSettings');
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t('appearanceSettingsPanel.deletePaletteModal.title')}
            variant="delete"
            description={t(
                'appearanceSettingsPanel.deletePaletteModal.confirm',
                {
                    name: palette.name,
                },
            )}
            confirmLabel={t('actions.delete', { ns: 'common' })}
            size="md"
            onConfirm={onConfirm}
        >
            <Text fz="sm" c="dimmed">
                {t('appearanceSettingsPanel.deletePaletteModal.cannotBeUndone')}
            </Text>
            <Center>
                <SimpleGrid cols={10} spacing="xs">
                    {palette.colors.map((color, index) => (
                        <ColorSwatch
                            key={color + index}
                            size={24}
                            color={color}
                        />
                    ))}
                </SimpleGrid>
            </Center>
        </MantineModal>
    );
};
