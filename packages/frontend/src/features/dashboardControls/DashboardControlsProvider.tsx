import {
    DimensionType,
    FeatureFlags,
    type DashboardFilterRule,
    type DashboardTile,
    type ParameterValue,
} from '@lightdash/common';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { useParams } from 'react-router';
import { v4 as uuid4 } from 'uuid';
import { useCompactContentHeader } from '../../components/common/Page/useCompactContentHeader';
import useIsEmbedded from '../../ee/providers/Embed/useIsEmbedded';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../providers/Dashboard/useDashboardTileStatusContext';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import {
    DashboardControlsContext,
    type ControlPopoverTab,
    type ControlTab,
    type DashboardControlsContextType,
    type MapsTo,
    type ScrollRequest,
} from './context';
import {
    applyFilterControl,
    applyParameterControl,
    changeControl,
    commitParameterControl,
    getDraftId,
    hasControlChanges,
    isControlMapped,
    startControl,
    withAppliedSettings,
    type ControlDraft,
    type FilterBucket,
    type OpenControl,
    type ParameterControlDraft,
} from './controlDraft';
import {
    getControlTypeForParameter,
    getControlTypeFromItem,
    getControlTypeFromItemType,
    type ControlType,
} from './controlType';
import { isGuardedPress, KEEPS_POPOVER_SELECTOR } from './escape';
import { createFilterDraft } from './filterDraft';
import {
    getDismissAction,
    getGuardDecision,
    getShouldRestartNewControl,
} from './guard';
import {
    getControlLabel,
    addParameterKey,
    getDerivedParameterControls,
    getParameterType,
    hasUnknownParameterReferences,
    mapParameterTiles,
} from './parameterMapping';
import ParameterReferencesLoader from './ParameterReferencesLoader';
import SqlColumnsLoader from './SqlColumnsLoader';
import { getDraftsTemporaryFilters } from './surface';
import { getTileTabUuid } from './tiles';
import { useFilterControlModel } from './useFilterControlModel';
import {
    useParameterControlModel,
    useParameterTiles,
} from './useParameterControlModel';

const NO_TILES: string[] = [];

const createParameterDraft = (
    controlType: ControlType,
): ParameterControlDraft => ({
    kind: 'parameter',
    isNew: true,
    controlType,
    control: { id: uuid4(), label: '', parameterKeys: [], tileTargets: {} },
    value: null,
    extraTileKeys: {},
});

const DashboardControlsProvider: FC<{ children: ReactNode }> = ({
    children,
}) => {
    const { mode } = useParams<{ mode?: string }>();
    const { data: flag } = useServerFeatureFlag(FeatureFlags.DashboardControls);
    const isEnabled = flag?.enabled ?? false;
    const isEditMode = mode === 'edit';
    const isAuthoring = isEnabled && isEditMode;
    const isEmbedded = useIsEmbedded();
    const isCompact = useCompactContentHeader();
    const [controlState, setControl] = useState<OpenControl | null>(null);
    // While viewing, a control is a temporary filter: nothing is saved
    const draftsTemporaryFilters = getDraftsTemporaryFilters({
        isEnabled,
        isEditMode,
        isEmbedded,
        isCompact,
        hasOpenControl: controlState !== null,
    });
    const surface = isAuthoring
        ? 'saved'
        : draftsTemporaryFilters
          ? 'temporary'
          : null;
    const { track } = useTracking();

    const savedControls = useDashboardContext((c) => c.parameterControls);
    const setParameterControls = useDashboardContext(
        (c) => c.setParameterControls,
    );
    const savedParameters = useDashboardContext((c) => c.dashboard?.parameters);
    const pinnedParameters = useDashboardContext((c) => c.pinnedParameters);
    const definitions = useDashboardContext((c) => c.parameterDefinitions);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const setParameter = useDashboardContext((c) => c.setParameter);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const setDashboardFilters = useDashboardContext(
        (c) => c.setDashboardFilters,
    );
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const setDashboardTemporaryFilters = useDashboardContext(
        (c) => c.setDashboardTemporaryFilters,
    );
    // The filters a filter control is read from and applied to
    const controlFilters = draftsTemporaryFilters
        ? dashboardTemporaryFilters
        : dashboardFilters;
    const setHaveFiltersChanged = useDashboardContext(
        (c) => c.setHaveFiltersChanged,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const sqlChartTilesMetadata = useDashboardTileStatusContext(
        (c) => c.sqlChartTilesMetadata,
    );
    const parameterTiles = useParameterTiles();

    // Whether a new control's first step was answered: it is asked once
    const [isAnswered, setIsAnswered] = useState(false);
    // The draft "Apply or cancel first" was said about: any change ends it
    const [guardNoticeDraft, setGuardNoticeDraft] =
        useState<ControlDraft | null>(null);
    // The pill to put the focus back on after "Apply"
    const [pillFocusRequest, setPillFocusRequest] = useState<{
        id: string;
    } | null>(null);
    const [hoveredTileUuids, setHoveredTileUuids] =
        useState<string[]>(NO_TILES);
    // Shown tiles and previews belong to the open control
    const [shown, setShown] = useState<{
        id: string;
        itemId: string;
        // The line as the popover names it
        name: string;
        tileUuids: string[];
    } | null>(null);
    const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(
        null,
    );
    const takenScrollRequest = useRef<ScrollRequest | null>(null);
    const [preview, setPreview] = useState<{
        id: string;
        tileUuids: string[];
    } | null>(null);
    const [isPopoverOpenState, setIsPopoverOpen] = useState(false);
    const [isSubPopoverOpen, setIsSubPopoverOpen] = useState(false);
    const [popoverTab, setPopoverTab] = useState<ControlPopoverTab>('settings');
    const [areReferencesRequested, setAreReferencesRequested] = useState(false);
    const requestParameterReferences = useCallback(
        () => setAreReferencesRequested(true),
        [],
    );

    // Leaving or entering edit mode drops the open control and its draft
    const [lastSurface, setLastSurface] = useState(surface);
    if (lastSurface !== surface) {
        setLastSurface(surface);
        setControl(null);
        setAreReferencesRequested(false);
        setHoveredTileUuids(NO_TILES);
        setShown(null);
        setScrollRequest(null);
        setPreview(null);
    }

    const parameterControls = useMemo(
        () =>
            savedControls ??
            (isEnabled
                ? getDerivedParameterControls({
                      savedValueKeys: Object.keys(savedParameters ?? {}),
                      pinnedKeys: pinnedParameters,
                      definitions,
                  })
                : []),
        [
            savedControls,
            isEnabled,
            savedParameters,
            pinnedParameters,
            definitions,
        ],
    );
    // The open control's draft. An existing control that left the dashboard
    // (removed, or dropped with the dashboard's edits) is closed with it.
    const control = useMemo<OpenControl | null>(() => {
        if (surface === null || !controlState) return null;
        const { draft: current } = controlState;
        if (current.isNew) return controlState;
        const id = getDraftId(current);
        const isOnDashboard =
            current.kind === 'filter'
                ? [
                      ...controlFilters.dimensions,
                      ...controlFilters.metrics,
                  ].some((rule) => rule.id === id)
                : parameterControls.some((item) => item.id === id);
        return isOnDashboard ? controlState : null;
    }, [surface, controlState, controlFilters, parameterControls]);
    const draft = control?.draft ?? null;
    const draftId = draft ? getDraftId(draft) : null;
    // Mapped from a tile's own picker counts as an answer too
    if (draft?.isNew && !isAnswered && isControlMapped(draft)) {
        setIsAnswered(true);
    }
    // A new control with nothing chosen yet: its first step asks what it
    // filters by. It is a filter draft with no field until a parameter is
    // chosen. Once answered it stays on its tabs, whatever is removed.
    const isChoosing =
        draft !== null && draft.isNew && !isAnswered && !isControlMapped(draft);
    const choiceType =
        isAuthoring && isChoosing && draft.kind === 'filter'
            ? draft.controlType
            : null;
    // Stands in for the parameter control the first step could start
    const choiceParameterDraft = useMemo(
        () => (choiceType === null ? null : createParameterDraft(choiceType)),
        [choiceType],
    );
    const hasChanges = control !== null && hasControlChanges(control);

    const previewTileUuids =
        draftId !== null && preview?.id === draftId
            ? preview.tileUuids
            : NO_TILES;
    const togglePreview = useCallback(
        (tileUuid: string) => {
            if (draftId === null) return;
            setPreview({
                id: draftId,
                tileUuids: previewTileUuids.includes(tileUuid)
                    ? previewTileUuids.filter((uuid) => uuid !== tileUuid)
                    : [...previewTileUuids, tileUuid],
            });
        },
        [draftId, previewTileUuids],
    );

    const tabs = useMemo<ControlTab[]>(
        () =>
            [...dashboardTabs]
                .sort((a, b) => a.order - b.order)
                .map(({ uuid, name }) => ({ uuid, name })),
        [dashboardTabs],
    );
    const getTabUuid = useCallback(
        (tile: DashboardTile) =>
            getTileTabUuid(
                tile,
                tabs.map((tab) => tab.uuid),
            ),
        [tabs],
    );

    // Opens a control on a draft of it with its popover showing, or closes
    // the open one and drops its draft
    const open = useCallback(
        (next: OpenControl | null, tab: ControlPopoverTab = 'settings') => {
            setControl(next);
            setIsAnswered(false);
            setGuardNoticeDraft(null);
            setIsPopoverOpen(next !== null);
            setPopoverTab(tab);
            setPreview(null);
            setIsSubPopoverOpen(false);
            setAreReferencesRequested(false);
            setHoveredTileUuids(NO_TILES);
            setShown(null);
            setScrollRequest(null);
        },
        [],
    );

    const close = useCallback(() => open(null), [open]);

    // The popover shrinks to its footer: the control stays open, with its draft
    const hidePopover = useCallback(() => {
        setIsPopoverOpen(false);
        setIsSubPopoverOpen(false);
    }, []);
    const showPopover = useCallback(() => setIsPopoverOpen(true), []);
    // A press on a dashboard tab is not a press outside the popover: it
    // stays as it was. The flag is read by the dismissal that
    // the same press triggers, then cleared.
    const isPressKeepingPopover = useRef(false);
    const hasChangesRef = useRef(false);
    useEffect(() => {
        hasChangesRef.current = hasChanges;
    }, [hasChanges]);
    useEffect(() => {
        const handlePress = (event: Event) => {
            const target =
                event.target instanceof Element ? event.target : null;
            isPressKeepingPopover.current =
                target !== null &&
                target.closest(KEEPS_POPOVER_SELECTOR) !== null;
            window.setTimeout(() => {
                isPressKeepingPopover.current = false;
            }, 0);
            // With changes in the draft, a press on another pill or on "Add
            // control" is held by its click: until then nothing may see the
            // press, so the popover, an open picker and the focus stay put
            if (
                hasChangesRef.current &&
                target !== null &&
                isGuardedPress(target)
            ) {
                event.stopPropagation();
                if (event.type === 'mousedown') event.preventDefault();
            }
        };
        document.addEventListener('mousedown', handlePress, true);
        document.addEventListener('touchstart', handlePress, true);
        return () => {
            document.removeEventListener('mousedown', handlePress, true);
            document.removeEventListener('touchstart', handlePress, true);
        };
    }, []);
    // The pill's own click: open or shrunk, except that a new control nobody
    // answered has nothing to shrink to and goes away
    const togglePopover = useCallback(() => {
        if (
            isPopoverOpenState &&
            getDismissAction({ isChoosing, hasChanges }) === 'cancel'
        ) {
            close();
            return;
        }
        setIsPopoverOpen((isOpen) => !isOpen);
        setIsSubPopoverOpen(false);
    }, [isPopoverOpenState, isChoosing, hasChanges, close]);
    const dismissPopover = useCallback(() => {
        if (isPressKeepingPopover.current) return;
        if (getDismissAction({ isChoosing, hasChanges }) === 'cancel') {
            close();
        } else {
            hidePopover();
        }
    }, [isChoosing, hasChanges, close, hidePopover]);

    // With changes in the draft nothing else opens: the popover comes back
    // instead, so "Cancel" and "Apply" are in view, and says why
    const holdOpenControl = useCallback(() => {
        const decision = getGuardDecision({
            hasOpenControl: draft !== null,
            hasChanges,
        });
        if (decision !== 'hold') return false;
        setIsPopoverOpen(true);
        setGuardNoticeDraft(draft);
        return true;
    }, [draft, hasChanges]);
    const clearGuardNotice = useCallback(() => setGuardNoticeDraft(null), []);
    // Dropdowns inside the popover report in, so their clicks are not taken
    // for clicks outside it
    const subPopoverProps = useMemo(
        () => ({
            onOpen: () => setIsSubPopoverOpen(true),
            onClose: () => setIsSubPopoverOpen(false),
        }),
        [],
    );

    // A new control starts where its first step is: choosing what it
    // applies through
    const openNew = useCallback(
        (controlType: ControlType) => {
            if (surface === null || holdOpenControl()) return;
            open(startControl(createFilterDraft(controlType)), 'mapsTo');
        },
        [surface, holdOpenControl, open],
    );

    const getBucket = useCallback(
        (rule: DashboardFilterRule): FilterBucket =>
            allFilterableMetricsMap[rule.target.fieldId] !== undefined &&
            allFilterableFieldsMap[rule.target.fieldId] === undefined
                ? 'metrics'
                : 'dimensions',
        [allFilterableFieldsMap, allFilterableMetricsMap],
    );

    const toggleFilter = useCallback(
        (filterId: string) => {
            if (draft && !draft.isNew && draftId === filterId) {
                togglePopover();
                return;
            }
            if (surface === null || holdOpenControl()) return;
            const dimensionRule = controlFilters.dimensions.find(
                (rule) => rule.id === filterId,
            );
            const rule =
                dimensionRule ??
                controlFilters.metrics.find((r) => r.id === filterId);
            if (!rule) return;
            const field = dimensionRule
                ? allFilterableFieldsMap[rule.target.fieldId]
                : allFilterableMetricsMap[rule.target.fieldId];
            const column = Object.values(sqlChartTilesMetadata)
                .flatMap((metadata) => metadata.columns)
                .find(({ reference }) => reference === rule.target.fieldId);
            open(
                startControl({
                    kind: 'filter',
                    isNew: false,
                    // Its own field's exact type: a date or a time control
                    controlType: field
                        ? getControlTypeFromItem(field)
                        : getControlTypeFromItemType(
                              column?.type ??
                                  rule.target.fallbackType ??
                                  DimensionType.STRING,
                          ),
                    rule,
                }),
            );
        },
        [
            draft,
            draftId,
            togglePopover,
            surface,
            holdOpenControl,
            open,
            controlFilters,
            allFilterableFieldsMap,
            allFilterableMetricsMap,
            sqlChartTilesMetadata,
        ],
    );

    const toggleParameter = useCallback(
        (controlId: string) => {
            if (draft && !draft.isNew && draftId === controlId) {
                togglePopover();
                return;
            }
            if (!isAuthoring || holdOpenControl()) return;
            const existing = parameterControls.find((c) => c.id === controlId);
            if (!existing) return;
            const firstKey = existing.parameterKeys[0];
            open(
                startControl({
                    kind: 'parameter',
                    isNew: false,
                    controlType: getControlTypeForParameter(
                        getParameterType(definitions[firstKey]),
                    ),
                    control: existing,
                    value:
                        firstKey !== undefined
                            ? (parameterValues[firstKey] ?? null)
                            : null,
                    extraTileKeys: {},
                }),
            );
        },
        [
            draft,
            draftId,
            togglePopover,
            isAuthoring,
            holdOpenControl,
            open,
            parameterControls,
            definitions,
            parameterValues,
        ],
    );

    // A change to what the control applies to drops the shown tiles
    const clearShownTiles = useCallback(() => {
        setShown(null);
        setScrollRequest(null);
    }, []);

    // Every change stays in the draft until "Apply"
    const updateRule = useCallback(
        (updater: (rule: DashboardFilterRule) => DashboardFilterRule) => {
            setControl((current) =>
                current?.draft.kind === 'filter'
                    ? changeControl(current, {
                          ...current.draft,
                          rule: updater(current.draft.rule),
                      })
                    : current,
            );
            clearShownTiles();
        },
        [clearShownTiles],
    );

    const updateParameterDraft = useCallback(
        (updater: (draft: ParameterControlDraft) => ParameterControlDraft) => {
            setControl((current) =>
                current?.draft.kind === 'parameter'
                    ? changeControl(current, updater(current.draft))
                    : current,
            );
            clearShownTiles();
        },
        [clearShownTiles],
    );

    // A tile's "Add control": a draft of a new parameter control with that
    // one tile in it
    const openForTileParameter = useCallback(
        (tileUuid: string, key: string) => {
            if (!isAuthoring || holdOpenControl()) return;
            if (hasUnknownParameterReferences(parameterTiles)) return;
            // A missing parameter is not among the tile's reported references
            const tiles = parameterTiles.map((tile) =>
                tile.tileUuid === tileUuid &&
                tile.parameterKeys !== null &&
                !tile.parameterKeys.includes(key)
                    ? { ...tile, parameterKeys: [...tile.parameterKeys, key] }
                    : tile,
            );
            const empty = createParameterDraft(
                getControlTypeForParameter(getParameterType(definitions[key])),
            );
            open(
                {
                    base: empty,
                    draft: {
                        ...empty,
                        control: mapParameterTiles(
                            {
                                ...empty.control,
                                label: definitions[key]?.label || key,
                            },
                            [tileUuid],
                            key,
                            tiles,
                        ),
                        value: parameterValues[key] ?? null,
                        extraTileKeys: { [tileUuid]: [key] },
                    },
                },
                'mapsTo',
            );
        },
        [
            isAuthoring,
            holdOpenControl,
            parameterTiles,
            definitions,
            parameterValues,
            open,
        ],
    );

    // The settings tab writes the draft too, without touching what the tiles
    // tab decides
    const setLabel = useCallback(
        (label: string) =>
            setControl((current) => {
                if (!current) return current;
                const { draft: now } = current;
                return changeControl(
                    current,
                    now.kind === 'filter'
                        ? {
                              ...now,
                              rule: { ...now.rule, label: label || undefined },
                          }
                        : { ...now, control: { ...now.control, label } },
                );
            }),
        [],
    );
    const setFilterSettings = useCallback(
        (settings: DashboardFilterRule) =>
            setControl((current) =>
                current?.draft.kind === 'filter'
                    ? changeControl(current, {
                          ...current.draft,
                          rule: withAppliedSettings(
                              current.draft.rule,
                              settings,
                          ),
                      })
                    : current,
            ),
        [],
    );
    const setParameterValue = useCallback(
        (value: ParameterValue | null) =>
            setControl((current) =>
                current?.draft.kind === 'parameter'
                    ? changeControl(current, { ...current.draft, value })
                    : current,
            ),
        [],
    );

    const filterModel = useFilterControlModel(
        draft?.kind === 'filter' ? draft : null,
        updateRule,
        getTabUuid,
    );
    const parameterModel = useParameterControlModel(
        draft?.kind === 'parameter' ? draft : choiceParameterDraft,
        updateParameterDraft,
        parameterControls,
        getTabUuid,
    );
    const model = filterModel ?? parameterModel;
    const choiceParameterModel =
        choiceParameterDraft !== null ? parameterModel : null;

    // The first step's answer: the control becomes a filter or a parameter
    // control by what was chosen, on every tile that has it
    const pendingChoiceFocus = useRef<'value' | 'tab' | null>(null);
    const addFilterItem = filterModel?.addItem;
    const choose = useCallback(
        (kind: MapsTo, id: string) => {
            if (!isChoosing) return;
            if (kind === 'filter') {
                addFilterItem?.(id);
            } else {
                if (!isAuthoring) return;
                setControl((current) => {
                    if (!current?.draft.isNew) return current;
                    const empty = createParameterDraft(
                        current.draft.controlType,
                    );
                    return {
                        base: empty,
                        draft: {
                            ...empty,
                            control: addParameterKey(
                                {
                                    ...empty.control,
                                    label: definitions[id]?.label || id,
                                },
                                id,
                                parameterTiles,
                            ),
                            value: parameterValues[id] ?? null,
                        },
                    };
                });
                clearShownTiles();
            }
            setIsAnswered(true);
            // A temporary filter needs its value next; a saved control its tiles
            setPopoverTab(draftsTemporaryFilters ? 'settings' : 'mapsTo');
            pendingChoiceFocus.current = draftsTemporaryFilters
                ? 'value'
                : 'tab';
        },
        [
            isChoosing,
            isAuthoring,
            addFilterItem,
            definitions,
            parameterTiles,
            parameterValues,
            clearShownTiles,
            draftsTemporaryFilters,
        ],
    );
    const takeChoiceFocus = useCallback(() => {
        const pending = pendingChoiceFocus.current;
        pendingChoiceFocus.current = null;
        return pending;
    }, []);

    // A new control that lost everything it applied through starts over:
    // the question is asked again and it can be either kind
    if (
        draft !== null &&
        model !== null &&
        getShouldRestartNewControl({
            isNew: draft.isNew,
            isAnswered,
            isLoading: model.isLoading,
            isMapped: isControlMapped(draft),
            mappedCount: model.overview.mappedCount,
        })
    ) {
        setControl(startControl(createFilterDraft(draft.controlType)));
        setIsAnswered(false);
        setGuardNoticeDraft(null);
        clearShownTiles();
    }

    // "Apply": the whole draft reaches the dashboard's unsaved edit state in
    // one step and the control closes. While viewing it joins the temporary
    // filters instead, as a filter added from today's popover does.
    const appliesToNoTiles =
        model === null || model.isLoading || model.overview.mappedCount === 0;
    const apply = useCallback(() => {
        if (!control || !isControlMapped(control.draft)) return;
        if (appliesToNoTiles) return;
        const { draft: applied, base } = control;
        if (applied.kind === 'filter') {
            const bucket = getBucket(applied.rule);
            const setFilters = draftsTemporaryFilters
                ? setDashboardTemporaryFilters
                : setDashboardFilters;
            setFilters((filters) =>
                applyFilterControl(
                    filters,
                    applied,
                    base.kind === 'filter' ? base : applied,
                    bucket,
                ),
            );
            setHaveFiltersChanged(true);
            if (draftsTemporaryFilters && applied.isNew) {
                track({
                    name: EventName.ADD_FILTER_CLICKED,
                    properties: { mode: 'viewer' },
                });
            }
        } else if (isAuthoring) {
            const { controls, writes } = applyParameterControl(
                parameterControls,
                applied,
                getControlLabel(applied.control, definitions),
            );
            writes.forEach(({ key, value }) => setParameter(key, value));
            setParameterControls(controls);
        }
        close();
        setPillFocusRequest({ id: getDraftId(applied) });
    }, [
        control,
        appliesToNoTiles,
        getBucket,
        isAuthoring,
        draftsTemporaryFilters,
        setDashboardTemporaryFilters,
        track,
        setDashboardFilters,
        setHaveFiltersChanged,
        parameterControls,
        definitions,
        setParameter,
        setParameterControls,
        close,
    ]);

    const removeParameterControl = useCallback(
        (controlId: string) => {
            const control = parameterControls.find((c) => c.id === controlId);
            // Its parameters go back to resolving as they do with no control
            control?.parameterKeys.forEach((key) => setParameter(key, null));
            setParameterControls(
                parameterControls.filter((c) => c.id !== controlId),
            );
            if (draftId === controlId) close();
        },
        [parameterControls, setParameter, setParameterControls, draftId, close],
    );

    const mapTileToParameterControl = useCallback(
        (controlId: string, tileUuid: string, key: string) => {
            const control = parameterControls.find((c) => c.id === controlId);
            if (!control || hasUnknownParameterReferences(parameterTiles)) {
                return;
            }
            const tiles = parameterTiles.map((tile) =>
                tile.tileUuid === tileUuid &&
                tile.parameterKeys !== null &&
                !tile.parameterKeys.includes(key)
                    ? { ...tile, parameterKeys: [...tile.parameterKeys, key] }
                    : tile,
            );
            setParameterControls(
                commitParameterControl(
                    parameterControls,
                    mapParameterTiles(control, [tileUuid], key, tiles),
                ),
            );
            setParameter(
                key,
                parameterValues[control.parameterKeys[0]] ?? null,
            );
            setAreReferencesRequested(false);
            // The control is no longer what an open draft of it started from
            if (draftId === controlId) close();
        },
        [
            parameterControls,
            parameterTiles,
            parameterValues,
            setParameterControls,
            setParameter,
            draftId,
            close,
        ],
    );

    // After "Apply" the focus goes to the control's pill, as after "Cancel"
    useEffect(() => {
        if (pillFocusRequest === null) return;
        document
            .querySelector<HTMLElement>(
                `[data-control-id="${CSS.escape(pillFocusRequest.id)}"]`,
            )
            ?.focus();
    }, [pillFocusRequest]);

    const hoverTiles = useCallback(
        (tileUuids: string[]) =>
            setHoveredTileUuids(tileUuids.length > 0 ? tileUuids : NO_TILES),
        [],
    );
    // A clicked tile count shows its tiles, on every dashboard tab, until it
    // is clicked again; one of them is scrolled to, once
    const showTiles = useCallback(
        (
            itemId: string,
            name: string,
            tileUuids: string[],
            scrollToTileUuid: string,
        ) => {
            if (draftId === null) return;
            setShown({ id: draftId, itemId, name, tileUuids });
            setScrollRequest({ tileUuid: scrollToTileUuid });
        },
        [draftId],
    );
    const takeScrollRequest = useCallback((request: ScrollRequest) => {
        if (takenScrollRequest.current === request) return false;
        takenScrollRequest.current = request;
        return true;
    }, []);
    const isShown = draftId !== null && shown?.id === draftId;
    const shownItemId = isShown ? shown.itemId : null;
    const shownItemName = isShown ? shown.name : null;
    const shownTileUuids = isShown ? shown.tileUuids : NO_TILES;
    // Shown tiles stay outlined while others are hovered: the page can move
    // under a still pointer and fire a hover the author never made
    const highlightedTileUuids = useMemo(
        () =>
            draft === null
                ? NO_TILES
                : [...new Set([...shownTileUuids, ...hoveredTileUuids])],
        [draft, shownTileUuids, hoveredTileUuids],
    );

    const value = useMemo<DashboardControlsContextType>(
        () => ({
            isEnabled,
            isEditMode,
            draftsTemporaryFilters,
            draft,
            model,
            selectedId: draft && !draft.isNew ? getDraftId(draft) : null,
            tabs,
            isChoosing,
            choiceParameterModel,
            choose,
            takeChoiceFocus,
            openNew,
            isPopoverOpen: draft !== null && isPopoverOpenState,
            isGuardNoticeShown:
                guardNoticeDraft !== null && guardNoticeDraft === draft,
            clearGuardNotice,
            isSubPopoverOpen,
            subPopoverProps,
            popoverTab,
            setPopoverTab,
            hidePopover,
            showPopover,
            dismissPopover,
            togglePopover,
            holdOpenControl,
            toggleFilter,
            toggleParameter,
            openForTileParameter,
            hasChanges,
            setLabel,
            setFilterSettings,
            setParameterValue,
            apply,
            cancel: close,
            parameterControls,
            removeParameterControl,
            mapTileToParameterControl,
            previewTileUuids,
            togglePreview,
            highlightedTileUuids,
            shownItemId,
            shownItemName,
            shownTileUuids,
            showTiles,
            clearShownTiles,
            scrollRequest,
            takeScrollRequest,
            hoverTiles,
            requestParameterReferences,
        }),
        [
            isEnabled,
            isEditMode,
            draftsTemporaryFilters,
            draft,
            model,
            tabs,
            isChoosing,
            choiceParameterModel,
            choose,
            takeChoiceFocus,
            openNew,
            isPopoverOpenState,
            guardNoticeDraft,
            clearGuardNotice,
            isSubPopoverOpen,
            subPopoverProps,
            popoverTab,
            hidePopover,
            showPopover,
            dismissPopover,
            togglePopover,
            holdOpenControl,
            toggleFilter,
            toggleParameter,
            openForTileParameter,
            hasChanges,
            setLabel,
            setFilterSettings,
            setParameterValue,
            apply,
            close,
            parameterControls,
            removeParameterControl,
            mapTileToParameterControl,
            previewTileUuids,
            togglePreview,
            highlightedTileUuids,
            shownItemId,
            shownItemName,
            shownTileUuids,
            showTiles,
            clearShownTiles,
            scrollRequest,
            takeScrollRequest,
            hoverTiles,
            requestParameterReferences,
        ],
    );

    return (
        <DashboardControlsContext.Provider value={value}>
            {isAuthoring &&
                (draft?.kind === 'parameter' ||
                    choiceParameterDraft !== null ||
                    areReferencesRequested) && <ParameterReferencesLoader />}
            {draft?.kind === 'filter' && <SqlColumnsLoader />}
            {children}
        </DashboardControlsContext.Provider>
    );
};

export default DashboardControlsProvider;
