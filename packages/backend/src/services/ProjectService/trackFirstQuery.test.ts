import { fromApiKey, fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { ONBOARDING_AGENT_PAT_DESCRIPTION_PREFIX } from '../../models/OnboardingModel/OnboardingModel';
import { trackFirstQuery } from './trackFirstQuery';

const ORGANIZATION_UUID = defaultSessionUser.organizationUuid!;

const patLookup = (description: string) => ({
    data: {
        user: defaultSessionUser,
        personalAccessToken: {
            uuid: 'pat-uuid',
            createdAt: new Date(),
            lastUsedAt: null,
            rotatedAt: null,
            expiresAt: null,
            description,
        },
    },
    cacheHit: true,
});

const setup = ({
    ranQueryAt = null,
    updated = true,
    patDescription = 'My token',
}: {
    ranQueryAt?: Date | null;
    updated?: boolean;
    patDescription?: string;
} = {}) => {
    const onboardingModel = {
        getByOrganizationUuid: vi.fn(async () => ({
            ranQueryAt,
            shownSuccessAt: null,
            playgroundProjectDeletedAt: null,
        })),
        setRanQueryAtIfUnset: vi.fn(async () => updated),
    };
    const userModel = {
        findSessionUserByPersonalAccessToken: vi.fn(async () =>
            patLookup(patDescription),
        ),
    };
    const analytics = { trackAccount: vi.fn() };
    return { onboardingModel, userModel, analytics };
};

describe('trackFirstQuery', () => {
    test('marks the first query and tracks it once', async () => {
        const deps = setup();
        const account = fromSession(defaultSessionUser);
        await trackFirstQuery({
            account,
            organizationUuid: ORGANIZATION_UUID,
            onboardingFlow: 'new',
            ...deps,
        });
        expect(deps.onboardingModel.setRanQueryAtIfUnset).toHaveBeenCalledWith(
            ORGANIZATION_UUID,
        );
        expect(deps.analytics.trackAccount).toHaveBeenCalledExactlyOnceWith(
            account,
            {
                event: 'onboarding.step_completed',
                properties: {
                    step: 'first_query',
                    stepIndex: 5,
                    onboardingFlow: 'new',
                    organizationId: ORGANIZATION_UUID,
                },
            },
        );
        expect(
            deps.userModel.findSessionUserByPersonalAccessToken,
        ).not.toHaveBeenCalled();
    });

    test('does not track when a concurrent query already set the row', async () => {
        const deps = setup({ updated: false });
        await trackFirstQuery({
            account: fromSession(defaultSessionUser),
            organizationUuid: ORGANIZATION_UUID,
            onboardingFlow: 'new',
            ...deps,
        });
        expect(deps.analytics.trackAccount).not.toHaveBeenCalled();
    });

    test('skips the write once the first query is recorded', async () => {
        const deps = setup({ ranQueryAt: new Date() });
        await trackFirstQuery({
            account: fromSession(defaultSessionUser),
            organizationUuid: ORGANIZATION_UUID,
            onboardingFlow: 'legacy',
            ...deps,
        });
        expect(
            deps.onboardingModel.setRanQueryAtIfUnset,
        ).not.toHaveBeenCalled();
        expect(deps.analytics.trackAccount).not.toHaveBeenCalled();
    });

    test('ignores queries made with the onboarding agent token', async () => {
        const deps = setup({
            patDescription: `${ONBOARDING_AGENT_PAT_DESCRIPTION_PREFIX}run-uuid`,
        });
        await trackFirstQuery({
            account: fromApiKey(defaultSessionUser, 'ApiKey ldpat_agent'),
            organizationUuid: ORGANIZATION_UUID,
            onboardingFlow: 'new',
            ...deps,
        });
        expect(
            deps.userModel.findSessionUserByPersonalAccessToken,
        ).toHaveBeenCalledWith('ldpat_agent');
        expect(
            deps.onboardingModel.setRanQueryAtIfUnset,
        ).not.toHaveBeenCalled();
        expect(deps.analytics.trackAccount).not.toHaveBeenCalled();
    });

    test('counts queries made with the user own token', async () => {
        const deps = setup();
        await trackFirstQuery({
            account: fromApiKey(defaultSessionUser, 'ApiKey ldpat_user'),
            organizationUuid: ORGANIZATION_UUID,
            onboardingFlow: 'new',
            ...deps,
        });
        expect(deps.analytics.trackAccount).toHaveBeenCalledOnce();
    });
});
