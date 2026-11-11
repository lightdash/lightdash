import { DateGranularity, type DateZoomControl } from '@lightdash/common';
import { isEqual } from 'es-toolkit/compat';
import {
    useEffect,
    useMemo,
    useState,
    type FC,
    type ReactNode,
    type RefObject,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import useIsEmbedded from '../../ee/providers/Embed/useIsEmbedded';
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
import { EditorFocusReturn, type FocusTarget } from './EditorFocusReturn';
import { useOrderSectionChanges } from './useControlOrder';
import { type FieldApply } from './useControlsSidebar';
import {
    DateZoomEditorContext,
    useDateZoomEditorSelector,
    type DateZoomEditorValue,
} from './useDateZoomEditor';
import { useDateZoomMappingModel } from './useDateZoomMapping';
import { useEditorSession, type EditSession } from './useEditorSession';

type EditState = EditSession<DateZoomTileTargets> & {
    snapshot: DateZoomControl;
    draft: DateZoomControl;
    /** Every tile target as it opened, and as the draft leaves them. */
    snapshotTargets: DateZoomTileTargets;
    draftTargets: DateZoomTileTargets;
    /** A viewer's pick (the default zoom's draft for an editor), as it opened and now; null: cleared. */
    snapshotPick: string | null;
    pick: string | null;
};

// The section is no edit: it moves on the dashboard at once, as a filter's
const withoutSection = (control: DateZoomControl) =>
    withZoomSection(control, null);

const isDirty = (edit: EditState) =>
    edit.isViewer || edit.id === DEFAULT_ZOOM_ID
        ? edit.pick !== edit.snapshotPick
        : !isEqual(withoutSection(edit.snapshot), withoutSection(edit.draft)) ||
          !isEqual(edit.snapshotTargets, edit.draftTargets);

const noop = () => {};

const findPill = (id: string) =>
    document.querySelector<HTMLElement>(dateZoomPillSelector(id));

// A reader of the context, so it runs once the pills have updated
const DateZoomFocusReturn: FC<{ target: RefObject<FocusTarget | null> }> = ({
    target,
}) => {
    const isOpen = useDateZoomEditorSelector((c) => c.editingId !== null);
    return (
        <EditorFocusReturn
            isOpen={isOpen}
            target={target}
            findPill={findPill}
        />
    );
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
    // As the shipped bar: edit mode starts from the default, with no viewer's pick.
    // Embeds keep the shipped date zoom, which never clears it.
    const isEmbedded = useIsEmbedded();
    useEffect(() => {
        if (!isViewer && !isEmbedded) setDateZoomGranularity(undefined);
    }, [isViewer, isEmbedded, setDateZoomGranularity]);
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
    const start = (control: DateZoomControl, isNew: boolean) => {
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
        session.begin({
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

    const applyEdit = (current: EditState) => {
        if (current.id === DEFAULT_ZOOM_ID) {
            if (isDirty(current) && current.isViewer) {
                // As the shipped menu's pick; cleared is its "Reset to default"
                track({
                    name: EventName.DATE_ZOOM_CLICKED,
                    properties: { granularity: current.pick ?? 'default' },
                });
                setDateZoomGranularity(current.pick ?? undefined);
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
        return current.id;
    };

    const session = useEditorSession<EditState, DateZoomTileTargets>({
        kind: 'dateZoom',
        isViewer,
        state,
        edit,
        setState,
        isDirty,
        applyEdit,
        getMappingDraft: (current) => current.draftTargets,
        withMappingDraft: (current, draftTargets) => ({
            ...current,
            draftTargets,
        }),
        // No key to clear: Escape dismisses
        isFieldClicked: false,
        clearField: noop,
    });
    const { latest, isAsking, apply, cancel, resolvePending } = session;
    const { endMapping, cancelMapping, undoMapping } = session;

    const open = useStableCallback((control: DateZoomControl) =>
        session.open(control.uuid, () => start(control, false)),
    );

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

    const startMapping = useStableCallback(() => {
        const current = latest.current;
        if (current !== null && !current.isViewer)
            setState({
                ...current,
                mapping: { start: current.draftTargets, undo: null },
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
            session.changeMapping(next, {
                kind,
                fieldId: current.id,
                tileCount: changes.length,
                replaced: 0,
                acrossTabs: true,
            });
        },
    );

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

    const remove = useStableCallback((id: string) =>
        session.remove(id, () =>
            setDateZoomConfig(
                removeZoom(selectCurrentDateZoomConfig(store.getState()), id),
            ),
        ),
    );

    const mapping = useDateZoomMappingModel(
        edit?.mapping ? edit.draft : null,
        edit?.draftTargets ?? null,
    );

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
            <DateZoomFocusReturn target={session.focusReturn} />
        </DateZoomEditorContext.Provider>
    );
};
