import { subject } from '@casl/ability';
import { type ContentVerificationInfo } from '../types/contentVerification';

/**
 * Structural can-check so both MemberAbility and CaslAuditWrapper are accepted.
 * Bivariant hack matches CASL's method typing across Ability vs audit wrappers.
 */
type AbilityCanCheck = {
    can: {
        bivarianceHack(action: string, caslSubject: unknown): boolean;
    }['bivarianceHack'];
};

/**
 * Whether the actor may mutate (update/delete/move) verified charts or
 * dashboards. Unverified content is unrestricted by this check.
 *
 * Granted by default to project developers/admins and org admins via
 * `manage:VerifiedContent`. The content's verifier is also allowed so they
 * can iterate without needing the scope (pairs with keep-badge-on-own-edit).
 */
export const canMutateVerifiedContent = (
    ability: AbilityCanCheck,
    {
        organizationUuid,
        projectUuid,
    }: { organizationUuid: string; projectUuid: string },
    verification: ContentVerificationInfo | null | undefined,
    userUuid: string | undefined,
): boolean => {
    if (!verification) {
        return true;
    }

    if (
        ability.can(
            'manage',
            subject('VerifiedContent', {
                organizationUuid,
                projectUuid,
            }),
        )
    ) {
        return true;
    }

    return !!userUuid && verification.verifiedBy.userUuid === userUuid;
};
