import { type PendingChange } from '../../../../features/dashboard/pendingChanges/getPendingChanges';

export const EXAMPLE_CHANGES_LIST_TARGET =
    '[data-tour="dashboard-edit-changes-list"]';

export const EXAMPLE_PENDING_CHANGES: PendingChange[] = [
    {
        area: 'tile',
        kind: 'added',
        id: 'example:added',
        label: 'Revenue by month',
    },
    {
        area: 'tile',
        kind: 'removed',
        id: 'example:removed',
        label: 'Old orders table',
    },
    {
        area: 'layout',
        kind: 'moved',
        id: 'example:moved',
        label: 'Orders by status',
    },
    {
        area: 'filter',
        kind: 'edited',
        id: 'example:edited',
        label: 'Order date',
    },
];
