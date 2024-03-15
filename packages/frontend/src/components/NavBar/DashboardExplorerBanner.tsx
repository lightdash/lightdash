import { Button, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useEffect, useMemo, type FC } from 'react';
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

    const { getEditingDashboardInfo, clearDashboardStorage } =
        useDashboardStorage();
    const { name: dashboardName, dashboardUuid } = getEditingDashboardInfo();

    useEffect(() => {
        window.addEventListener('unload', clearDashboardStorage);
        return () =>
            window.removeEventListener('unload', clearDashboardStorage);
    }, [clearDashboardStorage]);

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

    return (
        <>
            <MantineIcon icon={IconInfoCircle} color="white" size="sm" />
            <Text color="white" fw={500} fz="xs" mx="xxs">
                You are {action} this chart from within "{dashboardName}"
            </Text>
            <Tooltip
                withinPortal
                label="Cancel chart creation and return to dashboard"
                position="bottom"
                maw={350}
            >
                <Button
                    onClick={() => {
                        history.push(
                            `/projects/${projectUuid}/dashboards/${dashboardUuid}/${
                                savedQueryUuid ? 'view' : 'edit'
                            }`,
                        );

                        // Also clear dashboard storage when navigating back to dashboard
                        clearDashboardStorage();
                    }}
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
