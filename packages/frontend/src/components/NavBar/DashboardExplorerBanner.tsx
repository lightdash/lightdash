import { assertUnreachable } from '@lightdash/common';
import { Button, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import MantineIcon from '../common/MantineIcon';

type Props = {
    projectUuid: string | undefined;
};

export const DashboardExplorerBanner: FC<Props> = ({ projectUuid }) => {
    const navigate = useNavigate();
    const { savedQueryUuid, mode } = useParams<{
        savedQueryUuid: string;
        mode?: 'edit' | 'view';
    }>();
    const [isCancelling, setIsCancelling] = useState(false);

    const { getEditingDashboardInfo } = useDashboardStorage();
    const {
        name: dashboardName,
        dashboardUuid,
        activeTabUuid,
    } = getEditingDashboardInfo();

    const action = useMemo(() => {
        if (!savedQueryUuid) {
            return 'creating';
        }
        switch (mode) {
            case 'edit':
                return 'editing';
            case 'view':
            default:
                return 'viewing';
        }
    }, [savedQueryUuid, mode]);

    const cancelButtonText = useMemo(() => {
        switch (action) {
            case 'viewing':
                return 'Return to dashboard';
            case 'creating':
            case 'editing':
                return 'Cancel';
            default:
                return assertUnreachable(
                    action,
                    `${action} is not a valid action`,
                );
        }
    }, [action]);

    const cancelButtonTooltipText = useMemo(() => {
        switch (action) {
            case 'creating':
                return 'Cancel chart creation and return to dashboard';
            case 'editing':
                return 'Cancel chart editing and return to dashboard';
            case 'viewing':
                return '';
            default:
                return assertUnreachable(
                    action,
                    `${action} is not a valid action`,
                );
        }
    }, [action]);

    const handleOnCancel = useCallback(() => {
        if (!projectUuid) {
            return;
        }
        // Cancel the action and navigate back to the dashboard, restoring the existing state (in case there were some unsaved changes)
        // Similar to the behaviour from `SaveToDashboard`
        // so do not clear the storage here
        setIsCancelling(true);

        let returnUrl = `/projects/${projectUuid}/dashboards/${dashboardUuid}/${
            savedQueryUuid ? 'view' : 'edit'
        }`;

        if (activeTabUuid) {
            returnUrl += `/tabs/${activeTabUuid}`;
        }

        void navigate(returnUrl);

        setTimeout(() => {
            // Clear the banner after navigating back to dashboard, but only after a delay so that the user can see the banner change
            setIsCancelling(false);
        }, 1000);
    }, [dashboardUuid, activeTabUuid, navigate, projectUuid, savedQueryUuid]);

    return (
        <>
            <MantineIcon icon={IconInfoCircle} color="white" size="sm" />

            <Text color="white" fw={500} fz="xs" mx="xxs">
                {isCancelling
                    ? `Cancelling...`
                    : `You are ${action} this chart from within ${
                          dashboardName ? `"${dashboardName}"` : 'a dashboard'
                      }`}
            </Text>

            <Tooltip
                withinPortal
                // Hide tooltip when viewing the chart because the button copy is sufficient
                disabled={action === 'viewing'}
                label={cancelButtonTooltipText}
                position="bottom"
                maw={350}
            >
                <Button
                    onClick={handleOnCancel}
                    size="xs"
                    ml="md"
                    variant="white"
                    compact
                >
                    {cancelButtonText}
                </Button>
            </Tooltip>
        </>
    );
};
