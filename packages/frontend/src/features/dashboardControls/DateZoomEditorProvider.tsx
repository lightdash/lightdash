import { DateGranularity, type DateZoomControl } from '@lightdash/common';
import { isEqual } from 'es-toolkit/compat';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
    type RefObject,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useStableCallback } from '../../hooks/useStableCallback';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import {
    selectControlGranularities,
    selectCurrentDateZoomConfig,
    selectDateZoomGranularity,
    useDashboardDateZoomConfig,
    useDashboardDateZoomGranularities,
    useDashboardSelector,
    useDashboardStore,
    useDefaultDateZoomGranularity,
} from '../dashboard/store';
import {
    applyZoomDraft,
    DATE_ZOOM_PILL_ACTION_SELECTOR,
    DATE_ZOOM_PILL_SELECTOR,
    DEFAULT_DATE_ZOOM_NAME,
    DEFAULT_ZOOM_ID,
    dateZoomPillSelector,
    removeZoom,
    setZoomSection,
    setZoomTiles,
    withZoomSection,
    type DateZoomTileTargets,
    type ZoomTileChange,
} from './dateZoomControls';
import { PARAMETER_PILL_SELECTOR } from './parameterControlsBar';
import { useOrderSectionChanges } from './useControlOrder';
import { type FieldApply } from './useControlsSidebar';
import {
    DateZoomEditorContext,
    useDateZoomEditorSelector,
    type DateZoomEditorValue,
} from './useDateZoomEditor';
import { useDateZoomMappingModel } from './useDateZoomMapping';
import { useEditorDismiss } from './useEditorDismiss';

const ADD_SELECTOR =
    '[data-filter-actions] > button[data-dashboard-filter-control]';
// What switches away from an open zoom: a filter's or a parameter's pill, or "Add"
const OTHER_TARGET_SELECTOR = `[data-controls-pill], ${PARAMETER_PILL_SELECTOR}, ${ADD_SELECTOR}`;
const APPLY_SELECTOR = '[data-controls-editor] [data-controls-apply]';
const focusApply = () =>
    document.querySelector<HTMLElement>(APPLY_SELECTOR)?.focus();

type EditState = {
    id: string;
    // Started from "Add": not on the bar until Apply
    isNew: boolean;
    // The mode it started in: a mode change ends it, as Cancel
    isViewer: boolean;
    snapshot: DateZoomControl;
    draft: DateZoomControl;
    /** Every tile target as it opened, and as the draft leaves them. */
    snapshotTargets: DateZoomTileTargets;
    draftTargets: DateZoomTileTargets;
    /** A viewer's pick (the default zoom's draft for an editor), as it opened and now; null: cleared. */
    snapshotPick: string | null;
    pick: string | null;
    mapping: {
        start: DateZoomTileTargets;
        undo: { targets: DateZoomTileTargets; change: FieldApply } | null;
    } | null;
};

// The section is no edit: it moves on the dashboard at once, as a filter's
const withoutSection = (control: DateZoomControl) =>
    withZoomSection(control, null);

const isDirty = (edit: EditState) =>
    edit.isViewer || edit.id === DEFAULT_ZOOM_ID
        ? edit.pick !== edit.snapshotPick
        : !isEqual(withoutSection(edit.snapshot), withoutSection(edit.draft)) ||
          !isEqual(edit.snapshotTargets, edit.draftTargets);

type FocusTarget = { pillId: string; sectionId?: string };

// The pill and this reader update together after the editor closes
const DateZoomFocusReturn: FC<{ target: RefObject<FocusTarget | null> }> = ({
    target,
}) => {
    const isOpen = useDateZoomEditorSelector((c) => c.editingId !== null);
    useEffect(() => {
        const current = target.current;
        if (isOpen || current === null) return;
        target.current = null;
        const sectionAdd = current.sectionId
            ? document.querySelector<HTMLElement>(
                  `[data-section-add="${current.sectionId}"]`,
              )
            : null;
        (
            document.querySelector<HTMLElement>(
                dateZoomPillSelector(current.pillId),
            ) ??
            sectionAdd ??
            document.querySelector<HTMLElement>(ADD_SELECTOR)
        )?.focus();
    }, [isOpen, target]);
    return null;
};

// One date zoom edited at a time, beside the filter and parameter editors:
// the draft, Apply, Cancel, Escape, a press outside and focus return follow
// their rules. The only writer of the date zoom config on the bar
export const DateZoomEditorProvider: FC<{
    isViewer: boolean;
    children: ReactNode;
}> = ({ isViewer, children }) => {
    const store = useDashboardStore();
    const orderSectionChanges = useOrderSectionChanges();
    const config = useDashboardDateZoomConfig();
    const granularities = useDashboardDateZoomGranularities();
    const controlGranularities = useDashboardSelector(
        selectControlGranularities,
    );
    const setDateZoomConfig = useDashboardContext((c) => c.setDateZoomConfig);
    const setControlGranularity = useDashboardContext(
        (c) => c.setControlGranularity,
    );
    const dateZoomGranularity = useDashboardSelector(selectDateZoomGranularity);
    const setDateZoomGranularity = useDashboardContext(
        (c) => c.setDateZoomGranularity,
    );
    const defaultGranularity = useDefaultDateZoomGranularity();
    const setDefaultDateZoomGranularity = useDashboardContext(
        (c) => c.setDefaultDateZoomGranularity,
    );
    const { track } = useTracking();
    // As the shipped bar: edit mode starts from the default, with no viewer's pick
    useEffect(() => {
        if (!isViewer) setDateZoomGranularity(undefined);
    }, [isViewer, setDateZoomGranularity]);
    const [state, setState] = useState<EditState | null>(null);
    // Derived: a mode change, or the zoom leaving the dashboard, ends the edit
    const edit =
        state !== null &&
        state.isViewer === isViewer &&
        (state.isNew ||
            state.id === DEFAULT_ZOOM_ID ||
            config.controls.some(({ uuid }) => uuid === state.id))
            ? state
            : null;
    // What follows once "Apply changes first?" is answered
    const [pending, setPending] = useState<{ proceed: () => void } | null>(
        null,
    );
    const isAsking = edit !== null && pending !== null;
    const latest = useRef(edit);
    latest.current = edit;
    const latestPending = useRef(pending);
    latestPending.current = isAsking ? pending : null;
    // The pill that takes focus once the popover has gone, else "Add"
    const focusReturn = useRef<FocusTarget | null>(null);

    const end = (focusId: string | null) => {
        const current = latest.current;
        focusReturn.current =
            focusId === null
                ? null
                : {
                      pillId: focusId,
                      sectionId: current?.isNew
                          ? current.snapshot.sectionId
                          : undefined,
                  };
        latest.current = null;
        latestPending.current = null;
        setState(null);
        setPending(null);
    };
    const start = (control: DateZoomControl, isNew: boolean) => {
        setPending(null);
        const isDefault = control.uuid === DEFAULT_ZOOM_ID;
        // The default's runtime grain was cleared as edit mode began
        const override = isDefault
            ? (dateZoomGranularity ?? null)
            : (controlGranularities[control.uuid] ?? null);
        // An editor's tiles show the grain being edited, not a viewer's pick
        if (!isViewer && !isDefault && override !== null)
            setControlGranularity(control.uuid, undefined);
        const pick = isDefault
            ? isViewer
                ? override
                : (defaultGranularity ?? null)
            : (override ?? control.granularity);
        setState({
            id: control.uuid,
            isNew,
            isViewer,
            snapshot: control,
            draft: control,
            snapshotTargets: config.tileTargets,
            draftTargets: config.tileTargets,
            snapshotPick: pick,
            pick,
            mapping: null,
        });
    };

    const cancel = useStableCallback(() => {
        const current = latest.current;
        if (current !== null) end(current.id);
    });

    const apply = useStableCallback(() => {
        const current = latest.current;
        if (current === null) return;
        if (current.id === DEFAULT_ZOOM_ID) {
            if (isDirty(current) && current.isViewer) {
                // As the shipped menu's pick; cleared is the saved default
                track({
                    name: EventName.DATE_ZOOM_CLICKED,
                    properties: { granularity: current.pick ?? 'default' },
                });
                setDateZoomGranularity(
                    current.pick ?? defaultGranularity ?? undefined,
                );
            } else if (isDirty(current))
                setDefaultDateZoomGranularity(current.pick ?? undefined);
        } else if (current.isViewer) {
            if (isDirty(current))
                setControlGranularity(current.id, current.pick ?? undefined);
        } else if (current.isNew || isDirty(current)) {
            setDateZoomConfig(
                applyZoomDraft({
                    config: selectCurrentDateZoomConfig(store.getState()),
                    draft: current.draft,
                    snapshotTargets: current.snapshotTargets,
                    draftTargets: current.draftTargets,
                }),
            );
        }
        end(current.id);
    });

    const open = useStableCallback((control: DateZoomControl) => {
        const current = latest.current;
        if (current?.id === control.uuid) {
            if (isDirty(current)) focusApply();
            else cancel();
            return;
        }
        // Another zoom: a clean edit switches, else the popover asks
        if (current !== null && isDirty(current)) {
            setPending({ proceed: () => start(control, false) });
            focusApply();
            return;
        }
        start(control, false);
    });

    const add = useStableCallback((sectionId: string | null) =>
        start(
            {
                uuid: uuidv4(),
                name: DEFAULT_DATE_ZOOM_NAME,
                granularity: granularities[0] ?? DateGranularity.MONTH,
                ...(sectionId !== null && { sectionId }),
            },
            true,
        ),
    );

    // The prompt's answer: Apply or Discard, then what was clicked. The
    // next editor takes focus, not this zoom's pill
    const resolvePending = useStableCallback((isApply: boolean) => {
        const next = latestPending.current;
        if (next === null) return;
        if (isApply) apply();
        else cancel();
        focusReturn.current = null;
        next.proceed();
    });

    const startMapping = useStableCallback(() => {
        const current = latest.current;
        if (current !== null && !current.isViewer)
            setState({
                ...current,
                mapping: { start: current.draftTargets, undo: null },
            });
    });
    const endMapping = useStableCallback(() => {
        const current = latest.current;
        if (current?.mapping) setState({ ...current, mapping: null });
    });
    const cancelMapping = useStableCallback(() => {
        const current = latest.current;
        if (current?.mapping)
            setState({
                ...current,
                draftTargets: current.mapping.start,
                mapping: null,
            });
    });
    const setTiles = useStableCallback(
        (changes: ZoomTileChange[], kind: FieldApply['kind']) => {
            const current = latest.current;
            if (!current?.mapping) return;
            const next = setZoomTiles(
                current.draftTargets,
                current.id,
                changes,
            );
            if (isEqual(next, current.draftTargets)) return;
            setState({
                ...current,
                draftTargets: next,
                mapping: {
                    ...current.mapping,
                    undo: {
                        targets: current.draftTargets,
                        change: {
                            kind,
                            fieldId: current.id,
                            tileCount: changes.length,
                            replaced: 0,
                            acrossTabs: true,
                        },
                    },
                },
            });
        },
    );
    const undoMapping = useStableCallback(() => {
        const current = latest.current;
        if (current?.mapping?.undo)
            setState({
                ...current,
                draftTargets: current.mapping.undo.targets,
                mapping: { ...current.mapping, undo: null },
            });
    });

    // Escape: in mapping, back to the popover while nothing changed there;
    // else a question is withdrawn, else the edit is cancelled
    const dismiss = useStableCallback(() => {
        const mapping = latest.current?.mapping;
        if (mapping) {
            if (isEqual(mapping.start, latest.current?.draftTargets))
                endMapping();
            return;
        }
        if (latestPending.current === null) {
            cancel();
            return;
        }
        setPending(null);
        setTimeout(() =>
            document
                .querySelector<HTMLElement>('[data-controls-editor] input')
                ?.focus(),
        );
    });

    // Another kind's pill or "Add" while a zoom is edited: a clean edit
    // closes and the click goes on; with unapplied changes the popover asks,
    // and the click is replayed once it is answered
    const isOpenForCapture = edit !== null;
    useEffect(() => {
        if (!isOpenForCapture) return undefined;
        const handleClick = (event: MouseEvent) => {
            const current = latest.current;
            const target =
                event.target instanceof Element
                    ? event.target.closest<HTMLElement>(OTHER_TARGET_SELECTOR)
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

    const setSection = useStableCallback(
        (id: string, sectionId: string | null) =>
            setDateZoomConfig(
                setZoomSection(
                    selectCurrentDateZoomConfig(store.getState()),
                    id,
                    sectionId,
                ),
            ),
    );

    const update = useStableCallback((next: DateZoomControl) => {
        const current = latest.current;
        if (current === null) return;
        const sectionId = next.sectionId ?? null;
        const isSectionMove =
            !current.isViewer &&
            !current.isNew &&
            sectionId !== (current.draft.sectionId ?? null);
        if (isSectionMove) {
            const before = store.getState();
            setSection(current.id, sectionId);
            // A section change is a reorder, written with it
            orderSectionChanges(before);
        }
        setState({
            ...current,
            draft: next,
            snapshot: isSectionMove
                ? withZoomSection(current.snapshot, sectionId)
                : current.snapshot,
        });
    });

    const setPick = useStableCallback((granularity: string | null) => {
        const current = latest.current;
        if (current !== null) setState({ ...current, pick: granularity });
    });

    const remove = useStableCallback((id: string) => {
        if (latest.current?.id === id) setState(null);
        focusReturn.current = null;
        setDateZoomConfig(
            removeZoom(selectCurrentDateZoomConfig(store.getState()), id),
        );
        setTimeout(() =>
            document.querySelector<HTMLElement>(ADD_SELECTOR)?.focus(),
        );
    });

    // A mode change ends the edit it started in, as the filter editor's:
    // an editor's is applied, a viewer's (only picks) dropped.
    // The one effect that writes the store
    const unsettled = useRef(state);
    unsettled.current = state;
    const lastIsViewer = useRef(isViewer);
    useEffect(() => {
        if (lastIsViewer.current === isViewer) return;
        lastIsViewer.current = isViewer;
        const previous = unsettled.current;
        if (previous === null) return;
        if (!previous.isViewer) {
            latest.current = previous;
            latestPending.current = null;
            apply();
        }
        end(null);
    }, [isViewer, apply]);

    const dismissOutside = useStableCallback(() => {
        if (!latest.current?.mapping) cancel();
    });
    const mapping = useDateZoomMappingModel(
        edit?.mapping ? edit.draft : null,
        edit?.draftTargets ?? null,
    );

    useEditorDismiss({
        isOpen: edit !== null,
        isFieldClicked: false,
        isAsking,
        isPristineNew: false,
        clearField: cancel,
        dismiss,
        // Mapping is left only by its own Cancel or Apply
        dismissOutside,
        pillSelector: `${DATE_ZOOM_PILL_SELECTOR}, ${DATE_ZOOM_PILL_ACTION_SELECTOR}, ${OTHER_TARGET_SELECTOR}`,
    });

    const value = useMemo<DateZoomEditorValue>(
        () => ({
            editingId: edit?.id ?? null,
            draft: edit?.draft ?? null,
            newZoom: edit?.isNew ? edit.snapshot : null,
            draftTargets: edit?.draftTargets ?? null,
            isViewer,
            pick: edit?.pick ?? null,
            isAsking,
            open,
            add,
            update,
            setPick,
            apply,
            cancel,
            resolvePending,
            setSection,
            remove,
            isMapping: edit?.mapping != null,
            mapping,
            mappingUndo: edit?.mapping?.undo?.change ?? null,
            startMapping,
            endMapping,
            cancelMapping,
            setTiles,
            undoMapping,
        }),
        [
            mapping,
            startMapping,
            endMapping,
            cancelMapping,
            setTiles,
            undoMapping,
            edit,
            isViewer,
            isAsking,
            open,
            add,
            update,
            setPick,
            apply,
            cancel,
            resolvePending,
            setSection,
            remove,
        ],
    );

    return (
        <DateZoomEditorContext.Provider value={value}>
            {children}
            <DateZoomFocusReturn target={focusReturn} />
        </DateZoomEditorContext.Provider>
    );
};
