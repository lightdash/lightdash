import {
    ChartKind,
    assertUnreachable,
    getChartKind,
    type ApiError,
} from '@lightdash/common';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getDashboard } from '../../../hooks/dashboard/useDashboard';
import useToaster from '../../../hooks/toaster/useToaster';
import { getSavedQuery } from '../../../hooks/useSavedQuery';
import {
    type SelectedChart,
    type SelectedDashboard,
} from '../AppResourcePicker';
import { parseResourceLink } from '../utils/parseResourceLink';

/** `not-a-link` is ordinary text the caller should keep treating as a search
 *  term; `rejected` was a link, and the user has been told why it didn't attach. */
export type AttachLinkOutcome = 'attached' | 'rejected' | 'not-a-link';

/** Which kind of link the calling picker accepts. */
export type AttachableResourceType = 'chart' | 'dashboard';

/**
 * Resolves a pasted Lightdash link into an attachable data-app resource. Goes
 * by uuid/slug, so it reaches content the pickers' name search cannot — most
 * notably charts saved inside a dashboard, which content search omits.
 */
export const useAttachResourceLink = ({
    projectUuid,
    onSelectChart,
    onSelectDashboard,
}: {
    projectUuid: string | undefined;
    onSelectChart: (chart: SelectedChart) => void;
    onSelectDashboard: (dashboard: SelectedDashboard) => void;
}) => {
    const { t } = useTranslation('apps');
    const { showToastError, showToastApiError } = useToaster();
    const [isResolvingLink, setIsResolvingLink] = useState(false);

    const attachFromLink = useCallback(
        async (
            input: string,
            accepts: AttachableResourceType,
        ): Promise<AttachLinkOutcome> => {
            const link = parseResourceLink(input);
            if (!link || !projectUuid) return 'not-a-link';

            if (
                (link.type === 'chart' || link.type === 'dashboard') &&
                link.type !== accepts
            ) {
                showToastError({
                    title:
                        link.type === 'chart'
                            ? t('attachLink.chartLink.title')
                            : t('attachLink.dashboardLink.title'),
                    subtitle:
                        link.type === 'chart'
                            ? t('attachLink.chartLink.subtitle')
                            : t('attachLink.dashboardLink.subtitle'),
                });
                return 'rejected';
            }

            switch (link.type) {
                case 'shortLink':
                    showToastError({
                        title: t('attachLink.shortLink.title'),
                        subtitle: t('attachLink.shortLink.subtitle'),
                    });
                    return 'rejected';
                case 'exploreState':
                    showToastError({
                        title: t('attachLink.exploration.title'),
                        subtitle: t('attachLink.exploration.subtitle'),
                    });
                    return 'rejected';
                case 'chart':
                    if (link.projectUuid !== projectUuid) {
                        showToastError({
                            title: t('attachLink.otherProject.chart'),
                            subtitle: t('attachLink.otherProject.subtitle'),
                        });
                        return 'rejected';
                    }
                    setIsResolvingLink(true);
                    try {
                        const chart = await getSavedQuery(
                            link.chartUuidOrSlug,
                            projectUuid,
                        );
                        onSelectChart({
                            uuid: chart.uuid,
                            name: chart.name,
                            chartKind:
                                getChartKind(
                                    chart.chartConfig.type,
                                    chart.chartConfig.config,
                                ) ?? ChartKind.VERTICAL_BAR,
                            includeSampleData: false,
                            linkLive: false,
                        });
                        return 'attached';
                    } catch (e) {
                        showToastApiError({
                            title: t('attachLink.chartFailed'),
                            apiError: (e as ApiError).error,
                        });
                        return 'rejected';
                    } finally {
                        setIsResolvingLink(false);
                    }
                case 'dashboard':
                    if (link.projectUuid !== projectUuid) {
                        showToastError({
                            title: t('attachLink.otherProject.dashboard'),
                            subtitle: t('attachLink.otherProject.subtitle'),
                        });
                        return 'rejected';
                    }
                    setIsResolvingLink(true);
                    try {
                        const dashboard = await getDashboard(
                            link.dashboardUuidOrSlug,
                            projectUuid,
                        );
                        onSelectDashboard({
                            uuid: dashboard.uuid,
                            name: dashboard.name,
                            includeSampleData: false,
                        });
                        return 'attached';
                    } catch (e) {
                        showToastApiError({
                            title: t('attachLink.dashboardFailed'),
                            apiError: (e as ApiError).error,
                        });
                        return 'rejected';
                    } finally {
                        setIsResolvingLink(false);
                    }
                default:
                    return assertUnreachable(link, 'Unknown resource link');
            }
        },
        [
            projectUuid,
            onSelectChart,
            onSelectDashboard,
            showToastError,
            showToastApiError,
            t,
        ],
    );

    return { attachFromLink, isResolvingLink };
};
