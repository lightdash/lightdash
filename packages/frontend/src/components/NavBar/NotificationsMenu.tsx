import { Button, Indicator, Menu, Text } from '@mantine/core';
import { IconAlertCircle, IconBell } from '@tabler/icons-react';
import { FC } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import {
    useValidation,
    useValidationNotificationChecker,
    useValidationUserAbility,
} from '../../hooks/validation/useValidation';
import LargeMenuItem from '../common/LargeMenuItem';
import MantineIcon from '../common/MantineIcon';

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

export const NotificationsMenu: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { data: validationData } = useValidation(projectUuid);
    const canUserManageValidations = useValidationUserAbility(projectUuid);
    const [hasReadNotification, setHasReadNotification] =
        useValidationNotificationChecker();

    return (
        <Menu
            withArrow
            shadow="lg"
            position="bottom-end"
            arrowOffset={16}
            offset={-2}
        >
            <Menu.Target>
                <Button
                    variant="default"
                    size="xs"
                    onClick={() => {
                        setHasReadNotification();
                    }}
                    sx={{
                        // NOTE: Revert overflow so badge doesn't get cropped off
                        '.mantine-Button-label': {
                            overflow: 'revert',
                        },
                    }}
                >
                    <Indicator
                        color="red"
                        offset={2}
                        disabled={
                            !canUserManageValidations || hasReadNotification
                        }
                    >
                        <MantineIcon icon={IconBell} />
                    </Indicator>
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                {canUserManageValidations &&
                validationData &&
                validationData.length > 0 ? (
                    <LargeMenuItem
                        component={RouterLink}
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
                )}
            </Menu.Dropdown>
        </Menu>
    );
};
