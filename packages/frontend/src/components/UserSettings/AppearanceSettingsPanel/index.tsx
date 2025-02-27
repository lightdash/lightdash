import {
    ActionIcon,
    Button,
    Group,
    Skeleton,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconInfoCircle, IconPlus } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import {
    useColorPalettes,
    useSetActiveColorPalette,
} from '../../../hooks/appearance/useOrganizationAppearance';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { CreatePaletteModal } from './CreatePaletteModal';
import { PaletteItem } from './PaletteItem';

const AppearanceColorSettings: FC = () => {
    const { data: palettes = [], isLoading } = useColorPalettes();

    const setActivePalette = useSetActiveColorPalette();

    const [isCreatePaletteModalOpen, setIsCreatePaletteModalOpen] =
        useState(false);

    const handleSetActive = useCallback(
        (uuid: string) => {
            setActivePalette.mutate(uuid);
        },
        [setActivePalette],
    );

    return (
        <Stack spacing="md">
            <Group position="apart">
                <Text size="sm" color="gray.6">
                    Customize the color palettes used in your charts and
                    visualizations.
                </Text>

                <Button
                    leftIcon={<MantineIcon icon={IconPlus} />}
                    onClick={() => setIsCreatePaletteModalOpen(true)}
                    variant="default"
                    size="xs"
                    sx={{ alignSelf: 'flex-end' }}
                >
                    Add new palette
                </Button>
            </Group>

            <Stack spacing="xs">
                {isLoading ? (
                    <>
                        <Skeleton height={30} />
                        <Skeleton height={30} />
                        <Skeleton height={30} />
                    </>
                ) : (
                    palettes.map((palette) => (
                        <PaletteItem
                            key={palette.colorPaletteUuid}
                            palette={palette}
                            isActive={palette.isActive}
                            onSetActive={handleSetActive}
                        />
                    ))
                )}
            </Stack>

            <CreatePaletteModal
                opened={isCreatePaletteModalOpen}
                onClose={() => {
                    setIsCreatePaletteModalOpen(false);
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
                        size="xs"
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
