import { type ValidationResponse } from '@lightdash/common';
import { Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router-dom';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import LargeMenuItem from '../../common/LargeMenuItem';

const ValidationErrorNotificationDescription: FC<{
    lastValidatedAt: Date;
    numberOfErrors: number;
}> = ({ lastValidatedAt, numberOfErrors }) => {
    const validationTimeAgo = useTimeAgo(lastValidatedAt);

    return (
        <Text>
            New validation completed {validationTimeAgo} with {numberOfErrors}{' '}
            errors
        </Text>
    );
};

export const ValidationErrorNotification: FC<{
    projectUuid: string;
    validationData: ValidationResponse[];
}> = ({ projectUuid, validationData }) => (
    <LargeMenuItem
        component={Link}
        to={`/generalSettings/projectManagement/${projectUuid}/validator`}
        title="Validation Errors"
        description={
            <ValidationErrorNotificationDescription
                lastValidatedAt={validationData[0].createdAt}
                numberOfErrors={validationData.length}
            />
        }
        icon={IconAlertCircle}
        iconProps={{ color: 'red' }}
    />
);
