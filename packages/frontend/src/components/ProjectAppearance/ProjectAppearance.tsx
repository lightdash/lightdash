import { subject } from '@casl/ability';
import {
    Anchor,
    Button,
    LoadingOverlay,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useColorPalettes } from '../../hooks/appearance/useOrganizationAppearance';
import useHealth from '../../hooks/health/useHealth';
import {
    useProject,
    useUpdateProjectColorPalette,
} from '../../hooks/useProject';
import useApp from '../../providers/App/useApp';
import Callout from '../common/Callout';
import MantineIcon from '../common/MantineIcon';
import { PalettePicker } from '../common/PalettePicker/PalettePicker';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import classes from './ProjectAppearance.module.css';

type Props = { projectUuid: string };

const ProjectAppearance: FC<Props> = ({ projectUuid }) => {
    const { t } = useTranslation('projectSettings');
    const { user } = useApp();
    const { data: project, isInitialLoading: isProjectLoading } =
        useProject(projectUuid);
    const { data: palettes = [], isInitialLoading: isPalettesLoading } =
        useColorPalettes();
    const { data: health, isInitialLoading: isHealthLoading } = useHealth();
    const updateColorPalette = useUpdateProjectColorPalette(projectUuid);

    const overrideActive =
        !!health?.appearance.overrideColorPalette &&
        health.appearance.overrideColorPalette.length > 0;

    const isLoading = isProjectLoading || isPalettesLoading || isHealthLoading;
    const canManageOrgPalettes =
        (user.data?.ability?.can('update', 'Organization') ||
            user.data?.ability?.can(
                'manage',
                subject('OrganizationColorPalette', {
                    organizationUuid: user.data?.organizationUuid,
                }),
            )) ??
        false;

    return (
        <Stack gap="sm" pos="relative">
            <LoadingOverlay visible={isLoading} />
            <SettingsGridCard>
                <Stack gap="xs">
                    <Title order={5}>{t('appearance.colorPalette')}</Title>
                    <Text c="dimmed" fz="sm">
                        {t('appearance.description')}
                    </Text>
                    <Text c="dimmed" fz="xs">
                        <Trans
                            t={t}
                            i18nKey="appearance.managedAt"
                            components={{
                                link: (
                                    <Anchor
                                        component={Link}
                                        to="/generalSettings/appearance"
                                        fz="xs"
                                    />
                                ),
                            }}
                        />
                    </Text>
                </Stack>
                <Stack gap="md">
                    {overrideActive && (
                        <Callout variant="info">
                            {t('appearance.overrideActive')}
                        </Callout>
                    )}

                    <PalettePicker
                        label={t('appearance.colorPalette')}
                        value={project?.colorPaletteUuid ?? null}
                        onChange={(next) => updateColorPalette.mutate(next)}
                        palettes={palettes}
                        parentLabel="organization"
                        disabled={
                            overrideActive || updateColorPalette.isLoading
                        }
                    />

                    {canManageOrgPalettes && (
                        <Button
                            component={Link}
                            to="/generalSettings/appearance"
                            variant="default"
                            size="xs"
                            leftSection={
                                <MantineIcon icon={IconExternalLink} />
                            }
                            className={classes.managePalettesLink}
                        >
                            {t('appearance.manageOrgPalettes')}
                        </Button>
                    )}
                </Stack>
            </SettingsGridCard>
        </Stack>
    );
};

export default ProjectAppearance;
