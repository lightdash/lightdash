import { type Dashboard } from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import useIsEmbedded from '../../ee/providers/Embed/useIsEmbedded';
import useToaster from '../toaster/useToaster';
import { getTileLinkPath } from './useTileLink';

type SavedToDashboard = {
    projectUrlIdentifier: string;
    dashboard: Pick<Dashboard, 'name' | 'slug' | 'hasUnpublishedChanges'>;
    tileUuid: string;
    tabUuid: string | null;
};

/** Success toast for a chart saved onto a dashboard, with a link to its new tile. */
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
                    ? {
                          title: 'Dashboard draft saved for review',
                          subtitle:
                              'Only you can see these changes until a reviewer writes them back to the repo.',
                      }
                    : { title: `Saved to "${dashboard.name}"` }),
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
