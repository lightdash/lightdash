import { ParseError } from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { updateFile } from '../../clients/github/Github';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { GitIntegrationService } from './GitIntegrationService';
import {
    CUSTOM_DIMENSION,
    CUSTOM_METRIC,
    EXPECTED_SCHEMA_YML_WITH_CUSTOM_DIMENSION,
    EXPECTED_SCHEMA_YML_WITH_CUSTOM_METRIC,
    GITHUB_APP_MODEL,
    INVALID_SCHEMA_YML,
    PROJECT_MODEL,
    SAVED_CHART_MODEL,
    SCHEMA_JSON,
    SCHEMA_YML,
    SPACE_MODEL,
} from './GitIntegrationService.mock';

jest.mock('../../clients/github/Github.ts', () => ({
    getFileContent: jest.fn().mockImplementation(() => ({
        content: SCHEMA_YML,
        sha: 'sha',
    })),
    updateFile: jest.fn().mockImplementation(() => undefined),
}));

// Mock the GitIntegrationService class and expose protected methods
class TestGitIntegrationService extends GitIntegrationService {
    static loadYamlSchema = GitIntegrationService.loadYamlSchema;
}

describe('GitIntegrationService', () => {
    const service = new GitIntegrationService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        savedChartModel: SAVED_CHART_MODEL as unknown as SavedChartModel,
        projectModel: PROJECT_MODEL as unknown as ProjectModel,
        spaceModel: SPACE_MODEL as unknown as SpaceModel,
        githubAppInstallationsModel:
            GITHUB_APP_MODEL as unknown as GithubAppInstallationsModel,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('loadYamlSchema', () => {
        it('should load the yaml schema', async () => {
            const result = await TestGitIntegrationService.loadYamlSchema(
                SCHEMA_YML,
            );
            expect(result.toJS()).toEqual(SCHEMA_JSON);
        });

        it('should throw error with invalid yaml schema', async () => {
            await expect(
                TestGitIntegrationService.loadYamlSchema(INVALID_SCHEMA_YML),
            ).rejects.toThrowError(ParseError);
        });
    });

    describe('updateFile', () => {
        it('should update the file for custom metrics', async () => {
            await service.updateFile({
                owner: 'owner',
                repo: 'repo',
                path: 'path',
                projectUuid: 'projectUuid',
                type: 'customMetrics',
                fields: [CUSTOM_METRIC],
                branch: 'branch',
                token: 'token',
                quoteChar: `'`,
            });
            expect(updateFile).toHaveBeenCalledTimes(1);
            expect(updateFile).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: EXPECTED_SCHEMA_YML_WITH_CUSTOM_METRIC,
                }),
            );
        });
        it('should update the file for custom dimensions', async () => {
            await service.updateFile({
                owner: 'owner',
                repo: 'repo',
                path: 'path',
                projectUuid: 'projectUuid',
                type: 'customDimensions',
                fields: [CUSTOM_DIMENSION],
                branch: 'branch',
                token: 'token',
                quoteChar: `'`,
            });
            expect(updateFile).toHaveBeenCalledTimes(1);
            // @ts-expect-error
            expect(updateFile.mock.calls[0][0].content).toEqual(
                EXPECTED_SCHEMA_YML_WITH_CUSTOM_DIMENSION,
            );
        });
    });
});
