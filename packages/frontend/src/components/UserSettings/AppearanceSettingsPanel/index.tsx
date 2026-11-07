import { subject } from '@casl/ability';
import { Button, Divider, Group, Skeleton, Stack } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { Fragment, useCallback, useState, type FC } from 'react';
import {
    useColorPalettes,
    useSetActiveColorPalette,
} from '../../../hooks/appearance/useOrganizationAppearance';
import useHealth from '../../../hooks/health/useHealth';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import { SettingsSection } from '../../common/Settings/SettingLayout';
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
    onOpenCreatePaletteModal: () => void;
    onCloseCreatePaletteModal: () => void;
}> = ({
    canManage,
    isCreatePaletteModalOpen,
    onOpenCreatePaletteModal,
    onCloseCreatePaletteModal,
}) => {
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

    const paletteItems = [
        ...(hasColorPaletteOverride &&
        health?.appearance.overrideColorPalette &&
        organization?.organizationUuid
            ? [
                  <PaletteItem
                      key="custom"
                      palette={{
                          colorPaletteUuid: 'custom',
                          createdAt: new Date(),
                          name:
                              health.appearance.overrideColorPaletteName ??
                              'Custom override',
                          colors: health.appearance.overrideColorPalette,
                          darkColors: null,
                          organizationUuid: organization.organizationUuid,
                      }}
                      isActive={true}
                      readOnly
                      canManage={canManage}
                      onSetActive={undefined}
                  />,
              ]
            : []),
        ...palettes.map((palette) => (
            <PaletteItem
                key={palette.colorPaletteUuid}
                palette={palette}
                isActive={palette.isActive && !hasColorPaletteOverride}
                canManage={canManage}
                onSetActive={
                    hasColorPaletteOverride || !canManage
                        ? undefined
                        : handleSetActive
                }
            />
        )),
    ];

    return (
        <SettingsCard>
            <Stack gap="md">
                {isPalettesLoading || isHealthLoading ? (
                    <>
                        <Skeleton height={30} />
                        <Skeleton height={30} />
                        <Skeleton height={30} />
                    </>
                ) : (
                    paletteItems.map((item, index) => (
                        <Fragment key={item.key}>
                            {index > 0 && <Divider />}
                            {item}
                        </Fragment>
                    ))
                )}
                {canManage && (
                    <>
                        <Divider />
                        <Group>
                            <Button
                                variant="default"
                                size="xs"
                                leftSection={<MantineIcon icon={IconPlus} />}
                                onClick={onOpenCreatePaletteModal}
                                disabled={!!hasColorPaletteOverride}
                            >
                                Add palette
                            </Button>
                        </Group>
                    </>
                )}
            </Stack>

            <CreatePaletteModal
                key={`create-palette-modal-${isCreatePaletteModalOpen}`}
                opened={isCreatePaletteModalOpen}
                onClose={onCloseCreatePaletteModal}
            />
        </SettingsCard>
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
            description="Customize your brand’s appearance and the color palettes used in charts."
            actions={
                <SettingsPageActions>
                    <SettingsPageDocumentationLink href="https://docs.lightdash.com/guides/customizing-the-appearance-of-your-project" />
                </SettingsPageActions>
            }
        >
            {canManageOrgSettings && (
                <BrandAppearanceSettings
                    canManageColorPalette={
                        canManageColorPalette && !hasColorPaletteOverride
                    }
                />
            )}
            <SettingsSection
                label="Chart palettes"
                description="Choose the default palette for your charts."
            >
                <AppearanceColorSettings
                    canManage={canManageColorPalette}
                    isCreatePaletteModalOpen={isCreatePaletteModalOpen}
                    onOpenCreatePaletteModal={() =>
                        setIsCreatePaletteModalOpen(true)
                    }
                    onCloseCreatePaletteModal={() =>
                        setIsCreatePaletteModalOpen(false)
                    }
                />
            </SettingsSection>
        </SettingsPage>
    );
};

export default AppearanceSettingsPanel;
