import { ForbiddenError } from '@lightdash/common';
import { User } from '@sentry/types';
import {
    projectModel,
    savedChartModel,
    shareModel,
    validationModel,
} from '../../models/models';
import {
    FullShareUrl,
    FullShareUrlWithoutParams,
    SampleShareUrl,
    ShareUrlWithoutParams,
    UserFromAnotherOrg,
} from '../ShareService/ShareService.mock';
import { ValidationService } from './ValidationService';
import { chart, config, explore } from './ValidationService.mock';

jest.mock('../../models/models', () => ({
    savedChartModel: {
        find: jest.fn(async () => chart),
    },
    projectModel: {
        getExploresFromCache: jest.fn(async () => explore),
    },
}));

describe('share', () => {
    const shareService = new ValidationService({
        validationModel,
        projectModel,
        savedChartModel,
        lightdashConfig: config,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('Should validate project without errors', async () => {
        // TODO
    });
    it('Should validate project with errors', async () => {
        // TODO
    });
});
