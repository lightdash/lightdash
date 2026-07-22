import { subject } from '@casl/ability';
import {
    ActionIcon,
    Button,
    Group,
    Skeleton,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconInfoCircle, IconPlus } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import {
    useColorPalettes,
    useSetActiveColorPalette,
} from '../../../hooks/appearance/useOrganizationAppearance';
import useHealth from '../../../hooks/health/useHealth';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { BrandAppearanceSettings } from './BrandAppearanceSettings';
import { CreatePaletteModal } from './CreatePaletteModal';
import { PaletteItem } from './PaletteItem';

const AppearanceColorSettings: FC<{ canManage: boolean }> = ({ canManage }) => {
    const { data: organization } = useOrganization();
    const { data: health, isLoading: isHealthLoading } = useHealth();
    const { data: palettes = [], isLoading: isPalettesLoading } =
        useColorPalettes();

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
        <Stack gap="md">
            <Group justify="space-between">
                <Text size="sm" c="ldGray.6">
                    Customize the color palettes used in your charts and
                    visualizations.
                </Text>

                {canManage && (
                    <Button
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={() => setIsCreatePaletteModalOpen(true)}
                        variant="default"
                        size="xs"
                        style={{ alignSelf: 'flex-end' }}
                        disabled={hasColorPaletteOverride}
                    >
                        Add new palette
                    </Button>
                )}
            </Group>

            <Stack gap="xs">
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
                                    canManage={canManage}
                                    onSetActive={undefined}
                                />
                            )}
                        {palettes.map((palette) => (
                            <PaletteItem
                                key={palette.colorPaletteUuid}
                                palette={palette}
                                isActive={
                                    palette.isActive && !hasColorPaletteOverride
                                }
                                canManage={canManage}
                                onSetActive={
                                    hasColorPaletteOverride || !canManage
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
    const { user } = useApp();

    const canManageOrgSettings =
        user.data?.ability?.can('update', 'Organization') ?? false;
    const canManageColorPalette =
        user.data?.ability?.can(
            'manage',
            subject('OrganizationColorPalette', {
                organizationUuid: user.data?.organizationUuid,
            }),
        ) ?? false;

    return (
        <Stack gap="sm">
            <Group gap="xxs">
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
                        color="gray"
                        variant="subtle"
                    >
                        <MantineIcon icon={IconInfoCircle} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            {canManageOrgSettings && <BrandAppearanceSettings />}
            <SettingsCard mb="lg">
                <AppearanceColorSettings canManage={canManageColorPalette} />
            </SettingsCard>
        </Stack>
    );
};

export default AppearanceSettingsPanel;
