import {
    interpolateUiString,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Popover,
    Select,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import omit from 'lodash/omit';
import { useCallback, useMemo, useState, type FC, type ReactNode } from 'react';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectControlSections,
    useDashboardSelector,
} from '../dashboard/store';
import { hasFilterValueSet } from '../dashboardFilters/FilterConfiguration/utils';
import { FieldsAndTiles } from './FieldsAndTiles';
import classes from './FilterEditor.module.css';
import { FilterSettings, type EditorView } from './FilterSettings';
import { usePopoverTransition } from './popoverMotion';
import { useRailContractClasses } from './railContractClasses';
import { isRuleRequired } from './requirements';
import { withFilterRuleLabel } from './sidebarState';
import { useAppliedTileCount } from './useAppliedTileCount';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFilterRuleField } from './useFilterRuleField';
import { useLabelDraft } from './useLabelDraft';

const NO_SECTION = 'none';

// Which section the filter sits in on the bar: it moves at once, never pending
const SectionSelect: FC<{ rule: DashboardFilterRule }> = ({ rule }) => {
    const sections = useDashboardSelector(selectControlSections);
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    if (sections.length === 0) return null;
    const value =
        rule.sectionId !== undefined &&
        sections.some((section) => section.id === rule.sectionId)
            ? rule.sectionId
            : NO_SECTION;
    return (
        <Select
            size="xs"
            label="Section"
            allowDeselect={false}
            data={[
                { value: NO_SECTION, label: 'None' },
                ...sections.map((section) => ({
                    value: section.id,
                    label: section.name || 'Untitled section',
                })),
            ]}
            value={value}
            onChange={(next) => {
                if (next === null || next === value) return;
                updateFilter(
                    next === NO_SECTION
                        ? omit(rule, 'sectionId')
                        : { ...rule, sectionId: next },
                );
            }}
        />
    );
};

// The question takes focus as it appears: Apply, else Discard when Apply
// cannot answer it
const focusAnswerOnMount = (node: HTMLElement | null) => {
    const buttons = [
        ...(node?.querySelectorAll<HTMLButtonElement>('button') ?? []),
    ];
    (
        buttons.find(
            (button) =>
                !button.disabled && button.dataset.controlsApply !== undefined,
        ) ?? buttons[0]
    )?.focus({ preventScroll: true });
};

// At the top while a pill or a click outside waits on the draft
const Prompt: FC<{ name: string; applyBlockedReason: string | null }> = ({
    name,
    applyBlockedReason,
}) => {
    const resolvePending = useControlsSidebarSelector((c) => c.resolvePending);
    const getUiString = useUiStrings();
    return (
        <Group
            justify="space-between"
            wrap="nowrap"
            gap="xs"
            className={classes.prompt}
            ref={focusAnswerOnMount}
        >
            <Text fz="xs" role="status">
                {interpolateUiString(
                    getUiString('filters.rail.applyChangesFirst'),
                    { filter: name },
                )}
            </Text>
            <Group gap="xs" wrap="nowrap" flex="0 0 auto">
                <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => resolvePending(false)}
                >
                    {getUiString('filters.rail.discard')}
                </Button>
                <Button
                    variant="default"
                    size="xs"
                    data-controls-apply
                    disabled={applyBlockedReason !== null}
                    onClick={() => resolvePending(true)}
                >
                    {getUiString('filters.apply')}
                </Button>
            </Group>
        </Group>
    );
};

// Cancel and Apply
const Footer: FC<{ applyBlockedReason: string | null }> = ({
    applyBlockedReason,
}) => {
    const isNew = useControlsSidebarSelector((c) => c.isNew);
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const isAsking = useControlsSidebarSelector((c) => c.isAsking);
    const discard = useControlsSidebarSelector((c) => c.discard);
    const close = useControlsSidebarSelector((c) => c.close);
    const getUiString = useUiStrings();
    return (
        <Group
            justify="flex-end"
            gap="xs"
            wrap="nowrap"
            className={classes.footer}
        >
            <Button variant="default" size="xs" onClick={discard}>
                {getUiString('filters.actions.cancel')}
            </Button>
            <Tooltip
                fz="xs"
                label={applyBlockedReason}
                disabled={applyBlockedReason === null}
            >
                <Box>
                    <Button
                        size="xs"
                        className={classes.apply}
                        data-controls-apply={!isAsking || undefined}
                        disabled={isPlaceholder || applyBlockedReason !== null}
                        onClick={close}
                    >
                        {getUiString(
                            isNew ? 'filters.rail.create' : 'filters.apply',
                        )}
                    </Button>
                </Box>
            </Tooltip>
        </Group>
    );
};

// A new filter starts at its field search. Marked too, for the popover's
// focus trap, which hands focus to `data-autofocus` once it is in place
const focusStartOnMount = (node: HTMLElement | null) => {
    const input = node?.querySelector<HTMLElement>(
        '[data-controls-start] input',
    );
    input?.setAttribute('data-autofocus', '');
    input?.focus({ preventScroll: true });
};

type FilterEditorProps = { rule: DashboardFilterRule };

// Mounted with the filter id as key, so the label draft and the view never
// carry over to another filter
const FilterEditor: FC<FilterEditorProps> = ({ rule: filterRule }) => {
    const isNew = useControlsSidebarSelector((c) => c.isNew);
    const emptiedFieldLabel = useControlsSidebarSelector(
        (c) => c.emptiedFieldLabel,
    );
    const isPlaceholder = useControlsSidebarSelector((c) => c.isPlaceholder);
    const isAsking = useControlsSidebarSelector((c) => c.isAsking);
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const getUiString = useUiStrings();
    const [view, setView] = useState<EditorView>('value');
    // As the filter was opened: an emptied label goes back to exactly that
    const [hadLabelKey] = useState(() => 'label' in filterRule);
    // Held here, not in Settings, so going back keeps what was typed
    const label = useLabelDraft(filterRule.label ?? '', (next) =>
        updateFilter(withFilterRuleLabel(filterRule, next, hadLabelKey)),
    );
    const appliedTileCount = useAppliedTileCount(filterRule);
    // No props, so one element: typing a label does not re-render the list
    const fieldsAndTiles = useMemo(() => <FieldsAndTiles />, []);

    // A dimension or a metric, as the shipped bar resolves it
    const field = useFilterRuleField(filterRule);
    const fieldName =
        field?.label ??
        (filterRule.target.isSqlColumn ? filterRule.target.fieldId : null);
    // An editor's filter keeps a value when required and reaches a tile
    const applyBlockedReason =
        isViewer || isPlaceholder
            ? null
            : isRuleRequired(filterRule) && !hasFilterValueSet(filterRule)
              ? getUiString('filters.config.applyRequiredTooltip')
              : appliedTileCount === 0
                ? getUiString('filters.notAppliedToAnyTiles')
                : null;
    const name =
        isPlaceholder && isNew
            ? getUiString('filters.rail.newFilter')
            : (filterRule.label ??
              (isPlaceholder ? emptiedFieldLabel : fieldName) ??
              getUiString('filters.rail.filterName'));
    const focusOnMount = useCallback(
        (node: HTMLElement | null) => focusStartOnMount(node),
        [],
    );
    return (
        <Box
            className={classes.root}
            role="dialog"
            aria-label={name}
            ref={focusOnMount}
        >
            {isAsking && (
                <Prompt name={name} applyBlockedReason={applyBlockedReason} />
            )}
            {/* While the question is open it is the only live part */}
            <Box
                className={classes.body}
                data-dimmed={isAsking || undefined}
                inert={isAsking || undefined}
            >
                {isPlaceholder ? (
                    <Box className={classes.content}>{fieldsAndTiles}</Box>
                ) : (
                    <FilterSettings
                        rule={filterRule}
                        field={field}
                        onChange={updateFilter}
                        view={view}
                        onViewChange={setView}
                        appliedTileCount={appliedTileCount}
                        nameInput={
                            <TextInput
                                label="Name"
                                size="xs"
                                // Left empty, the filter goes by its field's name
                                placeholder={fieldName ?? 'Filter name'}
                                data-controls-label
                                value={label.draft}
                                onChange={(event) =>
                                    label.type(event.currentTarget.value)
                                }
                                // Synchronous, so a click on Apply keeps the label
                                onBlur={label.flush}
                                onKeyDown={(event) => {
                                    if (event.key !== 'Enter') return;
                                    event.preventDefault();
                                    label.flush();
                                }}
                            />
                        }
                        sectionSelect={<SectionSelect rule={filterRule} />}
                    />
                )}
                <Footer applyBlockedReason={applyBlockedReason} />
            </Box>
        </Box>
    );
};

// The edited filter's body, keyed by its id
const EditorContent: FC = () => {
    const filterId = useControlsSidebarSelector((c) =>
        c.isSidebarOpen ? (c.editing?.filterId ?? null) : null,
    );
    const editingRule = useControlsSidebarSelector((c) => c.editingRule);
    if (filterId === null || editingRule === null) return null;
    return <FilterEditor key={filterId} rule={editingRule} />;
};

type EditorPopoverProps = {
    /** This target's filter is the one edited. */
    isOpen: boolean;
    /** The pill, or "Add filter" for a new filter; must take a ref. */
    children: ReactNode;
};

// The editor as a popover under its pill, placed as the shipped pill's, with
// focus kept inside. The provider owns Escape and clicks outside
// (`useEditorDismiss`), so Mantine's are off, and so are its roles: an
// expanded target reads as an open list. Focus goes back to the pill from
// the provider (`FocusReturn`)
export const EditorPopover: FC<EditorPopoverProps> = ({ isOpen, children }) => {
    const contractClasses = useRailContractClasses();
    const transitionProps = usePopoverTransition();
    return (
        <Popover
            opened={isOpen}
            position="bottom-start"
            withArrow
            offset={1}
            arrowOffset={14}
            transitionProps={transitionProps}
            trapFocus
            closeOnEscape={false}
            closeOnClickOutside={false}
            withRoles={false}
        >
            <Popover.Target>{children}</Popover.Target>
            <Popover.Dropdown
                p={0}
                // The trap's last resort before its body has mounted
                tabIndex={-1}
                data-controls-editor
                className={
                    contractClasses === null
                        ? undefined
                        : `${contractClasses.rail} ${contractClasses.filterDropdown}`
                }
            >
                <EditorContent />
            </Popover.Dropdown>
        </Popover>
    );
};
