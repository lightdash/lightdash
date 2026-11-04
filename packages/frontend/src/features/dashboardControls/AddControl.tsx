import { Box, Menu, Popover } from '@mantine/core';
import {
    forwardRef,
    useCallback,
    useMemo,
    useRef,
    useState,
    type ComponentPropsWithoutRef,
    type FC,
    type ReactNode,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectControlSections,
    selectDashboardParameterDefinitions,
    selectDashboardTiles,
    selectTileQuerySources,
    selectParameterControls,
    selectParameterValues,
    selectTileParameterReferences,
    useDashboardSelector,
} from '../dashboard/store';
import AddFilterButton from '../dashboardFilters/AddFilterButton';
import { AddMenuBackContext } from './addMenuBack';
import { AddKindItems, ParameterPicker } from './ControlPickers';
import { focusStartOnMount } from './editorFocus';
import { FilterBarMenu } from './FilterBarMenu';
import { EditorPopover } from './FilterEditor';
import classes from './FilterPills.module.css';
import { MENU_TRANSITION } from './menuTransition';
import { getParameterOptions, type ParameterOption } from './parameterOptions';
import { isNewFilterIn, isPickingNewField } from './sidebarState';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useIsControlEdited } from './useIsControlEdited';
import { useParameterEditorSelector } from './useParameterEditor';

const noop = () => {};
const ADD_SELECTOR =
    '[data-filter-actions] > button[data-dashboard-filter-control]';
const NO_PARAMETERS: ParameterOption[] = [];

// The menu's anchor, leaving its roles to the Add button inside
const RolelessAnchor = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'>
>(
    (
        {
            'aria-haspopup': _hasPopup,
            'aria-expanded': _expanded,
            'aria-controls': _controls,
            ...props
        },
        ref,
    ) => <div ref={ref} {...props} />,
);

// 'filter': the field search took over, so the menu leaves focus there
type Step = 'closed' | 'choose' | 'filter' | 'parameter';

// One row per parameter a tile uses, for editors; none for viewers, who add
// filters only
const useParameterOptions = (isViewer: boolean): ParameterOption[] => {
    const definitions = useDashboardSelector(
        selectDashboardParameterDefinitions,
    );
    const references = useDashboardSelector(selectTileParameterReferences);
    const allFilterableFields = useDashboardContext(
        (c) => c.allFilterableFields,
    );
    return useMemo(
        () =>
            isViewer
                ? NO_PARAMETERS
                : getParameterOptions({
                      definitions,
                      tileParameterReferences: references,
                      fields: allFilterableFields ?? [],
                  }),
        [isViewer, definitions, references, allFilterableFields],
    );
};

// The bar's controls that would start something else: inert and dimmed while
// a filter or a parameter control is edited, so Apply or Cancel ends that
// first. Pills stay live
export const InertWhileEditing: FC<{ children: ReactNode }> = ({
    children,
}) => {
    const isEditing = useIsControlEdited();
    return (
        <Box
            display="contents"
            className={classes.inert}
            inert={isEditing || undefined}
        >
            {children}
        </Box>
    );
};

type Props = {
    /** An embed's class contract hook on the trigger (default none). */
    triggerClassName?: string;
    /** The viewer bar's tooltip (default: the shipped app wording). */
    unsavedFiltersTooltip?: string;
};

// The bar's shipped "Add filter" button, which starts a new filter in the
// editor popover, anchored here until a field is picked. For an editor whose
// tiles use parameters it reads "Add": a choice of Filter or Parameter first. An editor's carries the "..." menu (`FilterBarMenu`) in place of the
// shipped eye; a viewer's is the shipped view-mode one, with the reset button. Its popover
// is never given an id to open on, so a click only calls `onPopoverOpen`
export const AddControl: FC<Props> = ({
    triggerClassName,
    unsavedFiltersTooltip,
}) => {
    const openNew = useControlsSidebarSelector((c) => c.openNew);
    const canAddFilters = useControlsSidebarSelector((c) => c.canAddFilters);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const sectionIds = useDashboardSelector(selectControlSections).map(
        (section) => section.id,
    );
    const isNewOpen = useControlsSidebarSelector(
        (c) => isPickingNewField(c) && !isNewFilterIn(c, sectionIds),
    );
    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );
    const discard = useControlsSidebarSelector((c) => c.discard);
    const addParameterControl = useParameterEditorSelector((c) => c.add);
    const parameterValues = useDashboardSelector(selectParameterValues);
    const parameterControls = useDashboardSelector(selectParameterControls);
    const parameters = useParameterOptions(isViewer);
    const referencesReady = useDashboardSelector((state) => {
        const tiles = selectDashboardTiles(state);
        return (
            tiles !== undefined &&
            selectTileQuerySources(state).every(
                (source) =>
                    state.parameters.tileListedParameterSources[
                        source.tileUuid
                    ] === JSON.stringify(source),
            )
        );
    });
    const getUiString = useUiStrings();
    const [step, setStep] = useState<Step>('closed');
    const anchorRef = useRef<HTMLDivElement>(null);
    // No tile uses a parameter: "Add filter", straight to the field search
    const hasChoice =
        parameterControls !== null && referencesReady && parameters.length > 0;
    const backToChoice = useCallback(() => {
        discard();
        setStep('choose');
    }, [discard]);
    if (!canAddFilters) return null;

    const pickParameter = (parameter: ParameterOption) => {
        setStep('closed');
        const { key, definition } = parameter;
        if (parameterControls === null) return;
        const alreadyControlled = parameterControls.some((control) =>
            Object.hasOwn(control.parameters, key),
        );
        addParameterControl({
            control: {
                id: uuidv4(),
                label: alreadyControlled ? (definition.label ?? key) : null,
                value: parameterValues[key] ?? null,
                valueType: {
                    type: definition.type ?? 'string',
                    multiple: definition.multiple ?? false,
                },
                parameters: { [key]: alreadyControlled ? { only: [] } : 'all' },
            },
            parameterKeys: [key],
            tileUuids: alreadyControlled ? [] : parameter.tileUuids,
        });
    };
    const addFilterButton = (
        <EditorPopover isOpen={isNewOpen}>
            <Box>
                <AddFilterButton
                    isEditMode={!isViewer}
                    triggerClassName={triggerClassName}
                    unsavedFiltersTooltip={unsavedFiltersTooltip}
                    editModeAction={isViewer ? undefined : <FilterBarMenu />}
                    label={hasChoice ? getUiString('controls.add') : undefined}
                    isMenuOpen={hasChoice ? step === 'choose' : undefined}
                    activeTabUuid={undefined}
                    openPopoverId={undefined}
                    onPopoverOpen={() =>
                        hasChoice
                            ? setStep((current) =>
                                  current === 'choose' ||
                                  current === 'parameter'
                                      ? 'closed'
                                      : 'choose',
                              )
                            : openNew()
                    }
                    onPopoverClose={noop}
                    onSave={noop}
                    onResetDashboardFilters={
                        isViewer ? resetDashboardFilters : noop
                    }
                />
            </Box>
        </EditorPopover>
    );
    if (!hasChoice)
        return <InertWhileEditing>{addFilterButton}</InertWhileEditing>;

    return (
        <InertWhileEditing>
            <AddMenuBackContext.Provider value={backToChoice}>
                <Popover
                    opened={step === 'parameter'}
                    onDismiss={() => {
                        setStep('closed');
                        // Escape leaves focus nowhere once the search has gone
                        setTimeout(() => {
                            if (document.activeElement === document.body)
                                anchorRef.current
                                    ?.querySelector<HTMLElement>(ADD_SELECTOR)
                                    ?.focus();
                        });
                    }}
                    position="bottom-start"
                    withArrow
                    offset={1}
                    arrowOffset={14}
                    trapFocus
                    // The button says it opens a menu, not its wrapper
                    withRoles={false}
                >
                    <Popover.Target>
                        <Box ref={anchorRef}>
                            {/* The button opens it; the target's own toggle only closes */}
                            <Menu
                                opened={step === 'choose'}
                                onChange={(opened) => {
                                    if (!opened)
                                        setStep((current) =>
                                            current === 'choose'
                                                ? 'closed'
                                                : current,
                                        );
                                }}
                                position="bottom-start"
                                width={280}
                                returnFocus={step === 'closed'}
                                transitionProps={MENU_TRANSITION}
                            >
                                <Menu.Target>
                                    <RolelessAnchor>
                                        {addFilterButton}
                                    </RolelessAnchor>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <AddKindItems
                                        onFilter={() => {
                                            setStep('filter');
                                            openNew();
                                        }}
                                        onParameter={() => setStep('parameter')}
                                    />
                                </Menu.Dropdown>
                            </Menu>
                        </Box>
                    </Popover.Target>
                    <Popover.Dropdown w="min(400px, calc(100vw - 56px))">
                        <Box ref={focusStartOnMount}>
                            <ParameterPicker
                                parameters={parameters}
                                onBack={() => setStep('choose')}
                                // In the popover, so a pick is no press outside it
                                withinPortal={false}
                                onPick={pickParameter}
                            />
                        </Box>
                    </Popover.Dropdown>
                </Popover>
            </AddMenuBackContext.Provider>
        </InertWhileEditing>
    );
};
