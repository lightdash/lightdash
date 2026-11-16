import { ActionIcon, Box, Menu, Popover, Tooltip } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
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
import MantineIcon from '../../components/common/MantineIcon';
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
import { isNewFilterIn, isPickingNewField } from './editorState';
import { FilterBarMenu } from './FilterBarMenu';
import { EditorPopover } from './FilterEditor';
import classes from './FilterPills.module.css';
import { MENU_TRANSITION } from './menuTransition';
import { getParameterOptions, type ParameterOption } from './parameterOptions';
import { useControlsEditorSelector } from './useControlsEditor';
import { useDateZoomEditorSelector } from './useDateZoomEditor';
import { useIsControlEdited } from './useIsControlEdited';
import { useParameterEditorSelector } from './useParameterEditor';

const noop = () => {};
const ADD_SELECTOR =
    '[data-filter-actions] > button[data-dashboard-filter-control], [data-section-add]';
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
    /** Offers parameters (default true; off in an embed without parameter interactivity). */
    withParameters?: boolean;
    /** Offers "Date zoom" (default true; off in an embed without date zoom). */
    withDateZooms?: boolean;
    section?: {
        id: string;
        name: string;
        isEditorOpen: boolean;
        allowParameters: boolean;
    };
};

// The bar's shipped "Add filter" button, which starts a new filter in the
// editor popover, anchored here until a field is picked. For an editor it
// reads "Add": a choice of Filter, Parameter (when tiles use one) or Date zoom first. An editor's carries the "..." menu (`FilterBarMenu`) in place of the
// shipped eye; a viewer's is the shipped view-mode one, with the reset button. Its popover
// is never given an id to open on, so a click only calls `onPopoverOpen`
export const AddControl: FC<Props> = ({
    triggerClassName,
    unsavedFiltersTooltip,
    withParameters = true,
    withDateZooms = true,
    section,
}) => {
    const openNew = useControlsEditorSelector((c) => c.openNew);
    const canAddFilters = useControlsEditorSelector((c) => c.canAddFilters);
    const isViewer = useControlsEditorSelector((c) => c.isViewer);
    const sectionIds = useDashboardSelector(selectControlSections).map(
        (section) => section.id,
    );
    const isNewOpen = useControlsEditorSelector(
        (c) => isPickingNewField(c) && !isNewFilterIn(c, sectionIds),
    );
    const resetDashboardFilters = useDashboardContext(
        (c) => c.resetDashboardFilters,
    );
    const discard = useControlsEditorSelector((c) => c.discard);
    const addParameterControl = useParameterEditorSelector((c) => c.add);
    const addDateZoom = useDateZoomEditorSelector((c) => c.add);
    // As the shipped "Add date zoom": an editor's, on a dashboard with tiles
    const hasTiles = useDashboardSelector(
        (state) => (selectDashboardTiles(state)?.length ?? 0) > 0,
    );
    const parameterValues = useDashboardSelector(selectParameterValues);
    const parameterControls = useDashboardSelector(selectParameterControls);
    const parameters = useParameterOptions(
        isViewer || !withParameters || section?.allowParameters === false,
    );
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
    const canAddParameter = referencesReady && parameters.length > 0;
    const canAddDateZoom = !isViewer && hasTiles && withDateZooms;
    // Nothing but filters: "Add filter", straight to the field search
    const hasChoice =
        parameterControls !== null && (canAddParameter || canAddDateZoom);
    const backToChoice = useCallback(() => {
        discard();
        setStep('choose');
    }, [discard]);
    if (!canAddFilters && section === undefined) return null;

    const openFilter = () => {
        if (section === undefined) openNew();
        else openNew(section.id);
    };
    const handleAdd = () => {
        if (hasChoice) {
            setStep((current) =>
                current === 'choose' || current === 'parameter'
                    ? 'closed'
                    : 'choose',
            );
        } else openFilter();
    };

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
                ...(section && { sectionId: section.id }),
                label: alreadyControlled ? (definition.label ?? key) : null,
                value: alreadyControlled
                    ? null
                    : (parameterValues[key] ?? null),
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
    const sectionLabel = section
        ? `${hasChoice ? 'Add' : 'Add filter'} to ${section.name}`
        : undefined;
    const addButton = (
        <EditorPopover isOpen={section?.isEditorOpen ?? isNewOpen}>
            {section ? (
                <Tooltip label={sectionLabel}>
                    <ActionIcon
                        size="sm"
                        radius="xl"
                        aria-label={sectionLabel}
                        aria-haspopup={hasChoice ? 'menu' : undefined}
                        aria-expanded={
                            hasChoice ? step === 'choose' : undefined
                        }
                        data-section-add={section.id}
                        onClick={handleAdd}
                    >
                        <MantineIcon icon={IconPlus} size={14} />
                    </ActionIcon>
                </Tooltip>
            ) : (
                <Box>
                    <AddFilterButton
                        isEditMode={!isViewer}
                        triggerClassName={triggerClassName}
                        unsavedFiltersTooltip={unsavedFiltersTooltip}
                        editModeAction={
                            isViewer ? undefined : (
                                <FilterBarMenu withDateZooms={withDateZooms} />
                            )
                        }
                        label={
                            hasChoice ? getUiString('controls.add') : undefined
                        }
                        leadingIcon={<MantineIcon icon={IconPlus} size={14} />}
                        isMenuOpen={hasChoice ? step === 'choose' : undefined}
                        activeTabUuid={undefined}
                        openPopoverId={undefined}
                        onPopoverOpen={handleAdd}
                        onPopoverClose={noop}
                        onSave={noop}
                        onResetDashboardFilters={
                            isViewer ? resetDashboardFilters : noop
                        }
                    />
                </Box>
            )}
        </EditorPopover>
    );
    if (!hasChoice) return <InertWhileEditing>{addButton}</InertWhileEditing>;

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
                                withArrow
                                offset={1}
                                arrowOffset={14}
                                returnFocus={step === 'closed'}
                                transitionProps={MENU_TRANSITION}
                            >
                                <Menu.Target>
                                    <RolelessAnchor>{addButton}</RolelessAnchor>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <AddKindItems
                                        onFilter={() => {
                                            setStep('filter');
                                            openFilter();
                                        }}
                                        onParameter={
                                            canAddParameter
                                                ? () => setStep('parameter')
                                                : null
                                        }
                                        onDateZoom={
                                            canAddDateZoom
                                                ? () => {
                                                      setStep('closed');
                                                      addDateZoom(
                                                          section?.id ?? null,
                                                      );
                                                  }
                                                : null
                                        }
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
