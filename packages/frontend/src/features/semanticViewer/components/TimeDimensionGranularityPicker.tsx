import {
    assertUnreachable,
    SemanticLayerTimeGranularity,
} from '@lightdash/common';
import { Menu, type MenuProps } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { type FC, type PropsWithChildren } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

const getTimeGranularityLabel = (granularity: SemanticLayerTimeGranularity) => {
    switch (granularity) {
        case SemanticLayerTimeGranularity.YEAR:
            return 'Year';
        case SemanticLayerTimeGranularity.QUARTER:
            return 'Quarter';
        case SemanticLayerTimeGranularity.MONTH:
            return 'Month';
        case SemanticLayerTimeGranularity.WEEK:
            return 'Week';
        case SemanticLayerTimeGranularity.DAY:
            return 'Day';
        case SemanticLayerTimeGranularity.HOUR:
            return 'Hour';
        case SemanticLayerTimeGranularity.MINUTE:
            return 'Minute';
        case SemanticLayerTimeGranularity.SECOND:
            return 'Second';
        case SemanticLayerTimeGranularity.MILLISECOND:
            return 'Millisecond';
        case SemanticLayerTimeGranularity.MICROSECOND:
            return 'Microsecond';
        case SemanticLayerTimeGranularity.NANOSECOND:
            return 'Nanosecond';
        default:
            return assertUnreachable(
                granularity,
                `Unknown time granularity ${granularity}`,
            );
    }
};

type TimeDimensionGranularityPickerProps = {
    menuProps?: MenuProps;
    availableGranularities: SemanticLayerTimeGranularity[];
    value: SemanticLayerTimeGranularity | null;
    onChange: (
        newGranularity: SemanticLayerTimeGranularity | undefined,
    ) => void;
};

const TimeDimensionGranularityPicker: FC<
    PropsWithChildren<TimeDimensionGranularityPickerProps>
> = ({ children, availableGranularities, value, onChange, menuProps }) => {
    return (
        <Menu
            withArrow
            withinPortal
            shadow="md"
            position="bottom-end"
            offset={2}
            {...menuProps}
        >
            <Menu.Target>{children}</Menu.Target>
            <Menu.Dropdown>
                <Menu.Label>Time granularity</Menu.Label>

                {availableGranularities.map((granularity) => (
                    <Menu.Item
                        key={granularity}
                        color={value === granularity ? 'blue' : undefined}
                        rightSection={
                            value === granularity ? (
                                <MantineIcon icon={IconCheck} />
                            ) : null
                        }
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            if (value === granularity) {
                                onChange(undefined);
                            } else {
                                onChange(granularity);
                            }
                        }}
                    >
                        {getTimeGranularityLabel(granularity)}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
};

export default TimeDimensionGranularityPicker;
