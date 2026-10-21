import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { Select, Stack, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { type SpaceModalBody } from '.';
import { useColorPalettes } from '../../../hooks/appearance/useOrganizationAppearance';
import useHealth from '../../../hooks/health/useHealth';
import { useProject } from '../../../hooks/useProject';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useSpace } from '../../../hooks/useSpaces';
import { useWarehouseConnections } from '../../../hooks/useWarehouseConnections';
import useApp from '../../../providers/App/useApp';
import Callout from '../Callout';
import { PalettePicker } from '../PalettePicker/PalettePicker';

type Props = SpaceModalBody & {
    projectUuid: string;
};

const INHERIT_VALUE = '__inherit__';

const SpaceWarehouseConnectionSelect: FC<Props & { parentLabel: string }> = ({
    form,
    projectUuid,
    parentLabel,
}) => {
    const { data: warehouseConnections, isEnabled } =
        useWarehouseConnections(projectUuid);
    const showWarehouseConnection = !!(isEnabled && warehouseConnections);
    const { data: parentSpace } = useSpace(
        projectUuid,
        form.values.parentSpaceUuid ?? undefined,
        { enabled: !!form.values.parentSpaceUuid && showWarehouseConnection },
    );
    const inheritedName =
        parentSpace?.effectiveWarehouseConnection?.name ??
        "each chart's own connection";
    const originalWarehouseType = warehouseConnections?.connections.find(
        (connection) => connection.isOriginal,
    )?.warehouseType;

    return (
        showWarehouseConnection &&
        warehouseConnections && (
            <Select
                label="Warehouse connection"
                description="Content in this space and its sub-spaces queries with this connection. People with SQL runner access who can edit a space that sets this connection can use it in the SQL runner."
                data={[
                    {
                        value: INHERIT_VALUE,
                        label: `Inherit from ${parentLabel} (${inheritedName})`,
                    },
                    ...warehouseConnections.connections
                        .filter(
                            (connection) =>
                                connection.warehouseType ===
                                    originalWarehouseType ||
                                connection.warehouseConnectionUuid ===
                                    form.values.warehouseConnectionUuid,
                        )
                        .map((connection) => ({
                            value: connection.warehouseConnectionUuid,
                            label: connection.name,
                        })),
                ]}
                value={form.values.warehouseConnectionUuid ?? INHERIT_VALUE}
                onChange={(value) =>
                    form.setFieldValue(
                        'warehouseConnectionUuid',
                        value === INHERIT_VALUE ? null : value,
                    )
                }
                allowDeselect={false}
            />
        )
    );
};

const UpdateSpaceModalContent: FC<Props> = ({ form, projectUuid }) => {
    const { user } = useApp();
    const { data: spaceWarehouseConnectionsFlag } = useServerFeatureFlag(
        FeatureFlags.SpaceWarehouseConnections,
    );
    const canManageProject = user.data?.ability.can(
        'manage',
        subject('Project', {
            organizationUuid: user.data.organizationUuid,
            projectUuid,
        }),
    );
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
            {spaceWarehouseConnectionsFlag?.enabled && canManageProject && (
                <SpaceWarehouseConnectionSelect
                    form={form}
                    projectUuid={projectUuid}
                    parentLabel={parentLabel}
                />
            )}
        </Stack>
    );
};

export default UpdateSpaceModalContent;
