import {
    ActionIcon,
    Button,
    Group,
    Skeleton,
    Stack,
    Text,
    Title,
    Tooltip,
    useMantineColorScheme,
} from '@mantine/core';
import { IconInfoCircle, IconPlus } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import {
    useColorPalettes,
    useSetActiveColorPalette,
} from '../../../hooks/appearance/useOrganizationAppearance';
import useHealth from '../../../hooks/health/useHealth';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { CreatePaletteModal } from './CreatePaletteModal';
import { PaletteItem } from './PaletteItem';

const AppearanceColorSettings: FC = () => {
    const { data: organization } = useOrganization();
    const { data: health, isLoading: isHealthLoading } = useHealth();
    const { data: palettes = [], isLoading: isPalettesLoading } =
        useColorPalettes();

    const { colorScheme } = useMantineColorScheme();
    const setActivePalette = useSetActiveColorPalette();

    const [isCreatePaletteModalOpen, setIsCreatePaletteModalOpen] =
        useState(false);

    const handleSetActive = useCallback(
        (uuid: string) => {
            setActivePalette.mutate(uuid);
        },
        [setActivePalette],
    );

    const hasColorPaletteOverride =
        health?.appearance.overrideColorPalette &&
        health.appearance.overrideColorPalette.length > 0;

    return (
        <Stack spacing="md">
            <Group position="apart">
                <Text size="sm" color="ldGray.6">
                    Customize the color palettes used in your charts and
                    visualizations.
                </Text>

                <Button
                    leftIcon={<MantineIcon icon={IconPlus} />}
                    onClick={() => setIsCreatePaletteModalOpen(true)}
                    variant="default"
                    size="xs"
                    sx={{ alignSelf: 'flex-end' }}
                    disabled={hasColorPaletteOverride}
                >
                    Add new palette
                </Button>
            </Group>

            <Stack spacing="xs">
                {isPalettesLoading || isHealthLoading ? (
                    <>
                        <Skeleton height={30} />
                        <Skeleton height={30} />
                        <Skeleton height={30} />
                    </>
                ) : (
                    <>
                        {hasColorPaletteOverride &&
                            health?.appearance.overrideColorPalette &&
                            organization?.organizationUuid && (
                                <PaletteItem
                                    theme={colorScheme}
                                    palette={{
                                        colorPaletteUuid: 'custom',
                                        createdAt: new Date(),
                                        name:
                                            health.appearance
                                                .overrideColorPaletteName ??
                                            'Custom override',
                                        colors: health.appearance
                                            .overrideColorPalette,
                                        darkColors: null,
                                        organizationUuid:
                                            organization?.organizationUuid,
                                    }}
                                    isActive={true}
                                    readOnly
                                    onSetActive={undefined}
                                />
                            )}
                        {palettes.map((palette) => (
                            <PaletteItem
                                theme={colorScheme}
                                key={palette.colorPaletteUuid}
                                palette={palette}
                                isActive={
                                    palette.isActive && !hasColorPaletteOverride
                                }
                                onSetActive={
                                    hasColorPaletteOverride
                                        ? undefined
                                        : handleSetActive
                                }
                            />
                        ))}
                    </>
                )}
            </Stack>

            <CreatePaletteModal
                key={`create-palette-modal-${isCreatePaletteModalOpen}`}
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
