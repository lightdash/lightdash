import { Button, Indicator, Menu } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import { FC } from 'react';
import {
    useValidation,
    useValidationNotificationChecker,
    useValidationUserAbility,
} from '../../../hooks/validation/useValidation';
import MantineIcon from '../../common/MantineIcon';
import { ValidationErrorNotification } from './ValidationErrorNotification';

export const NotificationsMenu: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { data: validationData } = useValidation(projectUuid, false);
    const canUserManageValidations = useValidationUserAbility(projectUuid);
    const [hasReadValidationNotification, setHasReadValidationNotification] =
        useValidationNotificationChecker();

    const hasValidationErrors = validationData && validationData?.length > 0;

    const disableBadge =
        !canUserManageValidations ||
        !hasValidationErrors ||
        hasReadValidationNotification;

    return validationData ? (
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
                    onClick={() => setHasReadValidationNotification()}
                    sx={{
                        // NOTE: Revert overflow so badge doesn't get cropped off
                        '.mantine-Button-label': {
                            overflow: 'revert',
                        },
                    }}
                >
                    <Indicator
                        size={12}
                        color="red"
                        offset={1}
                        disabled={disableBadge}
                    >
                        <MantineIcon icon={IconBell} />
                    </Indicator>
                </Button>
            </Menu.Target>

            <Menu.Dropdown>
                {canUserManageValidations && hasValidationErrors ? (
                    <ValidationErrorNotification
                        projectUuid={projectUuid}
                        validationData={validationData}
                    />
                ) : (
                    <Menu.Item>No notifications</Menu.Item>
                )}
            </Menu.Dropdown>
        </Menu>
    ) : null;
};
