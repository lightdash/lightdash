import { AbilityBuilder, Ability } from '@casl/ability';
import { describe, expect, it } from 'vitest';
import { type ContentVerificationInfo } from '../types/contentVerification';
import { canMutateVerifiedContent } from './canMutateVerifiedContent';
import { type MemberAbility } from './types';

const verification: ContentVerificationInfo = {
    verifiedBy: {
        userUuid: 'verifier-uuid',
        firstName: 'Vera',
        lastName: 'Fier',
    },
    verifiedAt: new Date('2026-01-01'),
};

const project = {
    organizationUuid: 'org-1',
    projectUuid: 'proj-1',
};

const buildAbility = (grantVerifiedContent: boolean): MemberAbility => {
    const { can, build } = new AbilityBuilder<MemberAbility>(Ability);
    if (grantVerifiedContent) {
        can('manage', 'VerifiedContent', {
            organizationUuid: project.organizationUuid,
            projectUuid: project.projectUuid,
        });
    }
    return build();
};

describe('canMutateVerifiedContent', () => {
    it('allows mutation when content is not verified', () => {
        expect(
            canMutateVerifiedContent(
                buildAbility(false),
                project,
                null,
                'anyone',
            ),
        ).toBe(true);
    });

    it('allows mutation when the actor has manage:VerifiedContent', () => {
        expect(
            canMutateVerifiedContent(
                buildAbility(true),
                project,
                verification,
                'editor-uuid',
            ),
        ).toBe(true);
    });

    it('allows mutation when the actor is the verifier', () => {
        expect(
            canMutateVerifiedContent(
                buildAbility(false),
                project,
                verification,
                'verifier-uuid',
            ),
        ).toBe(true);
    });

    it('blocks mutation for editors who are not the verifier', () => {
        expect(
            canMutateVerifiedContent(
                buildAbility(false),
                project,
                verification,
                'editor-uuid',
            ),
        ).toBe(false);
    });
});
