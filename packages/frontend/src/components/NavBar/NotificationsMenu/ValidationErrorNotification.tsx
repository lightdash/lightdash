import { Menu, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { FC } from 'react';
import { Link } from 'react-router-dom';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { useValidation } from '../../../hooks/validation/useValidation';
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

export const ValidationErrorNotification: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { data: validationData } = useValidation(projectUuid);
    return validationData && validationData.length > 0 ? (
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
    ) : (
        <Menu.Item>No notifications</Menu.Item>
    );
};
