import { Stack, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('modals');
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
    const parentLabel =
        parentBreadcrumb?.name ??
        project?.name ??
        t('spaceAction.projectFallback');

    return (
        <Stack gap="md">
            <TextInput
                {...form.getInputProps('name')}
                label={t('spaceAction.nameLabel')}
                placeholder={t('spaceAction.namePlaceholder')}
            />
            {overrideActive && (
                <Callout variant="info">
                    {t('spaceAction.paletteOverrideActive')}
                </Callout>
            )}
            <PalettePicker
                label={t('spaceAction.colorPalette')}
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
