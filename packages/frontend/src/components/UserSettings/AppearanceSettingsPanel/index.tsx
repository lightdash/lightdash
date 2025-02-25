import { type OrganizationColorPalette } from '@lightdash/common';
import {
    Accordion,
    ActionIcon,
    Button,
    Group,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconInfoCircle, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useState, type FC } from 'react';
import {
    useColorPalettes,
    useSetDefaultColorPalette,
    useUpdateColorPalette,
} from '../../../hooks/appearance/useOrganizationAppearance';
import useToaster from '../../../hooks/toaster/useToaster';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import { isHexCodeColor } from '../../../utils/colorUtils';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { CreatePaletteModal } from './CreatePaletteModal';
import { PaletteAccordionItem } from './PalettedAccordionItem';

const AppearanceColorSettings: FC = () => {
    const { showToastSuccess } = useToaster();
    const ability = useAbilityContext();
    const { data: palettes = [] } = useColorPalettes();

    const setDefaultPalette = useSetDefaultColorPalette();
    const updateColorPalette = useUpdateColorPalette();

    const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);

    const form = useForm<{ colors: string[]; uuid: string }>({
        initialValues: { colors: [], uuid: '' },
        validate: {
            colors: (value) =>
                value.every((c) => isHexCodeColor(c)) ? null : 'Invalid colors',
        },
    });

    const { setValues } = form;

    const handleSelectPalette = useCallback(
        (palette: OrganizationColorPalette) => {
            setValues({
                colors: palette.colors,
                uuid: palette.colorPaletteUuid,
            });
        },
        [setValues],
    );

    useEffect(() => {
        if (updateColorPalette.isSuccess) {
            showToastSuccess({ title: 'Palette updated successfully' });
            handleSelectPalette(updateColorPalette.data);
        }
    }, [
        updateColorPalette.isSuccess,
        updateColorPalette.data,
        showToastSuccess,
        handleSelectPalette,
    ]);

    const handleSetDefault = useCallback(
        (uuid: string) => {
            setDefaultPalette.mutate(uuid);
        },
        [setDefaultPalette],
    );

    return (
        <Stack spacing="md">
            <Accordion variant="contained">
                {palettes.map((palette) => (
                    <PaletteAccordionItem
                        key={palette.colorPaletteUuid}
                        palette={palette}
                        isDefault={palette.isDefault}
                        onSetDefault={handleSetDefault}
                    />
                ))}
            </Accordion>

            <Button
                leftIcon={<MantineIcon icon={IconPlus} />}
                onClick={() => setIsPresetModalOpen(true)}
                variant="default"
                size="xs"
                sx={{ alignSelf: 'flex-end' }}
            >
                Add new palette
            </Button>

            <CreatePaletteModal
                opened={isPresetModalOpen}
                onClose={() => {
                    setIsPresetModalOpen(false);
                }}
            />
        </Stack>
    );
};

const AppearanceSettingsPanel: FC = () => {
    return (
        <Stack spacing="sm">
            <Group spacing="xxs">
                <Title order={5}>Appearance settings</Title>
                <Tooltip
                    label="Click here to learn more about customizing the appearance of your project"
                    position="bottom"
                >
                    <ActionIcon
                        component="a"
                        href="https://docs.lightdash.com/guides/customizing-the-appearance-of-your-project"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <MantineIcon icon={IconInfoCircle} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            <SettingsCard mb="lg">
                <AppearanceColorSettings />
            </SettingsCard>
        </Stack>
    );
};

export default AppearanceSettingsPanel;
