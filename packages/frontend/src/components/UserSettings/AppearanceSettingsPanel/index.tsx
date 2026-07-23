import { subject } from '@casl/ability';
import { Button, Skeleton, Stack } from '@mantine-8/core';
import { IconPlus } from '@tabler/icons-react';
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
import {
    SettingsPage,
    SettingsPageActions,
    SettingsPageDocumentationLink,
} from '../../common/Settings/SettingsPage';
import { BrandAppearanceSettings } from './BrandAppearanceSettings';
import { CreatePaletteModal } from './CreatePaletteModal';
import { PaletteItem } from './PaletteItem';

const AppearanceColorSettings: FC<{
    canManage: boolean;
    isCreatePaletteModalOpen: boolean;
    onCloseCreatePaletteModal: () => void;
}> = ({ canManage, isCreatePaletteModalOpen, onCloseCreatePaletteModal }) => {
    const { data: organization } = useOrganization();
    const { data: health, isLoading: isHealthLoading } = useHealth();
    const { data: palettes = [], isLoading: isPalettesLoading } =
        useColorPalettes();

    const setActivePalette = useSetActiveColorPalette();

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
                onClose={onCloseCreatePaletteModal}
            />
        </Stack>
    );
};

const AppearanceSettingsPanel: FC = () => {
    const { user } = useApp();
    const { data: health } = useHealth();
    const [isCreatePaletteModalOpen, setIsCreatePaletteModalOpen] =
        useState(false);

    const canManageOrgSettings =
        user.data?.ability?.can('update', 'Organization') ?? false;
    const canManageColorPalette =
        user.data?.ability?.can(
            'manage',
            subject('OrganizationColorPalette', {
                organizationUuid: user.data?.organizationUuid,
            }),
        ) ?? false;
    const hasColorPaletteOverride =
        !!health?.appearance.overrideColorPalette &&
        health.appearance.overrideColorPalette.length > 0;

    return (
        <SettingsPage
            title="Appearance"
            description="Customize organization branding and the color palettes used in charts and visualizations."
            actions={
                <SettingsPageActions>
                    <SettingsPageDocumentationLink href="https://docs.lightdash.com/guides/customizing-the-appearance-of-your-project" />
                    {canManageColorPalette ? (
                        <Button
                            size="xs"
                            leftSection={<MantineIcon icon={IconPlus} />}
                            onClick={() => setIsCreatePaletteModalOpen(true)}
                            variant="default"
                            disabled={hasColorPaletteOverride}
                        >
                            Add palette
                        </Button>
                    ) : null}
                </SettingsPageActions>
            }
        >
            {canManageOrgSettings && <BrandAppearanceSettings />}
            <SettingsCard>
                <AppearanceColorSettings
                    canManage={canManageColorPalette}
                    isCreatePaletteModalOpen={isCreatePaletteModalOpen}
                    onCloseCreatePaletteModal={() =>
                        setIsCreatePaletteModalOpen(false)
                    }
                />
            </SettingsCard>
        </SettingsPage>
    );
};

export default AppearanceSettingsPanel;
