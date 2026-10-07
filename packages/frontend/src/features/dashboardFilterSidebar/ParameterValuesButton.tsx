import { Button, Menu } from '@mantine/core';
import { IconVariable } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { getParameterKeysOnTab } from './parameterSources';
import { useFilterSidebar } from './useFilterSidebar';

export const ParameterValuesButton: FC = () => {
    const { openParameter } = useFilterSidebar();
    const tileParameterReferences = useDashboardContext(
        (c) => c.tileParameterReferences,
    );
    const parameterDefinitions = useDashboardContext(
        (c) => c.parameterDefinitions,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const activeTabUuid = useDashboardContext((c) => c.activeTab?.uuid);

    const keys = useMemo(
        () =>
            getParameterKeysOnTab({
                tileParameterReferences,
                dashboardTiles: dashboardTiles ?? [],
                tabUuid: activeTabUuid ?? null,
            }),
        [tileParameterReferences, dashboardTiles, activeTabUuid],
    );

    return (
        <Menu position="bottom-start" withinPortal>
            <Menu.Target>
                <Button
                    variant="default"
                    size="xs"
                    leftSection={<MantineIcon icon={IconVariable} />}
                >
                    Parameters
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                {keys.length === 0 ? (
                    <Menu.Item disabled>No parameters on this tab</Menu.Item>
                ) : (
                    keys.map((key) => (
                        <Menu.Item key={key} onClick={() => openParameter(key)}>
                            {parameterDefinitions[key]?.label ?? key}
                        </Menu.Item>
                    ))
                )}
            </Menu.Dropdown>
        </Menu>
    );
};
