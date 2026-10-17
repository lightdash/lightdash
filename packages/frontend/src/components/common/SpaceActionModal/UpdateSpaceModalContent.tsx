import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { Select, Stack, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { type SpaceModalBody } from '.';
import { useColorPalettes } from '../../../hooks/appearance/useOrganizationAppearance';
import useHealth from '../../../hooks/health/useHealth';
import { useProject } from '../../../hooks/useProject';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useWarehouseConnections } from '../../../hooks/useWarehouseConnections';
import useApp from '../../../providers/App/useApp';
import Callout from '../Callout';
import { PalettePicker } from '../PalettePicker/PalettePicker';

type Props = SpaceModalBody & {
    projectUuid: string;
};

const INHERIT_VALUE = '__inherit__';

const UpdateSpaceModalContent: FC<Props> = ({ form, projectUuid }) => {
    const { data: project } = useProject(projectUuid);
    const { data: palettes = [] } = useColorPalettes();
    const { data: health } = useHealth();
    const { user } = useApp();
    const { data: spaceWarehouseConnectionsFlag } = useServerFeatureFlag(
        FeatureFlags.SpaceWarehouseConnections,
    );
    const { data: warehouseConnections, isEnabled } =
        useWarehouseConnections(projectUuid);
    const canManageProject = user.data?.ability.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data.organizationUuid,
            projectUuid,
        }),
    );

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
            {spaceWarehouseConnectionsFlag?.enabled &&
                isEnabled &&
                warehouseConnections &&
                canManageProject && (
                    <Select
                        label="Warehouse connection"
                        description="Content in this space and its sub-spaces queries with this connection. People who can edit this space can also pick it in the SQL runner."
                        inputWrapperOrder={[
                            'label',
                            'input',
                            'description',
                            'error',
                        ]}
                        data={[
                            {
                                value: INHERIT_VALUE,
                                label: 'Inherit from parent space or project',
                            },
                            ...warehouseConnections.connections.map(
                                (connection) => ({
                                    value: connection.warehouseConnectionUuid,
                                    label: connection.name,
                                }),
                            ),
                        ]}
                        value={
                            form.values.warehouseConnectionUuid ?? INHERIT_VALUE
                        }
                        onChange={(value) =>
                            form.setFieldValue(
                                'warehouseConnectionUuid',
                                value === INHERIT_VALUE ? null : value,
                            )
                        }
                        allowDeselect={false}
                    />
                )}
        </Stack>
    );
};

export default UpdateSpaceModalContent;
