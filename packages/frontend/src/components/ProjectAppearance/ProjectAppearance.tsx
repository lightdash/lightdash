import {
    ActionIcon,
    Group,
    Skeleton,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useColorPalettes } from '../../hooks/appearance/useOrganizationAppearance';
import useHealth from '../../hooks/health/useHealth';
import {
    useProject,
    useUpdateProjectColorPalette,
} from '../../hooks/useProject';
import Callout from '../common/Callout';
import MantineIcon from '../common/MantineIcon';
import { PalettePicker } from '../common/PalettePicker/PalettePicker';
import { SettingsCard } from '../common/Settings/SettingsCard';

type Props = { projectUuid: string };

const ProjectAppearance: FC<Props> = ({ projectUuid }) => {
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

    return (
        <Stack gap="sm">
            <Group gap="xxs">
                <Title order={5}>Appearance</Title>
                <Tooltip
                    label="Pick a color palette for charts in this project. Palettes are managed at the organization level."
                    position="bottom"
                >
                    <ActionIcon
                        size="xs"
                        color="gray"
                        variant="subtle"
                        aria-label="Appearance info"
                    >
                        <MantineIcon icon={IconInfoCircle} />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <SettingsCard mb="lg">
                <Stack gap="md">
                    <Text size="sm" c="ldGray.6">
                        Choose which organization color palette charts in this
                        project should use, or inherit the organization's active
                        palette.
                    </Text>

                    {overrideActive && (
                        <Callout variant="info">
                            A color palette override is set in your instance
                            configuration. Project-level selection is disabled
                            while the override is active.
                        </Callout>
                    )}

                    {isLoading ? (
                        <Skeleton height={36} />
                    ) : (
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
                    )}
                </Stack>
            </SettingsCard>
        </Stack>
    );
};

export default ProjectAppearance;
