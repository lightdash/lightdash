import { DateGranularity, type DateZoomControl } from '@lightdash/common';
import { VisuallyHidden } from '@mantine/core';
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
import {
    selectControlGranularities,
    selectCurrentDateZoomConfig,
    useDashboardDateZoomConfig,
    useDashboardDateZoomGranularities,
    useDashboardSelector,
    useDashboardStore,
    useDefaultDateZoomGranularity,
} from '../dashboard/store';
import {
    applyZoomDraft,
    DEFAULT_DATE_ZOOM_NAME,
    DEFAULT_ZOOM_SELECTOR,
    dateZoomPillSelector,
    moveZoom,
    removeZoom,
    setZoomSection,
    setZoomTiles,
    withZoomSection,
    type DateZoomTileTargets,
    type ZoomTileChange,
} from './dateZoomControls';
import { EditorFocusReturn, type FocusTarget } from './EditorFocusReturn';
import { useOrderSectionChanges } from './useControlOrder';
import { type FieldApply } from './useControlsEditor';
import {
    DateZoomEditorContext,
    useDateZoomEditorSelector,
    type DateZoomEditorValue,
} from './useDateZoomEditor';
import { useDateZoomMappingModel } from './useDateZoomMapping';
import { useEditorSession, type EditSession } from './useEditorSession';

type EditState = EditSession<DateZoomTileTargets> & {
    /** The default zoom, whose `id` is only a session key: a saved zoom's uuid can be any string. */
    isDefault: boolean;
    snapshot: DateZoomControl;
    draft: DateZoomControl;
    /** Every tile target as it opened, and as the draft leaves them. */
    snapshotTargets: DateZoomTileTargets;
    draftTargets: DateZoomTileTargets;
    /** The default zoom's draft, as it opened and now; null: cleared. */
    snapshotPick: string | null;
    pick: string | null;
};

// The section is no edit: it moves on the dashboard at once, as a filter's
const withoutSection = (control: DateZoomControl) =>
    withZoomSection(control, null);

const isDirty = (edit: EditState) =>
    edit.isDefault
        ? edit.pick !== edit.snapshotPick
        : !isEqual(withoutSection(edit.snapshot), withoutSection(edit.draft)) ||
          !isEqual(edit.snapshotTargets, edit.draftTargets);

const noop = () => {};

const findPill = (id: string) =>
    document.querySelector<HTMLElement>(dateZoomPillSelector(id));

// A reader of the context, so it runs once the pills have updated
const DateZoomFocusReturn: FC<{
    target: RefObject<FocusTarget | null>;
    findPill: (id: string) => HTMLElement | null;
}> = ({ target, findPill }) => {
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
    const setDateZoomGranularity = useDashboardContext(
        (c) => c.setDateZoomGranularity,
    );
    const defaultGranularity = useDefaultDateZoomGranularity();
    const setDefaultDateZoomGranularity = useDashboardContext(
        (c) => c.setDefaultDateZoomGranularity,
    );
    // As the shipped bar: edit mode starts from the default, with no viewer's pick.
    // Embeds keep the shipped date zoom, which never clears it; with the
    // controls on, `EmbedDashboard` clears it for its editor.
    const isEmbedded = useIsEmbedded();
    useEffect(() => {
        if (!isViewer && !isEmbedded) setDateZoomGranularity(undefined);
    }, [isViewer, isEmbedded, setDateZoomGranularity]);
    const [state, setState] = useState<EditState | null>(null);
    // The default's session key: unlike any saved zoom's uuid, so a toggle never confuses them
    const [defaultKey] = useState(() => `default-${uuidv4()}`);
    const findEditedPill = useStableCallback((id: string) =>
        id === defaultKey
            ? document.querySelector<HTMLElement>(DEFAULT_ZOOM_SELECTOR)
            : findPill(id),
    );
    // Derived: a mode change, or the zoom leaving the dashboard, ends the edit
    const edit =
        state !== null &&
        state.isViewer === isViewer &&
        (state.isNew ||
            state.isDefault ||
            config.controls.some(({ uuid }) => uuid === state.id))
            ? state
            : null;
    const start = (
        control: DateZoomControl,
        isNew: boolean,
        isDefault: boolean,
    ) => {
        // The tiles show the grain being edited, not a viewer's pick; the
        // default's runtime grain was cleared as edit mode began
        if (!isDefault && controlGranularities[control.uuid] !== undefined)
            setControlGranularity(control.uuid, undefined);
        const pick = isDefault ? (defaultGranularity ?? null) : null;
        // Read now: after "Apply changes first?" this runs before the next render
        const { tileTargets } = selectCurrentDateZoomConfig(store.getState());
        session.begin({
            id: control.uuid,
            isDefault,
            isNew,
            isViewer,
            snapshot: control,
            draft: control,
            snapshotTargets: tileTargets,
            draftTargets: tileTargets,
            snapshotPick: pick,
            pick,
            mapping: null,
        });
    };

    const applyEdit = (current: EditState) => {
        if (current.isDefault) {
            if (isDirty(current))
                setDefaultDateZoomGranularity(current.pick ?? undefined);
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
        session.open(control.uuid, () => start(control, false, false)),
    );
    const openDefault = useStableCallback(() =>
        session.open(defaultKey, () =>
            start({ uuid: defaultKey, name: '', granularity: '' }, false, true),
        ),
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
            false,
        ),
    );

    const startMapping = useStableCallback(() => {
        const current = latest.current;
        if (current !== null)
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
            !current.isNew && sectionId !== (current.draft.sectionId ?? null);
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

    const [announcement, setAnnouncement] = useState({ text: '', count: 0 });
    // As a parameter's move: the list order is the bar's without sections
    const move = useStableCallback((id: string, overId: string) => {
        const current = selectCurrentDateZoomConfig(store.getState());
        const moved = moveZoom(current, id, overId);
        if (moved === current) return;
        const pill = findPill(id);
        const hadFocus = pill !== null && document.activeElement === pill;
        setDateZoomConfig(moved);
        const indexIn = (list: DateZoomControl[]) =>
            list.findIndex(({ uuid }) => uuid === id);
        const nameOf = (uuid: string) =>
            current.controls.find((control) => control.uuid === uuid)?.name ??
            uuid;
        setAnnouncement(({ count }) => ({
            text: `${nameOf(id)} moved ${
                indexIn(moved.controls) < indexIn(current.controls)
                    ? 'before'
                    : 'after'
            } ${nameOf(overId)}`,
            count: count + 1,
        }));
        // Once the bar has redrawn: a moved node loses focus
        if (hadFocus) setTimeout(() => findPill(id)?.focus());
    });

    // Another zoom's X asks first on unapplied changes, as its pill does
    const remove = useStableCallback((id: string) => {
        const current = latest.current;
        if (current !== null && current.id !== id && isDirty(current)) {
            session.ask(() => remove(id));
            return;
        }
        session.remove(id, () =>
            setDateZoomConfig(
                removeZoom(selectCurrentDateZoomConfig(store.getState()), id),
            ),
        );
    });

    const mapping = useDateZoomMappingModel(
        edit?.mapping ? edit.draft : null,
        edit?.draftTargets ?? null,
    );

    const value = useMemo<DateZoomEditorValue>(
        () => ({
            editingId: edit?.id ?? null,
            isEditingDefault: edit?.isDefault ?? false,
            draft: edit?.draft ?? null,
            newZoom: edit?.isNew ? edit.snapshot : null,
            draftTargets: edit?.draftTargets ?? null,
            isViewer,
            pick: edit?.pick ?? null,
            isAsking,
            open,
            openDefault,
            add,
            update,
            setPick,
            apply,
            cancel,
            resolvePending,
            setSection,
            move,
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
            openDefault,
            add,
            update,
            setPick,
            apply,
            cancel,
            resolvePending,
            setSection,
            move,
            remove,
        ],
    );

    return (
        <DateZoomEditorContext.Provider value={value}>
            {children}
            <DateZoomFocusReturn
                target={session.focusReturn}
                findPill={findEditedPill}
            />
            {/* Moves are an editor's. Not a second `status` role: the filter moves own that one */}
            {!isViewer && (
                <VisuallyHidden aria-live="polite">
                    <span key={announcement.count}>{announcement.text}</span>
                </VisuallyHidden>
            )}
        </DateZoomEditorContext.Provider>
    );
};
