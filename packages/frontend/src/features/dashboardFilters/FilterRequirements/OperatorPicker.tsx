import {
    getFilterRuleWithDefaultValue,
    type DashboardFilterRule,
    type FilterableItem,
    type FilterType,
} from '@lightdash/common';
import { Menu, UnstyledButton } from '@mantine-8/core';
import { IconCheck, IconChevronDown } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { getFilterOperatorOptions } from '../../../components/common/Filters/FilterInputs/utils';
import MantineIcon from '../../../components/common/MantineIcon';
import classes from './OperatorPicker.module.css';

type Props = {
    filterType: FilterType;
    field: FilterableItem | undefined;
    member: DashboardFilterRule;
    /** Field label, used for the accessible button name */
    label: string;
    onChange: (newRule: DashboardFilterRule) => void;
    onOpen?: () => void;
    onClose?: () => void;
};

/**
 * Quiet inline operator control for guided setup rows: reads as prose next to
 * the field label ("Order date [is between]"), opens the same operator list as
 * the filter-bar chip popover. Changing the operator resets the member's
 * values to that operator's defaults, exactly like the chip popover does.
 */
const OperatorPicker: FC<Props> = ({
    filterType,
    field,
    member,
    label,
    onChange,
    onOpen,
    onClose,
}) => {
    const options = useMemo(
        () => getFilterOperatorOptions(filterType, field),
        [filterType, field],
    );
    const currentLabel =
        options.find((option) => option.value === member.operator)?.label ??
        member.operator;

    return (
        <Menu
            withinPortal
            position="bottom-start"
            shadow="md"
            onOpen={onOpen}
            onClose={onClose}
        >
            <Menu.Target>
                <UnstyledButton
                    className={classes.operatorButton}
                    aria-label={`Change operator for ${label}`}
                >
                    {currentLabel}
                    <MantineIcon icon={IconChevronDown} size={12} />
                </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown className={classes.dropdown}>
                {options.map((option) => (
                    <Menu.Item
                        key={option.value}
                        fz="xs"
                        rightSection={
                            option.value === member.operator ? (
                                <MantineIcon
                                    icon={IconCheck}
                                    size={12}
                                    color="blue.6"
                                />
                            ) : undefined
                        }
                        onClick={() => {
                            if (option.value === member.operator) return;
                            // Unlike the chip popover there is no Apply step,
                            // so pass null to clear values instead of seeding
                            // defaults (a seeded date would instantly satisfy
                            // the rule with a value the viewer never chose)
                            onChange(
                                getFilterRuleWithDefaultValue(
                                    filterType,
                                    field,
                                    {
                                        ...member,
                                        operator: option.value,
                                    },
                                    null,
                                ),
                            );
                        }}
                    >
                        {option.label}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
};

export default OperatorPicker;
