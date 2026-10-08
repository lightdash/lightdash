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
import { useId, useRef, useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { ParameterInput } from '../parameters/components/ParameterInput';
import { EditorShell } from './EditorShell';
import classes from './FieldsAndTiles.module.css';
import {
    addControlKey,
    getControlCount,
    getControlTabCounts,
    getControlValue,
    getFreeParameterKeys,
    getKeyCount,
    getParameterKind,
    getParameterLabel,
    removeControlKey,
} from './parameterControls';
import { useControlsSidebar } from './useControlsSidebar';

const LABEL_ERROR = 'Add a label so viewers know what this sets';

export const ParameterSidebar: FC = () => {
    const {
        editingControl,
        isNewControl,
        updateControl,
        removeControl,
        setControlValue,
        activeSection,
        setActiveSection,
        highlightedFieldId,
        setHighlightedFieldId,
        hoveredFieldId,
        setHoveredFieldId,
        discard,
        close,
        isDirty,
    } = useControlsSidebar();
    const [removeArmed, setRemoveArmed] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [labelError, setLabelError] = useState(false);
    const [labelTouched, setLabelTouched] = useState(false);
    const labelInputRef = useRef<HTMLInputElement>(null);
    const labelErrorId = useId();
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

    if (editingControl === null) return null;
    const control = editingControl;

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
    const freeKeys =
        firstDefinition === undefined
            ? []
            : getFreeParameterKeys(
                  getParameterKind(firstDefinition),
                  parameterControls,
                  parameterDefinitions,
                  tileParameterReferences,
              );
    const hasFreeKeys = freeKeys.length > 0;
    const hasLabel = control.label.trim() !== '';
    const needsLabel = isNewControl && !hasLabel;
    const discardLabel = isNewControl
        ? 'Discard control'
        : isDirty
          ? 'Discard changes'
          : null;
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
            title={
                isNewControl
                    ? 'New parameter control'
                    : control.label || 'Parameter control'
            }
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
            footerStatus={
                needsLabel ? 'Add a label to keep this control' : null
            }
            aboveTabs={
                <>
                    <TextInput
                        ref={labelInputRef}
                        label="Control label"
                        withAsterisk
                        required
                        aria-required
                        aria-describedby={labelError ? labelErrorId : undefined}
                        error={labelError ? LABEL_ERROR : undefined}
                        errorProps={{ id: labelErrorId }}
                        placeholder="What viewers will see"
                        value={control.label}
                        onChange={(event) => {
                            if (event.currentTarget.value.trim() !== '') {
                                setLabelError(false);
                            }
                            setLabelTouched(true);
                            updateControl({
                                ...control,
                                label: event.currentTarget.value,
                            });
                        }}
                        onBlur={() => {
                            if (labelTouched && !hasLabel) setLabelError(true);
                        }}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            if (!needsLabel) {
                                close();
                                return;
                            }
                            setLabelError(true);
                            labelInputRef.current?.focus();
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
                                onClick={() => {
                                    setLabelError(false);
                                    updateControl({
                                        ...control,
                                        label: suggestion,
                                    });
                                }}
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
                                    onMouseEnter={() => setHovered(key, true)}
                                    onMouseLeave={() => setHovered(key, false)}
                                >
                                    <UnstyledButton
                                        className={classes.rowMain}
                                        data-highlighted={
                                            isHighlighted || undefined
                                        }
                                        aria-pressed={isHighlighted}
                                        onClick={() =>
                                            setHighlightedFieldId(
                                                isHighlighted ? null : key,
                                            )
                                        }
                                        onFocus={() => setHovered(key, true)}
                                        onBlur={() => setHovered(key, false)}
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
                            <Select
                                className={classes.addFieldSelect}
                                size="sm"
                                searchable
                                clearable={false}
                                autoFocus
                                defaultDropdownOpened
                                placeholder="Search parameters"
                                aria-label="Search parameters"
                                nothingFoundMessage="No parameters match"
                                comboboxProps={{ withinPortal: true }}
                                data={freeKeys.map((key) => ({
                                    value: key,
                                    label: getParameterLabel(
                                        key,
                                        parameterDefinitions,
                                    ),
                                }))}
                                value={null}
                                onChange={(key) => {
                                    if (key === null) return;
                                    updateControl(addControlKey(control, key));
                                    // The new parameter follows the control's value
                                    setParameter(key, value);
                                    setIsAdding(false);
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
