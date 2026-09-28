import {
    DimensionType,
    friendlyName,
    getFilterTypeFromItemType,
    isValuelessDashboardFilterRule,
    type DashboardFilterRule,
} from '@lightdash/common';
import { ActionIcon, Button, Text, Tooltip } from '@mantine/core';
import { IconLock, IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { getConditionalRuleLabel } from '../../components/common/Filters/FilterInputs/utils';
import MantineIcon from '../../components/common/MantineIcon';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';

type Props = {
    isEditMode: boolean;
    filterRule: DashboardFilterRule;
    onRemove?: () => void;
};

const LockedFilter: FC<Props> = ({ isEditMode, filterRule, onRemove }) => {
    const getUiString = useUiStrings();
    const summary = useMemo(
        () =>
            getConditionalRuleLabel(
                filterRule,
                getFilterTypeFromItemType(
                    filterRule.target.fallbackType ?? DimensionType.STRING,
                ),
                filterRule.label || friendlyName(filterRule.target.fieldId),
                getUiString,
            ),
        [filterRule, getUiString],
    );

    return (
        <Tooltip
            position="top-start"
            offset={0}
            arrowOffset={16}
            label={
                <Text size="xs">
                    {getUiString('filters.lockedFilterTooltip')}
                </Text>
            }
        >
            <Button
                data-dashboard-filter-control
                data-testid="locked-dashboard-filter"
                size="xs"
                variant="default"
                data-disabled
                style={{ borderRadius: '100px' }}
                leftSection={<MantineIcon icon={IconLock} color="ldGray.5" />}
                rightSection={
                    isEditMode &&
                    onRemove && (
                        <ActionIcon
                            onClick={onRemove}
                            size="xs"
                            radius="xl"
                            aria-label="Remove filter"
                        >
                            <MantineIcon size="sm" icon={IconX} />
                        </ActionIcon>
                    )
                }
            >
                <Text span size="xs" fw={600} c="dimmed">
                    {summary.field}
                </Text>
                <Text span size="xs" c="dimmed" ml={4}>
                    {isValuelessDashboardFilterRule(filterRule)
                        ? getUiString('filters.isAnyValue')
                        : [summary.operator, summary.value]
                              .filter(Boolean)
                              .join(' ')}
                </Text>
            </Button>
        </Tooltip>
    );
};

export default LockedFilter;
