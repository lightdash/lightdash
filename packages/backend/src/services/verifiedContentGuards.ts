import { subject } from '@casl/ability';
import {
    assertUnreachable,
    canMutateVerifiedContent,
    ContentType,
    ForbiddenError,
    type ContentVerificationInfo,
    type SessionUser,
} from '@lightdash/common';
import { type ContentVerificationModel } from '../models/ContentVerificationModel';

type VerifiedContentTarget = {
    contentType: ContentType;
    contentUuid: string;
    projectUuid: string;
    organizationUuid: string;
};

type VerifiedContentGuardDeps = {
    contentVerificationModel: Pick<ContentVerificationModel, 'getByContent'>;
    ability: Parameters<typeof canMutateVerifiedContent>[0];
    user: Pick<SessionUser, 'userUuid'>;
};

const contentTypeLabel = (contentType: ContentType): string => {
    switch (contentType) {
        case ContentType.CHART:
            return 'chart';
        case ContentType.DASHBOARD:
            return 'dashboard';
        case ContentType.DATA_APP:
            return 'data app';
        case ContentType.SPACE:
        case ContentType.DOCUMENT:
            return 'content';
        default:
            return assertUnreachable(contentType, 'Unknown content type');
    }
};

/**
 * Throws unless the actor may mutate the content given its current
 * verification. Unverified content always passes.
 */
export const assertCanMutateVerifiedContent = async (
    { contentVerificationModel, ability, user }: VerifiedContentGuardDeps,
    {
        contentType,
        contentUuid,
        projectUuid,
        organizationUuid,
    }: VerifiedContentTarget,
): Promise<void> => {
    const verification = await contentVerificationModel.getByContent(
        contentType,
        contentUuid,
    );
    if (
        !canMutateVerifiedContent(
            ability,
            { organizationUuid, projectUuid },
            verification,
            user.userUuid,
        )
    ) {
        throw new ForbiddenError(
            `This ${contentTypeLabel(contentType)} is verified. You need permission to edit verified content, or ask an admin to unverify it first.`,
        );
    }
};

/**
 * The verification that should survive an update by this actor: kept when
 * they manage verification or verified it themselves, dropped otherwise.
 * `preserveVerification` forces the outcome; forcing `true` without the
 * rights to keep it is an error.
 */
export const getVerificationAfterUpdate = async (
    { contentVerificationModel, ability, user }: VerifiedContentGuardDeps,
    {
        contentType,
        contentUuid,
        projectUuid,
        organizationUuid,
        preserveVerification,
    }: VerifiedContentTarget & { preserveVerification?: boolean },
): Promise<ContentVerificationInfo | null> => {
    const verification = await contentVerificationModel.getByContent(
        contentType,
        contentUuid,
    );
    if (!verification || preserveVerification === false) return null;

    const canManageVerification = ability.can(
        'manage',
        subject('ContentVerification', {
            organizationUuid,
            projectUuid,
            metadata: { contentUuid },
        }),
    );
    const isVerifier = verification.verifiedBy.userUuid === user.userUuid;

    if (canManageVerification || isVerifier) return verification;

    if (preserveVerification === true) {
        throw new ForbiddenError(
            `Only admins or the verifier can preserve ${contentTypeLabel(contentType)} verification`,
        );
    }

    return null;
};
