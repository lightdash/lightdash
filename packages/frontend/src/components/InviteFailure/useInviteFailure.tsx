import {
    FeatureFlags,
    getInviteLinkFailureReason,
    type ApiError,
} from '@lightdash/common';
import { type ReactElement } from 'react';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import PageSpinner from '../PageSpinner';
import { InviteFailurePage } from './InviteFailurePage';

export const useInviteFailure = ({
    inviteCode,
    redirectUrl,
    errors,
    flashMessages,
}: {
    inviteCode: string | undefined;
    redirectUrl: string;
    errors: (ApiError | null | undefined)[];
    flashMessages: {
        data?: { error?: string[] };
        isInitialLoading: boolean;
    };
}): {
    ssoRedirectUrl: string;
    page: ReactElement | null;
} => {
    const connectJourneyFlag = useServerFeatureFlag(
        FeatureFlags.ConnectJourney,
    );
    const isEnabled = connectJourneyFlag.data?.enabled === true;
    const inviteError = errors.find((error) => !!error) ?? null;
    const reason = inviteError
        ? getInviteLinkFailureReason(
              inviteError.error.name,
              inviteError.error.message,
          )
        : getInviteLinkFailureReason(
              null,
              flashMessages.data?.error?.join('\n') ?? '',
          );
    const getPage = (): ReactElement | null => {
        if (
            connectJourneyFlag.isInitialLoading ||
            (isEnabled && flashMessages.isInitialLoading)
        ) {
            return <PageSpinner />;
        }
        return isEnabled && inviteCode && reason ? (
            <InviteFailurePage inviteCode={inviteCode} reason={reason} />
        ) : null;
    };
    return {
        ssoRedirectUrl: isEnabled ? `/invite/${inviteCode}` : redirectUrl,
        page: getPage(),
    };
};
