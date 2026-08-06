import { vi } from 'vitest';
import type { ReviewJudgeConfigResolver } from './reviewJudgeModel';

export const createReviewJudgeConfigResolverMock =
    (): ReviewJudgeConfigResolver => ({
        getCopilotConfig:
            vi.fn<ReviewJudgeConfigResolver['getCopilotConfig']>(),
        getReviewJudgeAvailability:
            vi.fn<ReviewJudgeConfigResolver['getReviewJudgeAvailability']>(),
    });
