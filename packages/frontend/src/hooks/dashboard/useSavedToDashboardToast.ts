import { type Dashboard } from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import useIsEmbedded from '../../ee/providers/Embed/useIsEmbedded';
import useToaster from '../toaster/useToaster';
import { getTileLinkPath } from './useTileLink';

export const DASHBOARD_DRAFT_SAVED_TOAST = {
    title: 'Dashboard draft saved for review',
    subtitle:
        'Only you can see these changes until a reviewer writes them back to the repo.',
};

type SavedToDashboard = {
    projectUrlIdentifier: string;
    dashboard: Pick<Dashboard, 'name' | 'slug' | 'hasUnpublishedChanges'>;
    tileUuid: string;
    tabUuid: string | null;
};

export const useSavedToDashboardToast = () => {
    const navigate = useNavigate();
    const isEmbedded = useIsEmbedded();
    const { showToastSuccess } = useToaster();

    return useCallback(
        ({
            projectUrlIdentifier,
            dashboard,
            tileUuid,
            tabUuid,
        }: SavedToDashboard) => {
            showToastSuccess({
                ...(dashboard.hasUnpublishedChanges
                    ? DASHBOARD_DRAFT_SAVED_TOAST
                    : { title: `Saved to "${dashboard.name}"` }),
                autoClose: 10000,
                action: isEmbedded
                    ? undefined
                    : {
                          children: 'Open dashboard',
                          icon: IconArrowRight,
                          onClick: () =>
                              navigate(
                                  getTileLinkPath({
                                      projectUrlIdentifier,
                                      dashboardSlug: dashboard.slug,
                                      tileUuid,
                                      tileTabUuid: tabUuid,
                                      search: '',
                                  }),
                              ),
                      },
            });
        },
        [isEmbedded, navigate, showToastSuccess],
    );
};
