import {
    isDashboardValidationError,
    type Dashboard,
    type ValidationErrorDashboardResponse,
} from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { IconTool } from '@tabler/icons-react';
import { type FC } from 'react';
import { useDashboardQuery, useUpdateDashboard } from '../../../hooks/dashboard/useDashboard';
import Callout from '../../common/Callout';
import MantineModal from '../../common/MantineModal';

type Props = {
    validationError: ValidationErrorDashboardResponse | undefined;
    onClose: () => void;
};

export const FixDashboardFilterModal: FC<Props> = ({
    validationError,
    onClose,
}) => {
    const dashboardUuid = validationError?.dashboardUuid;
    const { data: dashboard } = useDashboardQuery(dashboardUuid);
    const { mutate: updateDashboard, isLoading } = useUpdateDashboard(
        dashboardUuid,
        false,
    );

    if (!validationError || !isDashboardValidationError(validationError)) {
        return null;
    }

    const handleRemoveFilter = () => {
        if (!dashboard) return;

        const fieldName = validationError.fieldName;
        if (!fieldName) return;

        // Remove the filter from dimensions and metrics arrays
        const updatedFilters = {
            dimensions: dashboard.filters.dimensions.filter(
                (filter) => filter.target.fieldId !== fieldName,
            ),
            metrics: dashboard.filters.metrics.filter(
                (filter) => filter.target.fieldId !== fieldName,
            ),
            tableCalculations: dashboard.filters.tableCalculations,
        };

        updateDashboard(
            {
                tiles: dashboard.tiles,
                filters: updatedFilters,
                parameters: dashboard.parameters,
                tabs: dashboard.tabs,
                config: dashboard.config,
            },
            {
                onSuccess: () => {
                    onClose();
                },
            },
        );
    };

    return (
        <MantineModal
            size="lg"
            title="Fix dashboard filter error"
            icon={IconTool}
            opened={!!validationError}
            onClose={onClose}
            actions={
                <Button
                    onClick={handleRemoveFilter}
                    disabled={isLoading}
                    loading={isLoading}
                >
                    Remove Filter
                </Button>
            }
        >
            <Stack spacing="md">
                <Text fz="sm">
                    Dashboard:{' '}
                    <Text span fw={600}>
                        {validationError.name}
                    </Text>
                </Text>

                <Callout variant="warning" title="Filter error detected">
                    The filter field &apos;{validationError.fieldName}&apos;
                    {validationError.tableName &&
                        ` does not match the table '${validationError.tableName}'`}
                    . This typically happens when a filter references a field
                    from a different model than its target table.
                </Callout>

                <Text fz="sm" c="ldGray.7">
                    Removing this filter will fix the validation error. You can
                    manually add a corrected filter in the dashboard editor if
                    needed.
                </Text>
            </Stack>
        </MantineModal>
    );
};
