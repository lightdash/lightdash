import { type DashboardParameterControl } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Paper,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconDots, IconPlus } from '@tabler/icons-react';
import { useRef, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { ParameterInput } from '../parameters/components/ParameterInput';
import { EditorShell } from './EditorShell';
import { ShowAllTilesButton } from './FieldRow';
import classes from './FieldsAndTiles.module.css';
import {
    addControlKey,
    getControlCount,
    getControlTabCounts,
    getControlValue,
    getControlFreeParameterKeys,
    getKeyCount,
    getParameterLabel,
    removeControlKey,
} from './parameterControls';
import { useCollapsibleSearch } from './useCollapsibleSearch';
import {
    useControlsSidebar,
    useControlsSidebarSelector,
} from './useControlsSidebar';
import { useFocusLabelOnMount, useLabelDraft } from './useLabelDraft';

type AddParameterSelectProps = {
    options: { value: string; label: string }[];
    onPick: (key: string) => void;
    onDismiss: (byKeyboard: boolean) => void;
};

// Mounted while "Add a parameter" is open, so each opening starts fresh
const AddParameterSelect: FC<AddParameterSelectProps> = ({
    options,
    onPick,
    onDismiss,
}) => {
    const collapsible = useCollapsibleSearch(onDismiss);
    return (
        <Select
            className={classes.addFieldSelect}
            size="sm"
            searchable
            clearable={false}
            {...collapsible}
            // Enter picks the first match
            selectFirstOptionOnChange
            placeholder="Search parameters"
            aria-label="Search parameters"
            nothingFoundMessage="No parameters match"
            comboboxProps={{ withinPortal: true }}
            data={options}
            value={null}
            onChange={(key) => {
                if (key !== null) onPick(key);
            }}
        />
    );
};

type ParameterEditorProps = {
    control: DashboardParameterControl;
};

// Mounted with the control id as key, so the label draft and the armed state
// never carry over to another control, and the label takes focus each time
const ParameterEditor: FC<ParameterEditorProps> = ({ control }) => {
    const {
        isNewControl,
        updateControl,
        removeControl,
        setControlValue,
        activeSection,
        setActiveSection,
        highlightedFieldId,
        setHighlightedFieldId,
        clearHighlightedField,
        hoveredFieldId,
        setHoveredFieldId,
        discard,
        close,
        isDirty,
    } = useControlsSidebar();
    const [removeArmed, setRemoveArmed] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const addButtonRef = useRef<HTMLButtonElement>(null);
    const parameterControls = useDashboardContext((c) => c.parameterControls);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const setParameter = useDashboardContext((c) => c.setParameter);
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const projectUuid = useDashboardContext((c) => c.projectUuid);
    useFocusLabelOnMount();
    const label = useLabelDraft(control.label, (next) =>
        updateControl({ ...control, label: next.trim() ? next : '' }),
    );

    const tiles = dashboardTiles ?? [];
    const { applied } = getControlCount(
        control,
        tiles,
        tileParameterReferences,
    );
    const appliedTabCount = Object.values(
        getControlTabCounts(
            control,
            tiles,
            dashboardTabs,
            tileParameterReferences,
        ),
    ).filter((tab) => tab.applied > 0).length;
    const tabReach =
        dashboardTabs.length > 1
            ? ` on ${appliedTabCount} of ${dashboardTabs.length} tabs`
            : '';
    const keyCount = control.parameterKeys.length;
    const [firstKey] = control.parameterKeys;
    const firstDefinition =
        firstKey === undefined ? undefined : parameterDefinitions[firstKey];
    const value = getControlValue(control, parameterValues) ?? null;
    const freeKeys = getControlFreeParameterKeys(
        control,
        parameterControls,
        parameterDefinitions,
        tileParameterReferences,
    );
    const hasFreeKeys = freeKeys.length > 0;
    const hasLabel = label.draft.trim() !== '';
    const discardLabel = isNewControl
        ? 'Discard control'
        : isDirty
          ? 'Discard changes'
          : null;
    // Left empty, the control takes its first parameter's name
    const suggestion =
        firstKey === undefined
            ? null
            : getParameterLabel(firstKey, parameterDefinitions);

    const clearHighlight = (key: string) => {
        if (highlightedFieldId === key) setHighlightedFieldId(null);
        if (hoveredFieldId === key) setHoveredFieldId(null);
    };
    const setHovered = (key: string, isHovered: boolean) => {
        if (isHovered) setHoveredFieldId(key);
        else if (hoveredFieldId === key) setHoveredFieldId(null);
    };

    return (
        <EditorShell
            title={hasLabel ? label.draft : (suggestion ?? 'Parameter control')}
            subtitle={`${keyCount} ${keyCount === 1 ? 'parameter' : 'parameters'} · sets ${applied} of ${tiles.length} ${tiles.length === 1 ? 'tile' : 'tiles'}${tabReach}`}
            menu={
                isNewControl ? null : (
                    <Menu.Item
                        color="red"
                        onClick={() => {
                            if (!removeArmed) {
                                setRemoveArmed(true);
                                return;
                            }
                            setRemoveArmed(false);
                            removeControl();
                        }}
                    >
                        {removeArmed
                            ? 'Click again to remove'
                            : 'Remove control'}
                    </Menu.Item>
                )
            }
            onMenuClose={() => setRemoveArmed(false)}
            onClose={close}
            discardLabel={discardLabel}
            onDiscard={discard}
            tabs={[
                {
                    value: 'fields',
                    label: 'Parameters and tiles',
                    count: keyCount,
                },
                { value: 'settings', label: 'Settings' },
            ]}
            activeTab={activeSection}
            onTabChange={(next) => {
                if (next === 'fields' || next === 'settings')
                    setActiveSection(next);
            }}
            footerStatus={null}
            aboveTabs={
                <>
                    <TextInput
                        label="Control label"
                        placeholder={suggestion ?? 'What viewers will see'}
                        autoFocus
                        data-controls-label
                        value={label.draft}
                        onChange={(event) =>
                            label.type(event.currentTarget.value)
                        }
                        // Synchronous, so a click on Done closes with the label
                        onBlur={label.flush}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            label.flush();
                        }}
                    />
                    {isNewControl && !hasLabel && suggestion !== null && (
                        <Group gap="xs">
                            <Text fz="xs" c="dimmed">
                                Suggestions
                            </Text>
                            <Button
                                size="compact-xs"
                                variant="default"
                                radius="xl"
                                onClick={() => label.set(suggestion)}
                            >
                                {suggestion}
                            </Button>
                        </Group>
                    )}
                </>
            }
        >
            {activeSection === 'fields' ? (
                <Stack gap="lg">
                    <Stack gap="xs">
                        <Stack gap={2}>
                            <Text fz="sm" fw={600}>
                                Parameters in this control
                            </Text>
                            <Text fz="xs" c="dimmed">
                                Choose which parameter each tile is set by.
                            </Text>
                        </Stack>
                        {control.parameterKeys.map((key) => {
                            const label = getParameterLabel(
                                key,
                                parameterDefinitions,
                            );
                            const count = getKeyCount(
                                control,
                                key,
                                tiles,
                                tileParameterReferences,
                            );
                            const isHighlighted = highlightedFieldId === key;
                            return (
                                <Stack
                                    key={key}
                                    className={
                                        isHighlighted
                                            ? `${classes.row} ${classes.rowHighlighted}`
                                            : classes.row
                                    }
                                    gap={0}
                                    data-keeps-field
                                    onMouseEnter={() => setHovered(key, true)}
                                    onMouseLeave={() => setHovered(key, false)}
                                >
                                    <Group
                                        gap={0}
                                        wrap="nowrap"
                                        align="flex-start"
                                    >
                                        <UnstyledButton
                                            className={classes.rowMain}
                                            data-highlighted={
                                                isHighlighted || undefined
                                            }
                                            aria-pressed={isHighlighted}
                                            onClick={() => {
                                                if (isHighlighted)
                                                    clearHighlightedField();
                                                else setHighlightedFieldId(key);
                                            }}
                                            onFocus={() =>
                                                setHovered(key, true)
                                            }
                                            onBlur={() =>
                                                setHovered(key, false)
                                            }
                                        >
                                            <Text
                                                fz="sm"
                                                fw={600}
                                                truncate
                                                className={classes.rowLabel}
                                            >
                                                {label}
                                            </Text>
                                        </UnstyledButton>
                                        {isHighlighted && (
                                            <ShowAllTilesButton
                                                onClick={clearHighlightedField}
                                            />
                                        )}
                                    </Group>
                                    <Group
                                        className={classes.rowActions}
                                        gap="xs"
                                        justify="space-between"
                                        wrap="nowrap"
                                    >
                                        <Text
                                            key={`${count.applied}/${count.possible}`}
                                            fz="xs"
                                            c="dimmed"
                                            truncate
                                            className={classes.rowCount}
                                        >
                                            {`Parameter · ${count.applied} of ${count.possible} ${count.possible === 1 ? 'tile' : 'tiles'}`}
                                        </Text>
                                        {keyCount > 1 && (
                                            <Menu position="bottom-end">
                                                <Menu.Target>
                                                    <Tooltip label="More">
                                                        <ActionIcon
                                                            size="sm"
                                                            variant="subtle"
                                                            color="gray"
                                                            aria-label={`More actions for ${label}`}
                                                        >
                                                            <MantineIcon
                                                                icon={IconDots}
                                                            />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                </Menu.Target>
                                                <Menu.Dropdown>
                                                    <Menu.Item
                                                        onClick={() => {
                                                            clearHighlight(key);
                                                            updateControl(
                                                                removeControlKey(
                                                                    control,
                                                                    key,
                                                                ),
                                                            );
                                                        }}
                                                    >
                                                        Remove parameter
                                                    </Menu.Item>
                                                </Menu.Dropdown>
                                            </Menu>
                                        )}
                                    </Group>
                                </Stack>
                            );
                        })}
                    </Stack>
                    <Stack gap="xs" align="flex-start">
                        <Tooltip
                            label="Every parameter of this kind is already in a control"
                            disabled={hasFreeKeys}
                        >
                            <Button
                                ref={addButtonRef}
                                variant="light"
                                size="xs"
                                leftSection={<MantineIcon icon={IconPlus} />}
                                onClick={() => {
                                    if (hasFreeKeys)
                                        setIsAdding((open) => !open);
                                }}
                                aria-expanded={isAdding && hasFreeKeys}
                                data-disabled={!hasFreeKeys || undefined}
                                aria-disabled={!hasFreeKeys || undefined}
                            >
                                Add a parameter
                            </Button>
                        </Tooltip>
                        {isAdding && hasFreeKeys && (
                            <AddParameterSelect
                                options={freeKeys.map((key) => ({
                                    value: key,
                                    label: getParameterLabel(
                                        key,
                                        parameterDefinitions,
                                    ),
                                }))}
                                onPick={(key) => {
                                    updateControl(addControlKey(control, key));
                                    // The new parameter follows the control's value
                                    setParameter(key, value);
                                    setIsAdding(false);
                                    addButtonRef.current?.focus();
                                }}
                                onDismiss={(byKeyboard) => {
                                    setIsAdding(false);
                                    if (byKeyboard)
                                        addButtonRef.current?.focus();
                                }}
                            />
                        )}
                    </Stack>
                </Stack>
            ) : (
                <Paper p="md">
                    <Stack gap="sm">
                        <Title order={5}>Default value</Title>
                        {firstKey !== undefined &&
                            firstDefinition !== undefined && (
                                <ParameterInput
                                    paramKey={firstKey}
                                    parameter={firstDefinition}
                                    value={value}
                                    onParameterChange={(_, next) =>
                                        setControlValue(next)
                                    }
                                    projectUuid={projectUuid}
                                />
                            )}
                        {value === null && (
                            <Text fz="xs" c="dimmed">
                                Not set: each tile keeps its own value until a
                                viewer picks one.
                            </Text>
                        )}
                    </Stack>
                </Paper>
            )}
        </EditorShell>
    );
};

export const ParameterSidebar: FC = () => {
    const control = useControlsSidebarSelector((c) => c.editingControl);
    if (control === null) return null;
    return <ParameterEditor key={control.id} control={control} />;
};
