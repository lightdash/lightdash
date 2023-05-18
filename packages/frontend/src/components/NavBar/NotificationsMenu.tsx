import { subject } from '@casl/ability';
import { Button, Indicator, Menu, Text } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconAlertCircle, IconBell } from '@tabler/icons-react';
import { FC } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useProject } from '../../hooks/useProject';
import useUser from '../../hooks/user/useUser';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import {
    LAST_VALIDATION_TIMESTAMP_KEY,
    useValidation,
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
    const { data: user } = useUser(true);
    const { data: project } = useProject(projectUuid);
    const { data } = useValidation(projectUuid);
    const canUserSeeValidationErrorsNotifications =
        !!user &&
        !!project &&
        user.ability?.can(
            'manage',
            subject('Validation', {
                organizationUuid: project.organizationUuid,
                projectUuid,
            }),
        );
    const [lastValidationTimestamp, setLastValidationTimestamp] =
        useLocalStorage({
            key: LAST_VALIDATION_TIMESTAMP_KEY,
            getInitialValueInEffect: true,
        });

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
                    onClick={() => setLastValidationTimestamp('')}
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
                        disabled={!lastValidationTimestamp}
                    >
                        <MantineIcon icon={IconBell} />
                    </Indicator>
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                {canUserSeeValidationErrorsNotifications &&
                data &&
                data.length > 0 ? (
                    <LargeMenuItem
                        component={RouterLink}
                        to={`/generalSettings/projectManagement/${projectUuid}/validator`}
                        title="Validation Errors"
                        description={
                            <ValidationErrorNotificationDescription
                                lastValidatedAt={data[0].createdAt}
                                numberOfErrors={data.length}
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
