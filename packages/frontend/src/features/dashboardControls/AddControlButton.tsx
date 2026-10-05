import { Box, Button, Menu, Tooltip } from '@mantine/core';
import {
    Icon123,
    IconAbc,
    IconCalendar,
    IconClock,
    IconToggleLeft,
    type Icon,
} from '@tabler/icons-react';
import { useMemo, useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { useDashboardControls } from './context';
import {
    CONTROL_TYPE_LABELS,
    CONTROL_TYPES,
    getControlTypeFromItem,
    getControlTypeWord,
    getParameterTypeForControl,
    type ControlType,
} from './controlType';
import classes from './dashboardControls.module.css';
import { getAvailableControlTypes } from './guard';
import { getFreeParameterTypes } from './parameterMapping';
import { useParameterTiles } from './useParameterControlModel';

const CONTROL_TYPE_ICONS: Record<ControlType, Icon> = {
    date: IconCalendar,
    time: IconClock,
    text: IconAbc,
    number: Icon123,
    boolean: IconToggleLeft,
};

// The types a new control can have, under the button that adds one. Choosing
// a type opens a new, empty control.
const ControlTypeMenu: FC<{ children: ReactNode }> = ({ children }) => {
    const {
        openNew,
        holdOpenControl,
        isEnabled,
        isEditMode,
        parameterControls,
    } = useDashboardControls();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const isLoadingFields = useDashboardContext(
        (c) => c.isLoadingDashboardFilters || c.isFetchingDashboardFilters,
    );
    const definitions = useDashboardContext((c) => c.parameterDefinitions);
    const parameterTiles = useParameterTiles();
    // Parameter controls are made while editing only
    const offersParameters = isEnabled && isEditMode;

    const availableTypes = useMemo(
        () =>
            getAvailableControlTypes({
                fieldTypes:
                    isLoadingFields || !filterableFieldsByTileUuid
                        ? null
                        : Object.values(filterableFieldsByTileUuid).flatMap(
                              (fields) => fields.map(getControlTypeFromItem),
                          ),
                parameterTypes: offersParameters
                    ? getFreeParameterTypes({
                          tiles: parameterTiles,
                          controls: parameterControls,
                          definitions,
                      })
                    : [],
            }),
        [
            isLoadingFields,
            filterableFieldsByTileUuid,
            offersParameters,
            parameterTiles,
            parameterControls,
            definitions,
        ],
    );

    return (
        <Menu
            position="bottom-start"
            withinPortal
            opened={isMenuOpen}
            // An open control with changes comes back instead of the menu
            onChange={(isOpen) => setIsMenuOpen(isOpen && !holdOpenControl())}
        >
            <Menu.Target>{children}</Menu.Target>
            <Menu.Dropdown>
                <Menu.Label>Control type</Menu.Label>
                {CONTROL_TYPES.map((controlType) => {
                    const isUnavailable =
                        availableTypes !== null &&
                        !availableTypes.has(controlType);
                    const typeWord = getControlTypeWord(controlType);
                    // A type no parameter has, as time, speaks of fields only
                    const hasParameters =
                        offersParameters &&
                        getParameterTypeForControl(controlType) !== null;
                    return (
                        // A disabled item takes no pointer: the box around
                        // it carries the reason
                        <Tooltip
                            key={controlType}
                            position="right"
                            disabled={!isUnavailable}
                            label={
                                hasParameters
                                    ? `No ${typeWord} fields or parameters on this dashboard`
                                    : `No ${typeWord} fields on this dashboard`
                            }
                        >
                            <Box>
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon
                                            icon={
                                                CONTROL_TYPE_ICONS[controlType]
                                            }
                                            color="dimmed"
                                        />
                                    }
                                    disabled={isUnavailable}
                                    onClick={() => openNew(controlType)}
                                >
                                    {CONTROL_TYPE_LABELS[controlType]}
                                </Menu.Item>
                            </Box>
                        </Tooltip>
                    );
                })}
            </Menu.Dropdown>
        </Menu>
    );
};

// After the pills, where the new control's pill appears
const AddControlButton: FC = () => (
    <ControlTypeMenu>
        <Button
            data-dashboard-filter-control
            size="xs"
            variant="default"
            radius="xl"
            flex="0 0 auto"
            className={classes.addControl}
        >
            Add control
        </Button>
    </ControlTypeMenu>
);

export default AddControlButton;
