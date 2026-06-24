import {
    DateGranularity,
    getControlActiveGranularity,
    pruneDateZoomConfig,
    type DateZoomConfig,
    type DateZoomControl,
} from '@lightdash/common';
import { Button, Group, Menu } from '@mantine-8/core';
import { IconChevronDown, IconPlus, IconSettings } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { v4 as uuid4 } from 'uuid';
import MantineIcon from '../../../components/common/MantineIcon';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import { DateZoomControlModal } from './DateZoomControlModal';

const CONTROL_GRANULARITIES: DateGranularity[] = [
    DateGranularity.DAY,
    DateGranularity.WEEK,
    DateGranularity.MONTH,
    DateGranularity.QUARTER,
    DateGranularity.YEAR,
];

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

    return (
        <Group gap="xs" wrap="nowrap">
            {dateZoomConfig.controls.map((control) => {
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
                                rightSection={
                                    <MantineIcon icon={IconChevronDown} />
                                }
                            >
                                {control.name} · {activeGranularity}
                            </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Label>Granularity</Menu.Label>
                            {CONTROL_GRANULARITIES.map((granularity) => (
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
                                <Menu.Item
                                    fz="xs"
                                    leftSection={
                                        <MantineIcon icon={IconSettings} />
                                    }
                                    onClick={() => setEditingControl(control)}
                                >
                                    Configure
                                </Menu.Item>
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
                            granularity: DateGranularity.MONTH,
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
