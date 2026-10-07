import {
    ActionIcon,
    Box,
    Button,
    Group,
    Menu,
    Paper,
    Select,
    Stack,
    Tabs,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconDots, IconX } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { ParameterInput } from '../parameters/components/ParameterInput';
import { ControlInteractivity } from './ControlInteractivity';
import { FieldRow } from './FieldRow';
import classes from './FilterSidebar.module.css';
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
    const [section, setSection] = useState<string | null>('interactivity');
    const [confirmRemove, setConfirmRemove] = useState(false);
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

    const count = getControlCount(
        control,
        dashboardTiles ?? [],
        tileParameterReferences,
    );
    const appliedTabCount = Object.values(
        getControlTabCounts(
            control,
            dashboardTiles ?? [],
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
    const tiles = dashboardTiles ?? [];
    const setControlTargets = (
        next: Pick<typeof control, 'tileTargets' | 'parameterKeys'>,
    ) =>
        updateControl(control.id, {
            tileTargets: next.tileTargets,
            parameterKeys: next.parameterKeys,
        });

    return (
        <Box className={classes.root}>
            <Group justify="space-between" wrap="nowrap" px="md" pt="md">
                <Stack gap={2} align="flex-start">
                    <Title order={5} className={classes.title}>
                        {control.label || 'New control'}
                    </Title>
                    <Text fz="xs" c="dimmed">
                        {`${keyCount} ${keyCount === 1 ? 'parameter' : 'parameters'} · sets ${count.applied} of ${count.possible} charts${tabReach}`}
                    </Text>
                </Stack>
                <Group gap="xxs" wrap="nowrap">
                    <Menu onClose={() => setConfirmRemove(false)}>
                        <Menu.Target>
                            <Tooltip label="More actions">
                                <ActionIcon aria-label="More actions">
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Tooltip>
                        </Menu.Target>
                        <Menu.Dropdown>
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
                        </Menu.Dropdown>
                    </Menu>
                    <Tooltip label="Close">
                        <ActionIcon aria-label="Close" onClick={cancelControl}>
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>
            <Stack gap="md" p="md" className={classes.body}>
                <TextInput
                    label="Label"
                    required
                    placeholder="What viewers will see"
                    value={control.label}
                    onChange={(e) =>
                        updateControl(control.id, { label: e.target.value })
                    }
                />
                <Tabs value={section} onChange={setSection}>
                    <Tabs.List mb="md">
                        <Tabs.Tab value="interactivity">Interactivity</Tabs.Tab>
                        <Tabs.Tab value="charts">Charts</Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel value="interactivity">
                        <Stack gap="md">
                            <Paper p="md">
                                <Stack gap="xs">
                                    <Text fz="sm" fw={600}>
                                        Default value
                                    </Text>
                                    {firstKey !== undefined &&
                                        firstDefinition && (
                                            <ParameterInput
                                                paramKey={firstKey}
                                                parameter={firstDefinition}
                                                value={value ?? null}
                                                onParameterChange={(_, next) =>
                                                    setControlValue(
                                                        control.id,
                                                        next,
                                                    )
                                                }
                                                projectUuid={projectUuid}
                                            />
                                        )}
                                    <Button
                                        variant="subtle"
                                        size="xs"
                                        onClick={() =>
                                            setControlValue(control.id, null)
                                        }
                                    >
                                        Clear
                                    </Button>
                                </Stack>
                            </Paper>
                            <ControlInteractivity controlId={control.id} />
                        </Stack>
                    </Tabs.Panel>
                    <Tabs.Panel value="charts">
                        <Stack gap="md">
                            <Text fz="sm" fw={600}>
                                Parameters in this control
                            </Text>
                            {control.parameterKeys.map((key) => {
                                const keyCountFor = getKeyCount(
                                    control,
                                    key,
                                    tiles,
                                    tileParameterReferences,
                                );
                                const isLastKey =
                                    control.parameterKeys.length === 1;
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
                                        isHighlighted={
                                            highlightedFieldId === key
                                        }
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
                                        onRemove={() => {
                                            if (isLastKey) return;
                                            setControlTargets(
                                                removeKey(
                                                    control,
                                                    key,
                                                    tiles,
                                                    tileParameterReferences,
                                                ),
                                            );
                                        }}
                                    />
                                );
                            })}
                            <Select
                                size="xs"
                                searchable
                                placeholder="+ Add a parameter"
                                value={null}
                                data={freeKeys.map((key) => ({
                                    value: key,
                                    label: getParameterLabel(
                                        key,
                                        parameterDefinitions,
                                    ),
                                }))}
                                onChange={(key) =>
                                    key !== null &&
                                    updateControl(control.id, {
                                        parameterKeys: [
                                            ...control.parameterKeys,
                                            key,
                                        ],
                                    })
                                }
                            />
                            <Text fz="xs" c="dimmed">
                                Choose which parameter each chart is set by.
                            </Text>
                        </Stack>
                    </Tabs.Panel>
                </Tabs>
            </Stack>
            <Group gap="xs" p="md" className={classes.footer} grow>
                <Button variant="default" onClick={cancelControl}>
                    Cancel
                </Button>
                <Button
                    onClick={closeControl}
                    disabled={control.label.trim() === ''}
                >
                    Apply
                </Button>
            </Group>
        </Box>
    );
};
