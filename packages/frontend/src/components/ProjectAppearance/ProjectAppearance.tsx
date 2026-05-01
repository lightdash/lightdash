import {
    Anchor,
    Button,
    LoadingOverlay,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconExternalLink } from '@tabler/icons-react';
import { type FC } from 'react';
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

type Props = { projectUuid: string };

const ProjectAppearance: FC<Props> = ({ projectUuid }) => {
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
        user.data?.ability?.can('update', 'Organization') ?? false;

    return (
        <Stack gap="sm" pos="relative">
            <LoadingOverlay visible={isLoading} />
            <SettingsGridCard>
                <Stack gap="xs">
                    <Title order={4}>Appearance</Title>
                    <Text c="ldGray.6" fz="sm">
                        Choose which organization color palette charts in this
                        project should use, or inherit the organization's active
                        palette.
                    </Text>
                    <Text c="ldGray.6" fz="xs">
                        Palettes are managed at the{' '}
                        <Anchor
                            component={Link}
                            to="/generalSettings/appearance"
                            fz="xs"
                        >
                            organization level
                        </Anchor>
                        .
                    </Text>
                </Stack>
                <Stack gap="md">
                    {overrideActive && (
                        <Callout variant="info">
                            A color palette override is set in your instance
                            configuration. Project-level selection is disabled
                            while the override is active.
                        </Callout>
                    )}

                    <PalettePicker
                        label="Color palette"
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
                            style={{ alignSelf: 'flex-end' }}
                        >
                            Manage organization palettes
                        </Button>
                    )}
                </Stack>
            </SettingsGridCard>
        </Stack>
    );
};

export default ProjectAppearance;
