import { assertUnreachable } from '@lightdash/common';
import { Button, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useOptionalProjectRoute } from '../../hooks/useProjectRoute';
import MantineIcon from '../common/MantineIcon';

type Props = {
    projectUuid: string | undefined;
};

export const DashboardExplorerBanner: FC<Props> = ({ projectUuid }) => {
    const { t } = useTranslation('navigation');
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
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
        dashboardSlug,
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
                return t('dashboardExplorer.returnToDashboard');
            case 'creating':
            case 'editing':
                return t('actions.cancel', { ns: 'common' });
            default:
                return assertUnreachable(
                    action,
                    `${action} is not a valid action`,
                );
        }
    }, [action, t]);

    const cancelButtonTooltipText = useMemo(() => {
        switch (action) {
            case 'creating':
                return t('dashboardExplorer.cancelCreationTooltip');
            case 'editing':
                return t('dashboardExplorer.cancelEditingTooltip');
            case 'viewing':
                return '';
            default:
                return assertUnreachable(
                    action,
                    `${action} is not a valid action`,
                );
        }
    }, [action, t]);

    const bannerText = useMemo(() => {
        switch (action) {
            case 'creating':
                return dashboardName
                    ? t('dashboardExplorer.creatingInNamed', {
                          name: dashboardName,
                      })
                    : t('dashboardExplorer.creating');
            case 'editing':
                return dashboardName
                    ? t('dashboardExplorer.editingInNamed', {
                          name: dashboardName,
                      })
                    : t('dashboardExplorer.editing');
            case 'viewing':
                return dashboardName
                    ? t('dashboardExplorer.viewingInNamed', {
                          name: dashboardName,
                      })
                    : t('dashboardExplorer.viewing');
            default:
                return assertUnreachable(
                    action,
                    `${action} is not a valid action`,
                );
        }
    }, [action, dashboardName, t]);

    const handleOnCancel = useCallback(() => {
        if (!projectUrlIdentifier) {
            return;
        }
        // Cancel the action and navigate back to the dashboard, restoring the existing state (in case there were some unsaved changes)
        // Similar to the behaviour from `SaveToDashboard`
        // so do not clear the storage here
        setIsCancelling(true);

        let returnUrl = `/projects/${projectUrlIdentifier}/dashboards/${dashboardSlug ?? dashboardUuid}/${
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
    }, [
        dashboardSlug,
        dashboardUuid,
        activeTabUuid,
        navigate,
        projectUrlIdentifier,
        savedQueryUuid,
    ]);

    return (
        <>
            <MantineIcon icon={IconInfoCircle} color="white" size="sm" />

            <Text c="white" fw={500} fz="xs" mx={4}>
                {isCancelling ? t('dashboardExplorer.cancelling') : bannerText}
            </Text>

            <Tooltip
                // Hide tooltip when viewing the chart because the button copy is sufficient
                disabled={action === 'viewing'}
                label={cancelButtonTooltipText}
                position="bottom"
                maw={350}
            >
                <Button
                    onClick={handleOnCancel}
                    size="compact-xs"
                    ml="md"
                    variant="white"
                >
                    {cancelButtonText}
                </Button>
            </Tooltip>
        </>
    );
};
