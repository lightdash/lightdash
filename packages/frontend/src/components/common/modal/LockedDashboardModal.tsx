import { type DashboardFilterRule } from '@lightdash/common';
import { Modal, Stack, Text } from '@mantine-8/core';
import { useCallback, type FC } from 'react';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import { getConditionalRuleLabelFromItem } from '../Filters/FilterInputs/utils';
import classes from './LockedDashboardModal.module.css';

interface LockedDashboardModalProps {
    opened: boolean;
}

export const LockedDashboardModal: FC<LockedDashboardModalProps> = ({
    opened,
}) => {
    const unmetFilterRequirements = useDashboardContext(
        (c) => c.unmetFilterRequirements,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );

    const getFilterLabel = useCallback(
        (rule: DashboardFilterRule) => {
            if (rule.label) return rule.label;
            const field =
                allFilterableFieldsMap[rule.target.fieldId] ??
                allFilterableMetricsMap[rule.target.fieldId];
            return field
                ? getConditionalRuleLabelFromItem(rule, field).field
                : rule.target.fieldId;
        },
        [allFilterableFieldsMap, allFilterableMetricsMap],
    );

    const unmetGroups = unmetFilterRequirements.filter(
        (requirement) => requirement.type === 'group',
    );
    const hasUnmetSingles = unmetFilterRequirements.some(
        (requirement) => requirement.type === 'single',
    );

    return (
        <Modal
            opened={opened}
            lockScroll={false}
            withCloseButton={false}
            centered
            withinPortal
            withOverlay={false}
            onClose={() => {}}
            classNames={{
                content: classes.content,
            }}
        >
            <Text fw={600} fz="lg" ta="center" mb="lg">
                Set filter values to get started
            </Text>
            <Stack gap="xs">
                {(hasUnmetSingles || unmetGroups.length === 0) && (
                    <Text>
                        This dashboard cannot be run without setting the filter
                        values that are required
                    </Text>
                )}
                {unmetGroups.map((group) => (
                    <Text key={group.groupId}>
                        This dashboard requires a value for at least one of:{' '}
                        {group.filters.map(getFilterLabel).join(', ')}
                    </Text>
                ))}
            </Stack>
        </Modal>
    );
};
