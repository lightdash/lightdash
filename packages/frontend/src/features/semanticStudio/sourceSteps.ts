/** The one next source the rail suggests, in priority order. */
export type SourceStep =
    | 'connectWarehouse'
    | 'modelFirstTable'
    | 'modelAnotherTable'
    | 'addVirtualView'
    | 'addLiveSource';

type SourceKinds = {
    warehouse: boolean;
    models: boolean;
    views: boolean;
    live: boolean;
};

/**
 * Connect the warehouse first, then model its tables while any are left; a
 * virtual view only once there is a warehouse to run on; then a live data
 * source. `can.models` means tables are left to model and the person may.
 */
export const getNextSourceStep = ({
    has,
    can,
}: {
    has: SourceKinds;
    can: SourceKinds;
}): SourceStep | null => {
    if (!has.warehouse && can.warehouse) return 'connectWarehouse';
    if (has.warehouse && can.models)
        return has.models ? 'modelAnotherTable' : 'modelFirstTable';
    if (has.warehouse && !has.views && can.views) return 'addVirtualView';
    if (!has.live && can.live) return 'addLiveSource';
    return null;
};
