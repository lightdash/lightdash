import { type Account } from '@lightdash/common';
import {
    type LightdashAnalytics,
    type OnboardingFlow,
} from '../../analytics/LightdashAnalytics';
import {
    ONBOARDING_AGENT_PAT_DESCRIPTION_PREFIX,
    type OnboardingModel,
} from '../../models/OnboardingModel/OnboardingModel';
import { type UserModel } from '../../models/UserModel';

type TrackFirstQueryArguments = {
    account: Account;
    organizationUuid: string;
    onboardingFlow: OnboardingFlow;
    onboardingModel: Pick<
        OnboardingModel,
        'getByOrganizationUuid' | 'setRanQueryAtIfUnset'
    >;
    userModel: Pick<UserModel, 'findSessionUserByPersonalAccessToken'>;
    analytics: Pick<LightdashAnalytics, 'trackAccount'>;
};

// The onboarding agent queries with a PAT minted for the user, marked by its description
const isOnboardingAgentAccount = async (
    account: Account,
    userModel: TrackFirstQueryArguments['userModel'],
): Promise<boolean> => {
    if (account.authentication.type !== 'pat') return false;
    const lookup = await userModel.findSessionUserByPersonalAccessToken(
        account.authentication.source.replace(/^ApiKey /, ''),
    );
    return (
        lookup?.data.personalAccessToken.description.startsWith(
            ONBOARDING_AGENT_PAT_DESCRIPTION_PREFIX,
        ) ?? false
    );
};

export const trackFirstQuery = async ({
    account,
    organizationUuid,
    onboardingFlow,
    onboardingModel,
    userModel,
    analytics,
}: TrackFirstQueryArguments): Promise<void> => {
    const { ranQueryAt } =
        await onboardingModel.getByOrganizationUuid(organizationUuid);
    if (ranQueryAt || (await isOnboardingAgentAccount(account, userModel))) {
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
            onboardingFlow,
            organizationId: organizationUuid,
        },
    });
};
