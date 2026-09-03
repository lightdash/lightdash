import { subject } from '@casl/ability';
import {
    type ContentVerificationInfo,
    type SavedChart,
} from '@lightdash/common';
import { type VerificationSavePrompt } from '../components/Explorer/SaveChartButton';
import useApp from '../providers/App/useApp';

/**
 * How a save treats the verification badge, or undefined when unverified.
 * The verifier keeps their own badge without the scope, as elsewhere.
 */
export const getVerificationSavePrompt = ({
    verification,
    canManageContentVerification,
    userUuid,
}: {
    verification: ContentVerificationInfo | null | undefined;
    canManageContentVerification: boolean;
    userUuid: string | undefined;
}): VerificationSavePrompt | undefined => {
    if (!verification) return undefined;

    const isOwnVerification = verification.verifiedBy.userUuid === userUuid;

    return canManageContentVerification || isOwnVerification
        ? 'confirm-keep'
        : 'warn-removal';
};

/** Shared by SavedChartsHeader and, where it is absent, ExplorerHeader. */
export const useVerificationSavePrompt = (
    savedChart: Pick<SavedChart, 'verification' | 'projectUuid'> | undefined,
): VerificationSavePrompt | undefined => {
    const { user } = useApp();

    const canManageContentVerification =
        user.data?.ability?.can(
            'manage',
            subject('ContentVerification', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid: savedChart?.projectUuid,
            }),
        ) === true;

    return getVerificationSavePrompt({
        verification: savedChart?.verification,
        canManageContentVerification,
        userUuid: user.data?.userUuid,
    });
};
