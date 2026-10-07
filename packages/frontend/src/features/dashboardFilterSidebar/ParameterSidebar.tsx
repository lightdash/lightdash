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
import { IconDots, IconVariable, IconX } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { ParameterInput } from '../parameters/components/ParameterInput';
import classes from './FilterSidebar.module.css';
import { NotSavedBadge } from './NotSavedBadge';
import {
    getControlTiles,
    getFreeParameterKeys,
    getParameterLabel,
    type ParameterKind,
} from './parameterControls';
import { useFilterSidebar } from './useFilterSidebar';

const NO_TAB = 'no-tab';

export const ParameterSidebar: FC = () => {
    const {
        parameterControls,
        editingControlId,
        updateControl,
        removeControl,
        setControlValue,
        closeControl,
        cancelControl,
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

    const tiles = getControlTiles(
        control,
        dashboardTiles ?? [],
        tileParameterReferences,
    );
    const usedTabCount = new Set(tiles.map((tile) => tile.tabUuid ?? NO_TAB))
        .size;
    const tabReach =
        dashboardTabs.length > 1
            ? ` on ${usedTabCount} of ${dashboardTabs.length} tabs`
            : '';
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
    const chartCountFor = (key: string) =>
        Object.values(tileParameterReferences).filter((keys) =>
            keys.includes(key),
        ).length;
    const hiddenTabUuids = control.hiddenTabUuids ?? [];

    return (
        <Box className={classes.root}>
            <Group justify="space-between" wrap="nowrap" px="md" pt="md">
                <Stack gap={2} align="flex-start">
                    <Title order={5} className={classes.title}>
                        {control.label || 'New control'}
                    </Title>
                    <Text fz="xs" c="dimmed">
                        {`Parameter control · overrides ${tiles.length} ${tiles.length === 1 ? 'chart' : 'charts'}${tabReach}`}
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
                                        Value on this dashboard
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
                                    <Text fz="xs" c="dimmed">
                                        Clearing the value does not change which
                                        charts follow this control.
                                    </Text>
                                </Stack>
                            </Paper>
                            <Paper p="md">
                                <Stack gap="sm">
                                    <Text fz="sm" fw={600}>
                                        Viewer controls
                                    </Text>
                                    <Group
                                        justify="space-between"
                                        wrap="nowrap"
                                    >
                                        <Text size="xs" fw={500}>
                                            Visibility
                                        </Text>
                                        <NotSavedBadge tooltip="Hiding per tab is not saved yet" />
                                    </Group>
                                    {dashboardTabs.map((tab) => (
                                        <Select
                                            key={tab.uuid}
                                            size="xs"
                                            label={tab.name}
                                            data={['Shown', 'Hidden']}
                                            value={
                                                hiddenTabUuids.includes(
                                                    tab.uuid,
                                                )
                                                    ? 'Hidden'
                                                    : 'Shown'
                                            }
                                            onChange={(next) =>
                                                updateControl(control.id, {
                                                    hiddenTabUuids:
                                                        next === 'Hidden'
                                                            ? [
                                                                  ...hiddenTabUuids,
                                                                  tab.uuid,
                                                              ]
                                                            : hiddenTabUuids.filter(
                                                                  (uuid) =>
                                                                      uuid !==
                                                                      tab.uuid,
                                                              ),
                                                })
                                            }
                                        />
                                    ))}
                                    <Group
                                        justify="space-between"
                                        wrap="nowrap"
                                    >
                                        <Text size="xs" fw={500}>
                                            Placement
                                        </Text>
                                        <NotSavedBadge tooltip="Placement is not saved yet" />
                                    </Group>
                                    <Select
                                        size="xs"
                                        data={[
                                            {
                                                value: 'bar',
                                                label: 'On the bar',
                                            },
                                            {
                                                value: 'more',
                                                label: 'Under More',
                                            },
                                        ]}
                                        value={control.placement ?? 'bar'}
                                        onChange={(next) =>
                                            updateControl(control.id, {
                                                placement:
                                                    next === 'more'
                                                        ? 'more'
                                                        : 'bar',
                                            })
                                        }
                                    />
                                    <Text fz="xs" c="dimmed">
                                        A parameter shows needs a value when a
                                        chart has nothing to run with.
                                    </Text>
                                </Stack>
                            </Paper>
                        </Stack>
                    </Tabs.Panel>
                    <Tabs.Panel value="charts">
                        <Stack gap="md">
                            <Text fz="sm" fw={600}>
                                Parameters in this control
                            </Text>
                            {control.parameterKeys.map((key) => {
                                const n = chartCountFor(key);
                                return (
                                    <Group
                                        key={key}
                                        justify="space-between"
                                        wrap="nowrap"
                                    >
                                        <Group gap="xs" wrap="nowrap">
                                            <MantineIcon icon={IconVariable} />
                                            <Text fz="sm" truncate>
                                                {getParameterLabel(
                                                    key,
                                                    parameterDefinitions,
                                                )}
                                            </Text>
                                            <Text fz="xs" c="dimmed">
                                                {`${n} ${n === 1 ? 'chart' : 'charts'}`}
                                            </Text>
                                        </Group>
                                        {control.parameterKeys.length > 1 && (
                                            <Button
                                                variant="subtle"
                                                size="compact-xs"
                                                onClick={() =>
                                                    updateControl(control.id, {
                                                        parameterKeys:
                                                            control.parameterKeys.filter(
                                                                (k) =>
                                                                    k !== key,
                                                            ),
                                                    })
                                                }
                                            >
                                                Remove
                                            </Button>
                                        )}
                                    </Group>
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
                                Choose which charts follow this control.
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
