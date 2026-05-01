import { Stack, TextInput } from '@mantine-8/core';
import { type FC } from 'react';
import { type SpaceModalBody } from '.';
import { useColorPalettes } from '../../../hooks/appearance/useOrganizationAppearance';
import useHealth from '../../../hooks/health/useHealth';
import { useProject } from '../../../hooks/useProject';
import Callout from '../Callout';
import { PalettePicker } from '../PalettePicker/PalettePicker';

type Props = SpaceModalBody & {
    projectUuid: string;
};

const UpdateSpaceModalContent: FC<Props> = ({ form, projectUuid }) => {
    const { data: project } = useProject(projectUuid);
    const { data: palettes = [] } = useColorPalettes();
    const { data: health } = useHealth();

    const overrideActive =
        !!health?.appearance.overrideColorPalette &&
        health.appearance.overrideColorPalette.length > 0;

    const parentBreadcrumb =
        form.values.breadcrumbs && form.values.breadcrumbs.length >= 2
            ? form.values.breadcrumbs[form.values.breadcrumbs.length - 2]
            : undefined;
    const parentLabel = parentBreadcrumb?.name ?? project?.name ?? 'project';

    return (
        <Stack gap="md">
            <TextInput
                {...form.getInputProps('name')}
                label="Enter a memorable name for your space"
                placeholder="eg. KPIs"
            />
            {overrideActive && (
                <Callout variant="info">
                    A color palette override is set in your instance
                    configuration. Space-level selection is disabled while the
                    override is active.
                </Callout>
            )}
            <PalettePicker
                label="Color palette"
                size="sm"
                value={form.values.colorPaletteUuid ?? null}
                onChange={(next) =>
                    form.setFieldValue('colorPaletteUuid', next)
                }
                palettes={palettes}
                parentLabel={parentLabel}
                disabled={overrideActive}
            />
        </Stack>
    );
};

export default UpdateSpaceModalContent;
