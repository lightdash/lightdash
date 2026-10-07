import {
    Button,
    Menu,
    Paper,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { ParameterInput } from '../parameters/components/ParameterInput';
import { ControlInteractivity } from './ControlInteractivity';
import { EditorShell } from './EditorShell';
import { FieldRow } from './FieldRow';
import classes from './FieldsAndCharts.module.css';
import {
    applyKeyToAll,
    clearKeyFromAll,
    getControlCount,
    getControlTabCounts,
    getFreeParameterKeys,
    getKeyCount,
    getParameterLabel,
    removeKey,
    type ParameterKind,
} from './parameterControls';
import { useFilterSidebar } from './useFilterSidebar';

export const ParameterSidebar: FC = () => {
    const {
        parameterControls,
        editingControlId,
        updateControl,
        removeControl,
        setControlValue,
        closeControl,
        cancelControl,
        highlightedFieldId,
        setHighlightedFieldId,
        setHoveredFieldId,
    } = useFilterSidebar();
    const [section, setSection] = useState('interactivity');
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [labelTouched, setLabelTouched] = useState(false);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardTabs = useDashboardContext((c) => c.dashboardTabs);
    const projectUuid = useDashboardContext((c) => c.projectUuid);

    const control = parameterControls.find((c) => c.id === editingControlId);
    if (!control) return null;

    const tiles = dashboardTiles ?? [];
    const count = getControlCount(control, tiles, tileParameterReferences);
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
    const value = firstKey === undefined ? null : parameterValues[firstKey];
    const freeKeys = getFreeParameterKeys(
        control.kind as ParameterKind,
        parameterControls,
        parameterDefinitions,
        tileParameterReferences,
    );
    const isNew = !labelTouched && control.label === '';
    const hasLabel = control.label.trim() !== '';
    const setControlTargets = (
        next: Pick<typeof control, 'tileTargets' | 'parameterKeys'>,
    ) =>
        updateControl(control.id, {
            tileTargets: next.tileTargets,
            parameterKeys: next.parameterKeys,
        });

    return (
        <EditorShell
            title={control.label || 'New parameter control'}
            subtitle={`${keyCount} ${keyCount === 1 ? 'parameter' : 'parameters'} · sets ${count.applied} of ${count.possible} ${count.possible === 1 ? 'chart' : 'charts'}${tabReach}`}
            onBack={isNew ? cancelControl : undefined}
            menu={
                isNew ? null : (
                    <Menu.Item
                        color="red"
                        closeMenuOnClick={confirmRemove}
                        onClick={() =>
                            confirmRemove
                                ? removeControl(control.id)
                                : setConfirmRemove(true)
                        }
                    >
                        {confirmRemove
                            ? 'Click again to remove'
                            : 'Remove control'}
                    </Menu.Item>
                )
            }
            onMenuClose={() => setConfirmRemove(false)}
            onCancel={cancelControl}
            tabs={[
                { value: 'interactivity', label: 'Interactivity' },
                {
                    value: 'charts',
                    label: 'Parameters and charts',
                    count: keyCount,
                },
            ]}
            activeTab={section}
            onTabChange={setSection}
            footerStatus={hasLabel ? null : 'Add a label to apply'}
            primaryLabel="Apply"
            primaryDisabled={!hasLabel}
            primaryTooltip="Add a label to apply"
            onPrimary={closeControl}
            aboveTabs={
                <TextInput
                    label="Control label"
                    withAsterisk
                    required
                    placeholder="What viewers will see"
                    value={control.label}
                    onChange={(e) => {
                        setLabelTouched(true);
                        updateControl(control.id, { label: e.target.value });
                    }}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        if (hasLabel) closeControl();
                    }}
                />
            }
        >
            {section === 'charts' ? (
                <Stack gap="lg">
                    <Stack gap="xs">
                        <Stack gap={2}>
                            <Text fz="sm" fw={600}>
                                Parameters in this control
                            </Text>
                            <Text fz="xs" c="dimmed">
                                Choose which parameter each chart is set by.
                            </Text>
                        </Stack>
                        {control.parameterKeys.map((key) => {
                            const keyCountFor = getKeyCount(
                                control,
                                key,
                                tiles,
                                tileParameterReferences,
                            );
                            return (
                                <FieldRow
                                    key={key}
                                    field={null}
                                    label={getParameterLabel(
                                        key,
                                        parameterDefinitions,
                                    )}
                                    tableLabel="Parameter"
                                    count={keyCountFor}
                                    isWaiting={false}
                                    isHighlighted={highlightedFieldId === key}
                                    isNotSaved={keyCountFor.applied === 0}
                                    onToggleHighlight={() =>
                                        setHighlightedFieldId(
                                            highlightedFieldId === key
                                                ? null
                                                : key,
                                        )
                                    }
                                    onHoverChange={(isHovered) =>
                                        setHoveredFieldId(
                                            isHovered ? key : null,
                                        )
                                    }
                                    onAll={() =>
                                        setControlTargets(
                                            applyKeyToAll(
                                                control,
                                                key,
                                                tiles,
                                                tileParameterReferences,
                                            ),
                                        )
                                    }
                                    onNone={() =>
                                        setControlTargets(
                                            clearKeyFromAll(
                                                control,
                                                key,
                                                tiles,
                                                tileParameterReferences,
                                            ),
                                        )
                                    }
                                    onRemove={
                                        keyCount === 1
                                            ? null
                                            : () =>
                                                  setControlTargets(
                                                      removeKey(
                                                          control,
                                                          key,
                                                          tiles,
                                                          tileParameterReferences,
                                                      ),
                                                  )
                                    }
                                />
                            );
                        })}
                    </Stack>
                    <Stack gap="xs" align="flex-start">
                        <Tooltip
                            label="Every parameter of this kind is already in the control"
                            disabled={freeKeys.length > 0}
                        >
                            <Button
                                variant="light"
                                size="xs"
                                leftSection={<MantineIcon icon={IconPlus} />}
                                onClick={() => setIsAdding((open) => !open)}
                                data-disabled={
                                    freeKeys.length === 0 || undefined
                                }
                            >
                                Add a parameter
                            </Button>
                        </Tooltip>
                        {isAdding && freeKeys.length > 0 && (
                            <Select
                                className={classes.addFieldSelect}
                                size="xs"
                                searchable
                                clearable={false}
                                autoFocus
                                defaultDropdownOpened
                                placeholder="Search parameters"
                                nothingFoundMessage="No matching parameters"
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
                                    updateControl(control.id, {
                                        parameterKeys: [
                                            ...control.parameterKeys,
                                            key,
                                        ],
                                    });
                                    setIsAdding(false);
                                }}
                            />
                        )}
                    </Stack>
                </Stack>
            ) : (
                <Stack gap="md">
                    <Paper p="md">
                        <Stack gap="xs">
                            <Text fz="sm" fw={600}>
                                Default value
                            </Text>
                            {firstKey !== undefined && firstDefinition && (
                                <ParameterInput
                                    paramKey={firstKey}
                                    parameter={firstDefinition}
                                    value={value ?? null}
                                    onParameterChange={(_, next) =>
                                        setControlValue(control.id, next)
                                    }
                                    projectUuid={projectUuid}
                                />
                            )}
                        </Stack>
                    </Paper>
                    <ControlInteractivity controlId={control.id} />
                </Stack>
            )}
        </EditorShell>
    );
};
