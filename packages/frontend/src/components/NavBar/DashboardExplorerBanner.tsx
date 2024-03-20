import { Button, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import MantineIcon from '../common/MantineIcon';

type Props = {
    projectUuid: string;
};

export const DashboardExplorerBanner: FC<Props> = ({ projectUuid }) => {
    const history = useHistory();
    const { savedQueryUuid, mode } = useParams<{
        savedQueryUuid: string;
        mode?: string;
    }>();
    const [isCancelling, setIsCancelling] = useState(false);

    const { getEditingDashboardInfo, clearDashboardStorage } =
        useDashboardStorage();
    const { name: dashboardName, dashboardUuid } = getEditingDashboardInfo();

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

    const handleOnCancel = useCallback(() => {
        setIsCancelling(true);
        // Also clear dashboard storage when navigating back to dashboard
        clearDashboardStorage();

        history.push(
            `/projects/${projectUuid}/dashboards/${dashboardUuid}/${
                savedQueryUuid ? 'view' : 'edit'
            }`,
        );

        setTimeout(() => {
            // Clear the banner after navigating back to dashboard, but only after a delay so that the user can see the banner change
            setIsCancelling(false);
        }, 1000);
    }, [
        clearDashboardStorage,
        dashboardUuid,
        history,
        projectUuid,
        savedQueryUuid,
    ]);

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
                label="Cancel chart creation and return to dashboard"
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
                    Cancel
                </Button>
            </Tooltip>
        </>
    );
};
