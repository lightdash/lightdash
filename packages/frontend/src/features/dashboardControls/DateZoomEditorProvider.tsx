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
    withDateZoomControl,
} from './dateZoomControls';
import {
    PARAMETER_PILL_ACTION_SELECTOR,
    PARAMETER_PILL_SELECTOR,
} from './parameterControlsBar';
import {
    DateZoomEditorContext,
    useDateZoomEditorSelector,
    type DateZoomEditorValue,
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
            start({ uuid, isNew: false, snapshot: config, draft: config });
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
        start({ uuid, isNew: true, snapshot: draft, draft });
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

    // Escape: a question is withdrawn, else the edit is cancelled
    const dismiss = useStableCallback(() => {
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

    useEditorDismiss({
        isOpen: edit !== null,
        isFieldClicked: false,
        isAsking,
        isPristineNew: false,
        clearField: noop,
        dismiss,
        dismissOutside: cancel,
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
        ],
    );

    return (
        <DateZoomEditorContext.Provider value={value}>
            {children}
            <DateZoomFocusReturn target={focusReturn} />
        </DateZoomEditorContext.Provider>
    );
};
