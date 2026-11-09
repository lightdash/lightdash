import {
    DateGranularity,
    pruneDateZoomConfig,
    type DateZoomConfig,
    type DateZoomControl,
} from '@lightdash/common';
import { isEqual } from 'es-toolkit/compat';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useStableCallback } from '../../hooks/useStableCallback';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    useDashboardDateZoomConfig,
    useDashboardDateZoomGranularities,
    useDashboardStore,
} from '../dashboard/store';
import {
    DATE_ZOOM_ADD_SELECTOR,
    DATE_ZOOM_PILL_ATTRIBUTE,
    DATE_ZOOM_PILL_SELECTOR,
    DEFAULT_DATE_ZOOM_NAME,
    getDateZoomControl,
    setZoomTiles,
    withDateZoomControl,
} from './dateZoomControls';
import {
    PARAMETER_PILL_ACTION_SELECTOR,
    PARAMETER_PILL_SELECTOR,
} from './parameterControlsBar';
import { type FieldApply } from './useControlsSidebar';
import {
    DateZoomEditorContext,
    useDateZoomEditorSelector,
    type DateZoomEditorValue,
    type DateZoomTileChoice,
} from './useDateZoomEditor';
import { useEditorDismiss } from './useEditorDismiss';

// What switches away from an open zoom: a filter's or a parameter's pill, or "Add filter"
const OTHER_CONTROL_SELECTOR = `[data-controls-pill], [data-filter-actions] > button[data-dashboard-filter-control], ${PARAMETER_PILL_SELECTOR}`;
const APPLY_SELECTOR = '[data-controls-editor] [data-controls-apply]';
const focusApply = () =>
    document.querySelector<HTMLElement>(APPLY_SELECTOR)?.focus();

type EditState = {
    uuid: string;
    // Started from "Add date zoom": not on the bar until Apply
    isNew: boolean;
    snapshot: DateZoomConfig;
    draft: DateZoomConfig;
    mapping: {
        start: DateZoomConfig;
        undo: { config: DateZoomConfig; change: FieldApply } | null;
    } | null;
};

const noop = () => {};

const isDirty = ({ snapshot, draft }: EditState) => !isEqual(snapshot, draft);

// The pill and this reader update together after the editor closes
const DateZoomFocusReturn: FC<{
    target: { current: string | null };
}> = ({ target }) => {
    const isOpen = useDateZoomEditorSelector((c) => c.editingUuid !== null);
    useEffect(() => {
        const uuid = target.current;
        if (isOpen || uuid === null) return;
        target.current = null;
        (
            document.querySelector<HTMLElement>(
                `[${DATE_ZOOM_PILL_ATTRIBUTE}="${uuid}"]`,
            ) ?? document.querySelector<HTMLElement>(DATE_ZOOM_ADD_SELECTOR)
        )?.focus();
    }, [isOpen, target]);
    return null;
};

// One named date zoom edited at a time, beside the filter and parameter
// editors: the draft, Apply, Cancel, Escape, a press outside and focus
// return follow theirs. The only writer of the date zoom config with the flag on
export const DateZoomEditorProvider: FC<{
    isViewer: boolean;
    children: ReactNode;
}> = ({ isViewer, children }) => {
    const store = useDashboardStore();
    const config = useDashboardDateZoomConfig();
    const granularities = useDashboardDateZoomGranularities();
    const setDateZoomConfig = useDashboardContext((c) => c.setDateZoomConfig);
    const setControlGranularity = useDashboardContext(
        (c) => c.setControlGranularity,
    );
    const [state, setState] = useState<EditState | null>(null);
    // Derived: viewers never edit, and a zoom taken off the dashboard ends its edit
    const edit =
        state !== null &&
        !isViewer &&
        (state.isNew || getDateZoomControl(config, state.uuid) !== undefined)
            ? state
            : null;
    const [pending, setPending] = useState<{ proceed: () => void } | null>(
        null,
    );
    const isAsking = edit !== null && pending !== null;
    const latest = useRef(edit);
    latest.current = edit;
    const latestPending = useRef(pending);
    latestPending.current = isAsking ? pending : null;
    const focusReturn = useRef<string | null>(null);

    const end = (focusUuid: string | null) => {
        focusReturn.current = focusUuid;
        latest.current = null;
        latestPending.current = null;
        setState(null);
        setPending(null);
    };
    const start = (next: EditState) => {
        // Tiles show the zoom's own grain, not a viewer's pick from before
        if (
            store.getState().dateZoom.controlGranularities[next.uuid] !==
            undefined
        )
            setControlGranularity(next.uuid, undefined);
        setPending(null);
        latest.current = next;
        setState(next);
    };

    const cancel = useStableCallback(() => {
        const current = latest.current;
        if (current !== null) end(current.uuid);
    });

    const apply = useStableCallback(() => {
        const current = latest.current;
        if (current === null) return;
        // A zoom left with no tile is dropped, as the shipped Save does
        if (current.isNew || isDirty(current))
            setDateZoomConfig(pruneDateZoomConfig(current.draft));
        end(current.uuid);
    });

    const open = useStableCallback((uuid: string) => {
        const current = latest.current;
        if (current?.uuid === uuid) {
            if (isDirty(current)) focusApply();
            else cancel();
            return;
        }
        const proceed = () =>
            start({
                uuid,
                isNew: false,
                snapshot: config,
                draft: config,
                mapping: null,
            });
        // Another zoom: a clean edit switches, else the popover asks
        if (current !== null && isDirty(current)) {
            setPending({ proceed });
            focusApply();
            return;
        }
        proceed();
    });

    const add = useStableCallback(() => {
        const uuid = uuidv4();
        const draft = withDateZoomControl(config, {
            uuid,
            name: DEFAULT_DATE_ZOOM_NAME,
            granularity: granularities[0] ?? DateGranularity.MONTH,
        });
        start({ uuid, isNew: true, snapshot: draft, draft, mapping: null });
    });

    const update = useStableCallback((next: DateZoomControl) => {
        const current = latest.current;
        if (current === null || next.uuid !== current.uuid) return;
        const updated = {
            ...current,
            draft: withDateZoomControl(current.draft, next),
        };
        latest.current = updated;
        setState(updated);
    });

    const remove = useStableCallback(() => {
        const current = latest.current;
        if (current === null) return;
        if (!current.isNew)
            setDateZoomConfig(
                pruneDateZoomConfig({
                    ...config,
                    controls: config.controls.filter(
                        ({ uuid }) => uuid !== current.uuid,
                    ),
                }),
            );
        // Its pill is gone: focus goes to "Add date zoom"
        end(current.uuid);
    });

    // The prompt's answer: Apply or Discard, then what was clicked
    const resolvePending = useStableCallback((isApply: boolean) => {
        const next = latestPending.current;
        if (next === null) return;
        if (isApply) apply();
        else cancel();
        focusReturn.current = null;
        next.proceed();
    });

    const write = (next: EditState) => {
        latest.current = next;
        setState(next);
    };
    const startMapping = useStableCallback(() => {
        const current = latest.current;
        if (current !== null)
            write({
                ...current,
                mapping: { start: current.draft, undo: null },
            });
    });
    const endMapping = useStableCallback(() => {
        const current = latest.current;
        if (current?.mapping) write({ ...current, mapping: null });
    });
    const cancelMapping = useStableCallback(() => {
        const current = latest.current;
        if (current?.mapping)
            write({ ...current, draft: current.mapping.start, mapping: null });
    });
    const changeMapping = (
        next: DateZoomConfig,
        kind: FieldApply['kind'],
        tileCount: number,
    ) => {
        const current = latest.current;
        if (!current?.mapping || next === current.draft) return;
        write({
            ...current,
            draft: next,
            mapping: {
                ...current.mapping,
                undo: {
                    config: current.draft,
                    change: {
                        kind,
                        fieldId: current.uuid,
                        tileCount,
                        replaced: 0,
                        acrossTabs: true,
                    },
                },
            },
        });
    };
    // A tile's first zoomable field, else none: it only reads the parameter
    const getTarget = (tileUuid: string, fieldId: string | null) => {
        const fields =
            store.getState().dateZoom.chartZoomableFieldsByTileUuid[tileUuid] ??
            [];
        const field =
            fieldId === null
                ? fields[0]
                : fields.find((item) => item.fieldId === fieldId);
        return {
            fieldId: field?.fieldId ?? null,
            tableName: field?.tableName ?? null,
        };
    };
    const setTile = useStableCallback(
        (tileUuid: string, choice: DateZoomTileChoice | null) => {
            const current = latest.current;
            if (!current?.mapping) return;
            changeMapping(
                setZoomTiles(current.draft, current.uuid, [
                    {
                        tileUuid,
                        target:
                            choice === null
                                ? null
                                : getTarget(
                                      tileUuid,
                                      choice.kind === 'field'
                                          ? choice.fieldId
                                          : null,
                                  ),
                    },
                ]),
                choice === null ? 'clear' : 'pick',
                1,
            );
        },
    );
    const setTiles = useStableCallback(
        (tileUuids: string[], isZoomed: boolean) => {
            const current = latest.current;
            if (!current?.mapping) return;
            changeMapping(
                setZoomTiles(
                    current.draft,
                    current.uuid,
                    tileUuids.map((tileUuid) => ({
                        tileUuid,
                        target: isZoomed ? getTarget(tileUuid, null) : null,
                    })),
                ),
                isZoomed ? 'apply' : 'clear',
                tileUuids.length,
            );
        },
    );
    const undoMapping = useStableCallback(() => {
        const current = latest.current;
        if (current?.mapping?.undo)
            write({
                ...current,
                draft: current.mapping.undo.config,
                mapping: { ...current.mapping, undo: null },
            });
    });

    // Escape: in mapping, back to the popover while nothing changed; else a
    // question is withdrawn, else the edit is cancelled
    const dismiss = useStableCallback(() => {
        const current = latest.current;
        if (current?.mapping) {
            if (isEqual(current.mapping.start, current.draft)) endMapping();
            return;
        }
        if (latestPending.current === null) {
            cancel();
            return;
        }
        setPending(null);
        setTimeout(focusApply);
    });

    // A filter's or a parameter's pill, or "Add filter", while a zoom is
    // edited: a clean edit closes and the click goes on; with unapplied
    // changes the popover asks, and the click is replayed once answered
    const isOpenForCapture = edit !== null;
    useEffect(() => {
        if (!isOpenForCapture) return undefined;
        const handleClick = (event: MouseEvent) => {
            const current = latest.current;
            const target =
                event.target instanceof Element
                    ? event.target.closest<HTMLElement>(OTHER_CONTROL_SELECTOR)
                    : null;
            if (current === null || target === null) return;
            if (!isDirty(current)) {
                cancel();
                focusReturn.current = null;
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            setPending({ proceed: () => target.click() });
            focusApply();
        };
        document.addEventListener('click', handleClick, true);
        return () => document.removeEventListener('click', handleClick, true);
    }, [isOpenForCapture, cancel]);

    // Leaving edit mode ends the edit as Apply does, as the other editors.
    // The one effect that writes the store
    const unsettled = useRef(state);
    unsettled.current = state;
    const lastIsViewer = useRef(isViewer);
    useEffect(() => {
        if (lastIsViewer.current === isViewer) return;
        lastIsViewer.current = isViewer;
        const previous = unsettled.current;
        if (previous === null) return;
        latest.current = previous;
        latestPending.current = null;
        apply();
        end(null);
    }, [isViewer, apply]);

    // A press outside never leaves mapping
    const dismissOutside = useStableCallback(() => {
        if (!latest.current?.mapping) cancel();
    });

    useEditorDismiss({
        isOpen: edit !== null,
        isFieldClicked: false,
        isAsking,
        isPristineNew: false,
        clearField: noop,
        dismiss,
        dismissOutside,
        pillSelector: `${DATE_ZOOM_PILL_SELECTOR}, ${OTHER_CONTROL_SELECTOR}, ${PARAMETER_PILL_ACTION_SELECTOR}`,
    });

    const value = useMemo<DateZoomEditorValue>(
        () => ({
            editingUuid: edit?.uuid ?? null,
            isNew: edit?.isNew ?? false,
            draft:
                edit === null
                    ? null
                    : (getDateZoomControl(edit.draft, edit.uuid) ?? null),
            draftConfig: edit?.draft ?? null,
            isAsking,
            open,
            add,
            update,
            apply,
            cancel,
            resolvePending,
            remove,
            isMapping: edit?.mapping != null,
            mappingUndo: edit?.mapping?.undo?.change ?? null,
            startMapping,
            endMapping,
            cancelMapping,
            setTile,
            setTiles,
            undoMapping,
        }),
        [
            edit,
            isAsking,
            open,
            add,
            update,
            apply,
            cancel,
            resolvePending,
            remove,
            startMapping,
            endMapping,
            cancelMapping,
            setTile,
            setTiles,
            undoMapping,
        ],
    );

    return (
        <DateZoomEditorContext.Provider value={value}>
            {children}
            <DateZoomFocusReturn target={focusReturn} />
        </DateZoomEditorContext.Provider>
    );
};
