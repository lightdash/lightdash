import {
    DateGranularity,
    getControlActiveGranularity,
    isStandardDateGranularity,
    pruneDateZoomConfig,
    type DateZoomConfig,
    type DateZoomControl,
} from '@lightdash/common';
import { Button, Group, Menu } from '@mantine-8/core';
import {
    IconChevronDown,
    IconEye,
    IconEyeOff,
    IconPlus,
    IconSettings,
    IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { v4 as uuid4 } from 'uuid';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import useDashboardTileStatusContext from '../../../providers/Dashboard/useDashboardTileStatusContext';
import { getGranularityLabel } from '../utils';
import { DateZoomControlModal } from './DateZoomControlModal';

type Props = {
    isEditMode: boolean;
};

export const DateZoomControlPills: FC<Props> = ({ isEditMode }) => {
    const dateZoomConfig = useDashboardContext((c) => c.dateZoomConfig);
    const setDateZoomConfig = useDashboardContext((c) => c.setDateZoomConfig);
    const controlGranularities = useDashboardContext(
        (c) => c.controlGranularities,
    );
    const setControlGranularity = useDashboardContext(
        (c) => c.setControlGranularity,
    );
    const availableCustomGranularities = useDashboardTileStatusContext(
        (c) => c.availableCustomGranularities,
    );
    const dateZoomGranularities = useDashboardContext(
        (c) => c.dateZoomGranularities,
    );
    const defaultDateZoomGranularity = useDashboardContext(
        (c) => c.defaultDateZoomGranularity,
    );

    // A control offers only the dashboard's enabled granularities, split into
    // standard and custom (customs sorted by label).
    const standardGranularities = useMemo(
        () => dateZoomGranularities.filter(isStandardDateGranularity),
        [dateZoomGranularities],
    );
    const customGranularities = useMemo(
        () =>
            dateZoomGranularities
                .filter((g) => !isStandardDateGranularity(g))
                .sort((a, b) =>
                    getGranularityLabel(
                        a,
                        availableCustomGranularities,
                    ).localeCompare(
                        getGranularityLabel(b, availableCustomGranularities),
                    ),
                ),
        [dateZoomGranularities, availableCustomGranularities],
    );

    const [editingControl, setEditingControl] = useState<DateZoomControl>();

    const handleSave = (nextConfig: DateZoomConfig) => {
        setDateZoomConfig(nextConfig);
        setEditingControl(undefined);
    };

    const handleDelete = (controlUuid: string) => {
        setDateZoomConfig(
            pruneDateZoomConfig({
                ...dateZoomConfig,
                controls: dateZoomConfig.controls.filter(
                    (c) => c.uuid !== controlUuid,
                ),
            }),
        );
        setEditingControl(undefined);
    };

    const handleToggleHidden = (control: DateZoomControl) => {
        setDateZoomConfig({
            ...dateZoomConfig,
            controls: dateZoomConfig.controls.map((c) =>
                c.uuid === control.uuid ? { ...c, hidden: !c.hidden } : c,
            ),
        });
    };

    const visibleControls = dateZoomConfig.controls.filter(
        (control) => isEditMode || !control.hidden,
    );

    return (
        <Group gap="xs" wrap="nowrap">
            {visibleControls.map((control) => {
                const activeGranularity = getControlActiveGranularity(
                    control,
                    controlGranularities,
                );
                return (
                    <Menu
                        key={control.uuid}
                        withinPortal
                        position="bottom-start"
                        closeOnItemClick
                    >
                        <Menu.Target>
                            <Button
                                size="xs"
                                variant="default"
                                c={control.hidden ? 'dimmed' : undefined}
                                leftSection={
                                    control.hidden ? (
                                        <MantineIcon icon={IconEyeOff} />
                                    ) : undefined
                                }
                                rightSection={
                                    <MantineIcon icon={IconChevronDown} />
                                }
                            >
                                {control.name} ·{' '}
                                {getGranularityLabel(
                                    activeGranularity,
                                    availableCustomGranularities,
                                )}
                            </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Label>Granularity</Menu.Label>
                            {standardGranularities.map((granularity) => (
                                <Menu.Item
                                    key={granularity}
                                    fz="xs"
                                    disabled={activeGranularity === granularity}
                                    onClick={() =>
                                        setControlGranularity(
                                            control.uuid,
                                            granularity,
                                        )
                                    }
                                >
                                    {granularity}
                                </Menu.Item>
                            ))}
                            {customGranularities.length > 0 && (
                                <>
                                    <Menu.Divider />
                                    <Menu.Label>Custom</Menu.Label>
                                    {customGranularities.map((granularity) => (
                                        <Menu.Item
                                            key={granularity}
                                            fz="xs"
                                            disabled={
                                                activeGranularity ===
                                                granularity
                                            }
                                            onClick={() =>
                                                setControlGranularity(
                                                    control.uuid,
                                                    granularity,
                                                )
                                            }
                                        >
                                            {getGranularityLabel(
                                                granularity,
                                                availableCustomGranularities,
                                            )}
                                        </Menu.Item>
                                    ))}
                                </>
                            )}
                            <Menu.Divider />
                            <Menu.Item
                                fz="xs"
                                onClick={() =>
                                    setControlGranularity(
                                        control.uuid,
                                        undefined,
                                    )
                                }
                            >
                                Reset to default
                            </Menu.Item>
                            {isEditMode && (
                                <>
                                    <Menu.Item
                                        fz="xs"
                                        leftSection={
                                            <MantineIcon icon={IconSettings} />
                                        }
                                        onClick={() =>
                                            setEditingControl(control)
                                        }
                                    >
                                        Configure
                                    </Menu.Item>
                                    <Menu.Item
                                        fz="xs"
                                        leftSection={
                                            <MantineIcon
                                                icon={
                                                    control.hidden
                                                        ? IconEye
                                                        : IconEyeOff
                                                }
                                            />
                                        }
                                        onClick={() =>
                                            handleToggleHidden(control)
                                        }
                                    >
                                        {control.hidden
                                            ? 'Show to viewers'
                                            : 'Hide from viewers'}
                                    </Menu.Item>
                                    <Menu.Item
                                        fz="xs"
                                        color="red"
                                        leftSection={
                                            <MantineIcon icon={IconTrash} />
                                        }
                                        onClick={() =>
                                            handleDelete(control.uuid)
                                        }
                                    >
                                        Remove
                                    </Menu.Item>
                                </>
                            )}
                        </Menu.Dropdown>
                    </Menu>
                );
            })}

            {isEditMode && (
                <Button
                    size="xs"
                    variant="subtle"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={() =>
                        setEditingControl({
                            uuid: uuid4(),
                            name: 'Date zoom',
                            granularity:
                                defaultDateZoomGranularity ??
                                dateZoomGranularities[0] ??
                                DateGranularity.MONTH,
                        })
                    }
                >
                    Add zoom
                </Button>
            )}

            {editingControl && (
                <DateZoomControlModal
                    key={editingControl.uuid}
                    control={editingControl}
                    config={dateZoomConfig}
                    opened
                    onSave={handleSave}
                    onDelete={handleDelete}
                    onClose={() => setEditingControl(undefined)}
                />
            )}
        </Group>
    );
};
