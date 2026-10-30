import {
    interpolateUiString,
    type DashboardFilterRule,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    Popover,
    Select,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconPencil } from '@tabler/icons-react';
import omit from 'lodash/omit';
import {
    useCallback,
    useMemo,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import {
    selectControlSections,
    useDashboardSelector,
} from '../dashboard/store';
import { FieldsAndTiles } from './FieldsAndTiles';
import classes from './FilterEditor.module.css';
import { FilterSettings, type EditorView } from './FilterSettings';
import { useRefocusAfter, type NameExit } from './nameFocus';
import { useRailContractClasses } from './railContractClasses';
import { withFilterRuleLabel } from './sidebarState';
import { useAppliedTileCount } from './useAppliedTileCount';
import { useApplyBlockedReason } from './useApplyBlockedReason';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFilterRuleField } from './useFilterRuleField';
import { useLabelDraft } from './useLabelDraft';

const NO_SECTION = 'none';

// Which section the filter sits in on the bar: it moves at once, never pending
const SectionSelect: FC<{ rule: DashboardFilterRule }> = ({ rule }) => {
    const sections = useDashboardSelector(selectControlSections);
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    const getUiString = useUiStrings();
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
                { value: NO_SECTION, label: 'No section' },
                ...sections.map((section) => ({
                    value: section.id,
                    label:
                        section.name ||
                        getUiString('filters.rail.untitledSection'),
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

// At the top while a pill, Add or a click outside waits on the draft
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
                        data-controls-apply={!isAsking || undefined}
                        disabled={isPlaceholder || applyBlockedReason !== null}
                        onClick={close}
                    >
                        {getUiString('filters.apply')}
                    </Button>
                </Box>
            </Tooltip>
        </Group>
    );
};

// The popover's title: the name as text and, for an editor, a pencil that
// turns it into an input. Blur and Enter commit, Escape reverts
const FilterName: FC<{
    label: ReturnType<typeof useLabelDraft>;
    /** Shown when there is no label: the field's name, as the pill. */
    fallback: string;
    /** The empty input's hint, as the shipped "Filter label" input's. */
    placeholder: string;
    isEditable: boolean;
}> = ({ label, fallback, placeholder, isEditable }) => {
    const [isRenaming, setIsRenaming] = useState(false);
    const { ref: pencilRef, exit } = useRefocusAfter(isRenaming);
    const start = useRef('');
    // Set once naming ends, so a blur as the input unmounts keeps its exit
    const isDone = useRef(false);
    const shown = label.draft.trim() === '' ? fallback : label.draft;
    const finish = (how: NameExit) => {
        if (isDone.current) return;
        isDone.current = true;
        exit.current = how;
        setIsRenaming(false);
    };
    if (!isRenaming)
        return (
            <Group gap={4} wrap="nowrap" className={classes.nameRow}>
                <Text fz="sm" fw={500} truncate className={classes.name}>
                    {shown}
                </Text>
                {isEditable && (
                    <Tooltip fz="xs" label="Rename">
                        <ActionIcon
                            size="sm"
                            aria-label="Rename"
                            ref={pencilRef}
                            onClick={() => {
                                start.current = label.draft;
                                isDone.current = false;
                                setIsRenaming(true);
                            }}
                        >
                            <MantineIcon
                                icon={IconPencil}
                                size={14}
                                strokeWidth={2.25}
                            />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>
        );
    return (
        <TextInput
            aria-label="Name"
            size="xs"
            className={classes.nameRow}
            classNames={{ input: classes.nameInput }}
            // Left empty, the filter goes by its field's name
            placeholder={placeholder}
            data-controls-label
            data-own-escape
            autoFocus
            value={label.draft}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => label.type(event.currentTarget.value)}
            // Synchronous, so a click on Apply keeps the label
            onBlur={(event) => {
                if (isDone.current) return;
                label.flush();
                finish(
                    event.relatedTarget instanceof HTMLElement &&
                        event.relatedTarget !== document.body
                        ? 'elsewhere'
                        : 'pointer',
                );
            }}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    label.flush();
                    finish('keyboard');
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    if (label.draft !== start.current) label.set(start.current);
                    finish('keyboard');
                }
            }}
        />
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
    const isViewer = useControlsSidebarSelector((c) => c.isViewer);
    const updateFilter = useControlsSidebarSelector((c) => c.updateFilter);
    const getUiString = useUiStrings();
    const [view, setView] = useState<EditorView>('value');
    // As the filter was opened: an emptied label goes back to exactly that
    const [hadLabelKey] = useState(() => 'label' in filterRule);
    // Held here, so a trip to Settings and back keeps what was typed
    const label = useLabelDraft(filterRule.label ?? '', (next) =>
        updateFilter(withFilterRuleLabel(filterRule, next, hadLabelKey)),
    );
    const appliedTileCount = useAppliedTileCount(filterRule);
    const applyBlockedReason = useApplyBlockedReason(filterRule);
    // No props, so one element: typing a label does not re-render the list
    const fieldsAndTiles = useMemo(() => <FieldsAndTiles />, []);

    // A dimension or a metric, as the shipped bar resolves it
    const field = useFilterRuleField(filterRule);
    const fieldName =
        field?.label ??
        (filterRule.target.isSqlColumn ? filterRule.target.fieldId : null);
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
                        title={
                            <FilterName
                                label={label}
                                fallback={
                                    fieldName ??
                                    getUiString('filters.rail.filterName')
                                }
                                placeholder={
                                    field
                                        ? `Label for ${field.label}`
                                        : 'Filter label'
                                }
                                isEditable={!isViewer}
                            />
                        }
                        sectionSelect={<SectionSelect rule={filterRule} />}
                    />
                )}
                {/* A new filter shows only its field search until a field is picked */}
                {!(isPlaceholder && isNew) && (
                    <Footer applyBlockedReason={applyBlockedReason} />
                )}
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

// Closing is immediate and opening is the dropdown's own CSS arrival, which
// also plays when the editor moves to a new pill
const NO_TRANSITION = { duration: 0 };

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
    // Mapping stands in for the popover until its Cancel brings it back
    const isMapping = useControlsSidebarSelector((c) => c.isMapping);
    return (
        <Popover
            opened={isOpen && !isMapping}
            position="bottom-start"
            withArrow
            offset={1}
            arrowOffset={14}
            transitionProps={NO_TRANSITION}
            trapFocus
            closeOnEscape={false}
            closeOnClickOutside={false}
            withRoles={false}
        >
            <Popover.Target>{children}</Popover.Target>
            {/* Mounted only while open, so a closing popover draws nothing,
                not even for the frame its transition takes to end */}
            {isOpen && !isMapping && (
                <Popover.Dropdown
                    p={0}
                    // The trap's last resort before its body has mounted
                    tabIndex={-1}
                    data-controls-editor
                    className={
                        contractClasses === null
                            ? classes.dropdown
                            : `${classes.dropdown} ${contractClasses.rail} ${contractClasses.filterDropdown}`
                    }
                >
                    <EditorContent />
                </Popover.Dropdown>
            )}
        </Popover>
    );
};
