import { type Account } from '@lightdash/common';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { type OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';

type TrackFirstQueryArguments = {
    account: Account;
    organizationUuid: string;
    onboardingModel: Pick<
        OnboardingModel,
        'getByOrganizationUuid' | 'setRanQueryAtIfUnset'
    >;
    analytics: Pick<LightdashAnalytics, 'trackAccount'>;
};

export const trackFirstQuery = async ({
    account,
    organizationUuid,
    onboardingModel,
    analytics,
}: TrackFirstQueryArguments): Promise<void> => {
    const { ranQueryAt } =
        await onboardingModel.getByOrganizationUuid(organizationUuid);
    if (ranQueryAt) {
        return;
    }
    if (!(await onboardingModel.setRanQueryAtIfUnset(organizationUuid))) {
        return;
    }
    analytics.trackAccount(account, {
        event: 'onboarding.step_completed',
        properties: {
            step: 'first_query',
            stepIndex: 5,
            onboardingFlow: 'new',
            organizationId: organizationUuid,
        },
    });
};
