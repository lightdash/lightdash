/**
 * Several warehouses per project (the multi-connection-projects flag): which
 * connections the page shows and whether another one can be added. With the
 * flag off the page keeps its single Warehouse.
 */
import { subject } from '@casl/ability';
import {
    FeatureFlags,
    supportsMultipleConnections,
    type WarehouseConnection,
    type WarehouseConnectionCapabilities,
    type WarehouseConnectionSwitchAvailability,
    type WarehouseTypes,
} from '@lightdash/common';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import {
    useWarehouseConnections,
    useWarehouseConnectionsForUserCredentials,
} from '../../hooks/useWarehouseConnections';
import { useWarehouseConnectionSwitchAvailability } from '../../hooks/useWarehouseConnectionSwitch';
import useApp from '../../providers/App/useApp';

/** What the page shows of a connection; every project member may read it. */
export type StudioConnection = Pick<
    WarehouseConnection,
    'warehouseConnectionUuid' | 'name' | 'isOriginal' | 'warehouseType'
>;

const NO_CONNECTIONS: StudioConnection[] = [];

export type StudioWarehouses = {
    /** Listed once the project has switched to several connections. */
    connections: StudioConnection[];
    /** `single` until the project switches; null while unknown or hidden. */
    mode: 'single' | 'multiple' | null;
    /** The type of the project's first connection, which extras build on. */
    originalWarehouseType: WarehouseTypes | null;
    /** Adding a connection needs manage Project, as in project settings. */
    canManage: boolean;
    canAdd: boolean;
    /** Why one can't be added, from the backend. */
    reason: string | null;
};

/**
 * Whether another warehouse can be added: a project on one connection
 * switches first, one with several adds another. Both follow the backend's
 * answer and the warehouse types that support extras.
 */
export const canAddWarehouse = ({
    canManage,
    mode,
    capabilities,
    availability,
    originalWarehouseType,
    mixedTypesEnabled,
}: {
    canManage: boolean;
    mode: StudioWarehouses['mode'];
    capabilities: WarehouseConnectionCapabilities | undefined;
    availability: WarehouseConnectionSwitchAvailability | undefined;
    originalWarehouseType: WarehouseTypes | null;
    mixedTypesEnabled: boolean;
}): boolean => {
    if (!canManage || !originalWarehouseType) return false;
    if (!supportsMultipleConnections(originalWarehouseType, mixedTypesEnabled))
        return false;
    switch (mode) {
        case 'single':
            return availability?.canSwitch === true;
        case 'multiple':
            return capabilities?.canAddConnection === true;
        default:
            return false;
    }
};

export type WarehouseMenuItem = {
    /** Whether the Add menu lists Warehouse at all. */
    listed: boolean;
    disabled: boolean;
    /** Opens the add-a-connection dialog here instead of project settings. */
    inPlace: boolean;
};

/**
 * Warehouse in the Add menu. With the flag off a project has one warehouse,
 * so it's listed greyed out once there is one. With the flag on, a project
 * that has one adds another here, for people who manage the project.
 */
export const warehouseMenuItem = ({
    hasWarehouse,
    canAddWithoutWarehouse,
    warehouses,
}: {
    hasWarehouse: boolean;
    /** The usual Add rules: project settings open and the kind is managed. */
    canAddWithoutWarehouse: boolean;
    warehouses: StudioWarehouses | null;
}): WarehouseMenuItem => {
    if (!warehouses || !hasWarehouse) {
        return {
            listed: canAddWithoutWarehouse,
            disabled: hasWarehouse,
            inPlace: false,
        };
    }
    return {
        listed: warehouses.canManage,
        disabled: !warehouses.canAdd,
        inPlace: true,
    };
};

/**
 * The project's warehouses for the page, or null when the flag is off.
 * People who manage the project get the settings listing, which also says
 * whether another can be added. Everyone else gets the names and types the
 * connection switcher reads, which needs only view Project; a project still
 * on one connection answers that with an error, read as no connections.
 */
export const useStudioWarehouses = (
    projectUuid: string | undefined,
): { warehouses: StudioWarehouses | null; isInitialLoading: boolean } => {
    const { user } = useApp();
    const flag = useServerFeatureFlag(FeatureFlags.MultiConnectionProjects);
    const mixedFlag = useServerFeatureFlag(
        FeatureFlags.MixedWarehouseConnections,
    );
    const organizationUuid = user.data?.organizationUuid;
    const canManage =
        !!projectUuid &&
        !!organizationUuid &&
        user.data?.ability.can(
            'manage',
            subject('Project', { organizationUuid, projectUuid }),
        ) === true;
    const listing = useWarehouseConnections(projectUuid ?? '', {
        enabled: canManage,
    });
    const mode = listing.data?.mode ?? null;
    const viewerListing = useWarehouseConnectionsForUserCredentials(
        projectUuid ?? '',
        listing.isEnabled && !canManage && !!projectUuid,
    );
    const availability = useWarehouseConnectionSwitchAvailability(
        projectUuid ?? '',
        listing.isEnabled && mode === 'single',
    );
    const isInitialLoading =
        flag.isInitialLoading ||
        listing.isInitialLoading ||
        viewerListing.isInitialLoading ||
        availability.isInitialLoading;
    if (!listing.isEnabled) return { warehouses: null, isInitialLoading };

    const multiple = listing.data?.mode === 'multiple' ? listing.data : null;
    const originalWarehouseType =
        multiple?.connections.find(({ isOriginal }) => isOriginal)
            ?.warehouseType ??
        availability.data?.originalWarehouseType ??
        null;
    return {
        isInitialLoading,
        warehouses: {
            connections:
                multiple?.connections ?? viewerListing.data ?? NO_CONNECTIONS,
            mode,
            originalWarehouseType,
            canManage,
            canAdd: canAddWarehouse({
                canManage,
                mode,
                capabilities: multiple?.capabilities,
                availability: availability.data,
                originalWarehouseType,
                mixedTypesEnabled: mixedFlag.data?.enabled === true,
            }),
            reason:
                multiple?.capabilities.reason ??
                availability.data?.reason ??
                null,
        },
    };
};
