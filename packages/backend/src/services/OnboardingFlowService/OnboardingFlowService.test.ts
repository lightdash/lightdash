import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    OnboardingStepStatus,
    OnboardingStepType,
    PossibleAbilities,
    ProjectType,
} from '@lightdash/common';
import { fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { OnboardingFlowService } from './OnboardingFlowService';

const projectUuid = '11111111-1111-4111-8111-111111111111';
const organizationUuid = '22222222-2222-4222-8222-222222222222';

const projectModel = {
    getSummary: vi.fn(async () => ({
        projectUuid,
        organizationUuid,
        name: 'Onboarding project',
        type: ProjectType.DEFAULT,
        upstreamProjectUuid: undefined,
        createdByUserUuid: defaultSessionUser.userUuid,
    })),
};

const onboardingProjectStateModel = {
    getAll: vi.fn(async () => []),
    upsert: vi.fn(),
};

const getAccount = (ability: Ability<PossibleAbilities>) =>
    fromSession(
        {
            ...defaultSessionUser,
            ability,
        },
        'session-cookie',
    );

const getService = () =>
    new OnboardingFlowService({
        projectModel: projectModel as never,
        onboardingProjectStateModel: onboardingProjectStateModel as never,
    });

describe('OnboardingFlowService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rejects state reads without project view access', async () => {
        await expect(
            getService().getState(
                getAccount(new Ability<PossibleAbilities>([])),
                projectUuid,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(onboardingProjectStateModel.getAll).not.toHaveBeenCalled();
    });

    it('rejects step updates without compile project access', async () => {
        const account = getAccount(
            new Ability<PossibleAbilities>([
                {
                    subject: 'Project',
                    action: 'view',
                    conditions: { projectUuid },
                },
            ]),
        );

        await expect(
            getService().updateStep(
                account,
                projectUuid,
                OnboardingStepType.CONNECT,
                OnboardingStepStatus.IN_PROGRESS,
                null,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(onboardingProjectStateModel.upsert).not.toHaveBeenCalled();
    });
});
