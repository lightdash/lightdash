import { ChartType, FeatureFlags } from '@lightdash/common';
import { Button, Menu } from '@mantine/core';
import { IconChevronDown, IconCode } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import MantineIcon from '../../common/MantineIcon';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { useCreateProjectChartType } from '../../VisualizationConfigs/CustomChartType/useSelectProjectChartType';
import classes from './index.module.css';
import { useChartTypeOptions } from './useChartTypeOptions';

const VisualizationCardOptions: FC = memo(() => {
    const { setChartType } = useVisualizationContext();
    const {
        disabled,
        isCustomChart,
        options,
        resetCartesianState,
        selectedChartType,
    } = useChartTypeOptions();

    const projectUuid = useProjectUuid();
    const dataAppsEnabled =
        useServerFeatureFlag(FeatureFlags.EnableDataApps).data?.enabled ===
        true;
    const canCreateApp = useCanCreateDataApp(projectUuid);
    const createProjectChartType = useCreateProjectChartType();
    const canComposeCustomChartType = dataAppsEnabled && canCreateApp;
    const handleSelectCustom = () => {
        resetCartesianState();
        if (isCustomChart) return;

        if (canComposeCustomChartType) {
            createProjectChartType();
            return;
        }
        setChartType(ChartType.CUSTOM);
    };

    return (
        <Menu
            position="bottom"
            withArrow
            closeOnClickOutside
            closeOnEscape
            offset={2}
            closeOnItemClick
            disabled={disabled}
        >
            <Menu.Target>
                <Button
                    variant="default"
                    size="xs"
                    disabled={disabled}
                    leftSection={
                        <MantineIcon
                            icon={selectedChartType.icon}
                            color="ldGray"
                            className={
                                selectedChartType.rotatedIcon
                                    ? classes.rotatedIcon
                                    : undefined
                            }
                        />
                    }
                    rightSection={
                        <MantineIcon icon={IconChevronDown} color="ldGray" />
                    }
                    data-testid="VisualizationCardOptions"
                >
                    {selectedChartType.label}
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                {options.map((option) => (
                    <Menu.Item
                        key={option.id}
                        disabled={disabled}
                        color={option.selected ? 'blue' : undefined}
                        leftSection={
                            <MantineIcon
                                icon={option.icon}
                                className={
                                    option.rotatedIcon
                                        ? classes.rotatedIcon
                                        : undefined
                                }
                            />
                        }
                        onClick={option.select}
                    >
                        {option.label}
                    </Menu.Item>
                ))}

                <Menu.Item
                    disabled={disabled}
                    color={isCustomChart ? 'blue' : undefined}
                    leftSection={<MantineIcon icon={IconCode} />}
                    onClick={handleSelectCustom}
                >
                    Custom
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
});

export default VisualizationCardOptions;
