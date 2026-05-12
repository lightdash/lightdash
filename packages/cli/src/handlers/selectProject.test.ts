import { ProjectType } from '@lightdash/common';
import { Config } from '../config';
import { lightdashApi } from './dbt/apiClient';
import { logSelectedProject, selectProject } from './selectProject';

jest.mock('inquirer');
jest.mock('../analytics/analytics');
jest.mock('./dbt/apiClient', () => ({
    lightdashApi: jest.fn(),
}));
jest.mock('../config', () => ({
    unsetPreviewProject: jest.fn().mockResolvedValue(undefined),
}));

const mockLightdashApi = lightdashApi as jest.MockedFunction<
    typeof lightdashApi
>;

const PREVIEW_UUID = '00000000-0000-0000-0000-000000000001';
const MAIN_UUID = '00000000-0000-0000-0000-000000000002';

const mockPreviewProjectResponse = (uuid: string) => {
    mockLightdashApi.mockResolvedValueOnce({
        projectUuid: uuid,
        type: ProjectType.PREVIEW,
        // The rest of the Project shape is irrelevant for this test
    } as never);
};

describe('selectProject', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('returns the preview project (without prompting) when the stored main and preview UUIDs are the same', async () => {
        // This is the misconfigured state produced by an older `set-project`
        // that allowed selecting a preview project as the default. Both
        // entries point at the same preview UUID, so the prompt would
        // otherwise label the same project as both "Preview" and "Production".
        mockPreviewProjectResponse(PREVIEW_UUID);

        const config: Config = {
            context: {
                project: PREVIEW_UUID,
                projectName: 'my-preview',
                previewProject: PREVIEW_UUID,
                previewName: 'my-preview',
            },
        };

        const result = await selectProject(config);

        expect(result).toEqual({
            projectUuid: PREVIEW_UUID,
            isPreview: true,
        });
    });

    it('returns the main project when only the main project is configured', async () => {
        const config: Config = {
            context: {
                project: MAIN_UUID,
                projectName: 'main',
            },
        };

        const result = await selectProject(config);

        expect(result).toEqual({
            projectUuid: MAIN_UUID,
            isPreview: false,
        });
        expect(mockLightdashApi).not.toHaveBeenCalled();
    });
});

describe('logSelectedProject', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        consoleErrorSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    const getLoggedMessage = (): string =>
        consoleErrorSpy.mock.calls.map((call) => String(call[0])).join('\n');

    it('shows the config project name when the selected UUID matches the config project', () => {
        const config: Config = {
            context: {
                project: MAIN_UUID,
                projectName: 'main',
            },
        };

        logSelectedProject(
            { projectUuid: MAIN_UUID, isPreview: false },
            config,
            'Uploading to',
        );

        const output = getLoggedMessage();
        expect(output).toContain('Uploading to project:');
        expect(output).toContain('"main"');
    });

    it('shows the UUID (not the config project name) when --project overrides to a different project', () => {
        const OVERRIDE_UUID = '00000000-0000-0000-0000-000000000099';
        const config: Config = {
            context: {
                project: MAIN_UUID,
                projectName: 'main',
            },
        };

        logSelectedProject(
            { projectUuid: OVERRIDE_UUID, isPreview: false },
            config,
            'Uploading to',
        );

        const output = getLoggedMessage();
        expect(output).toContain('Uploading to project:');
        expect(output).toContain(OVERRIDE_UUID);
        expect(output).not.toContain('"main"');
    });

    it('shows the preview name when selection is a preview', () => {
        const config: Config = {
            context: {
                project: MAIN_UUID,
                projectName: 'main',
                previewProject: PREVIEW_UUID,
                previewName: 'my-preview',
            },
        };

        logSelectedProject(
            { projectUuid: PREVIEW_UUID, isPreview: true },
            config,
            'Uploading to',
        );

        const output = getLoggedMessage();
        expect(output).toContain('Uploading to preview project:');
        expect(output).toContain('"my-preview"');
    });
});
