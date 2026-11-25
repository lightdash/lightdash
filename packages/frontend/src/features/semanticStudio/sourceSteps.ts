/** The one next source the rail suggests, in priority order. */
export type SourceStep =
    | 'connectWarehouse'
    | 'modelFirstTable'
    | 'addVirtualView'
    | 'addLiveSource';

type SourceKinds = {
    warehouse: boolean;
    models: boolean;
    views: boolean;
    live: boolean;
};

/**
 * Connect the warehouse first, then model one of its tables; a virtual view
 * only once there is a warehouse to run on; then a live data source. Each step needs the permission to take it.
 */
export const getNextSourceStep = ({
    has,
    can,
}: {
    has: SourceKinds;
    can: SourceKinds;
}): SourceStep | null => {
    if (!has.warehouse && can.warehouse) return 'connectWarehouse';
    if (has.warehouse && !has.models && can.models) return 'modelFirstTable';
    if (has.warehouse && !has.views && can.views) return 'addVirtualView';
    if (!has.live && can.live) return 'addLiveSource';
    return null;
};
