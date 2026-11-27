/** The ways to add a source. */
import { type ReactNode } from 'react';
import useHealth from '../../hooks/health/useHealth';
import { useProject } from '../../hooks/useProject';
import { useAddLiveSource } from '../externalConnections/liveSources/liveSourceActions';
import { useExternalSourceActions } from '../externalSources/hooks/externalSourceActions';
import { type Kind } from './model';
import { KindIcon } from './shared';
import { type ViewModel } from './useSemanticStudio';

export const WAREHOUSE_OPTION = 'warehouse';

const ADD_OPTIONS: {
    key: string;
    kind: Kind;
    label: string;
    description: string;
    icon: ReactNode;
    /**
     * The existing setup flow. Without one, the option opens its add dialog
     * right here.
     */
    path?: string;
    /** The flow lives in project settings, which not everyone can open. */
    inSettings?: boolean;
}[] = [
    {
        key: WAREHOUSE_OPTION,
        kind: 'modelled',
        label: 'Warehouse',
        description: 'Connect your warehouse',
        path: '/generalSettings/projectManagement/:projectUuid/settings',
        inSettings: true,
        icon: <KindIcon kind="modelled" size={18} />,
    },
    {
        key: 'sql',
        kind: 'sqlViews',
        label: 'Virtual view',
        description: 'Save a SQL query as a table',
        path: '/projects/:projectUuid/sql-runner',
        icon: <KindIcon kind="sqlViews" size={18} />,
    },
    {
        key: 'file',
        kind: 'files',
        label: 'External source',
        description: 'Upload a file or spreadsheet',
        icon: <KindIcon kind="files" size={18} />,
    },
    {
        key: 'live',
        kind: 'live',
        label: 'Live data source',
        description: 'Query an integration live',
        icon: <KindIcon kind="live" size={18} />,
    },
];

type AddOption = (typeof ADD_OPTIONS)[number];

/**
 * What a person can add: one warehouse per project, only kinds they manage
 * (live data sources aside, whose dialog explains who can add one), and only
 * through flows they can open. Files and live data sources are
 * added in place, through the dialogs their managers own.
 */
export const useAddSource = (view: ViewModel, kind?: Kind) => {
    const { data: health } = useHealth();
    const addLiveSource = useAddLiveSource();
    const externalSources = useExternalSourceActions();
    const isAvailable = (option: AddOption) => {
        switch (option.key) {
            case 'file':
                return (
                    externalSources !== null &&
                    health?.externalSources.engineAvailable === true
                );
            case 'live':
                return addLiveSource !== null;
            default:
                return true;
        }
    };
    const { data: project } = useProject(view.project.id);
    // Null until the project loads, so nothing offers to connect one that exists
    const hasWarehouse: boolean | null = view.project.sources.some(
        (source) => source.kind === 'modelled',
    )
        ? true
        : project
          ? !!project.warehouseConnection
          : null;
    const allowed = ADD_OPTIONS.filter(
        (option) =>
            (!kind || option.kind === kind) &&
            (!option.inSettings || view.canOpenSettings) &&
            isAvailable(option) &&
            // Anyone opens the live dialog; it says who can add one
            (option.key === 'live' || view.permissions[option.kind]),
    );
    // One warehouse per project, and a virtual view runs its SQL on it
    const options = allowed.filter((option) =>
        option.key === WAREHOUSE_OPTION
            ? hasWarehouse === false
            : option.key !== 'sql' || hasWarehouse === true,
    );
    const pathOf = (option: AddOption) =>
        option.path ? addPath(view, option.path) : null;
    const addInPlace = (option: AddOption) =>
        option.key === 'live' ? addLiveSource?.() : externalSources?.add();
    return { options, pathOf, addInPlace, hasWarehouse };
};

export const addPath = (view: ViewModel, path: string) =>
    path.replace(':projectUuid', view.project.id);
