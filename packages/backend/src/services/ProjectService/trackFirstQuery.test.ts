import { fromApiKey, fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { trackFirstQuery } from './trackFirstQuery';

const ORGANIZATION_UUID = defaultSessionUser.organizationUuid!;

const setup = ({
    ranQueryAt = null,
    updated = true,
}: {
    ranQueryAt?: Date | null;
    updated?: boolean;
} = {}) => {
    const onboardingModel = {
        getByOrganizationUuid: vi.fn(async () => ({
            ranQueryAt,
            shownSuccessAt: null,
            playgroundProjectDeletedAt: null,
        })),
        setRanQueryAtIfUnset: vi.fn(async () => updated),
    };
    const analytics = { trackAccount: vi.fn() };
    return { onboardingModel, analytics };
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
