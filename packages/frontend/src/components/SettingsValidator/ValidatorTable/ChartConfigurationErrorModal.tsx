import { type ValidationErrorChartResponse } from '@lightdash/common';
import { Anchor, Button, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import Callout from '../../common/Callout';
import MantineModal from '../../common/MantineModal';
import { getLinkToResource } from '../utils/utils';

type Props = {
    validationError: ValidationErrorChartResponse | undefined;
    onClose: () => void;
};

export const ChartConfigurationErrorModal: FC<Props> = ({
    validationError,
    onClose,
}) => {
    if (!validationError) {
        return null;
    }

    const chartUrl = getLinkToResource(
        validationError,
        validationError.projectUuid,
    );

    return (
        <MantineModal
            size="lg"
            title="Chart configuration issue"
            icon={IconAlertTriangle}
            opened={!!validationError}
            onClose={onClose}
            actions={
                <Button component="a" href={chartUrl} target="_blank">
                    Edit chart
                </Button>
            }
        >
            <Stack spacing="md">
                <Text fz="sm">
                    Chart:{' '}
                    <Anchor href={chartUrl} target="_blank">
                        <Text span fw={600}>
                            {validationError.name}
                        </Text>
                    </Anchor>
                </Text>

                <Callout variant="warning" title="Unused dimension in query">
                    <Text fz="sm">
                        The dimension{' '}
                        <Text span fw={600}>
                            {validationError.fieldName}
                        </Text>{' '}
                        is included in this chart's query but is not being used
                        in the chart configuration (x-axis, y-axis, or group
                        by).
                    </Text>
                </Callout>

                <Text fz="sm">
                    Dimensions that are not mapped to the chart configuration
                    can cause incorrect or unexpected results.
                </Text>

                <Text fz="sm" fw={500}>
                    To fix this issue, either:
                </Text>
                <Stack spacing="xs" ml="md">
                    <Text fz="sm">
                        1. Remove the unused dimension from the query
                    </Text>
                    <Text fz="sm">
                        2. Add the dimension to the x-axis, y-axis, or group by
                        configuration
                    </Text>
                </Stack>
            </Stack>
        </MantineModal>
    );
};
