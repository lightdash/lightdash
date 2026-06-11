import { OrganizationProject, ProjectType } from '@lightdash/common';
import inquirer from 'inquirer';
import { setProject as setProjectConfig } from '../config';
import GlobalState from '../globalState';
import { lightdashApi } from './dbt/apiClient';
import { setProjectCommand } from './setProject';

jest.mock('inquirer');
jest.mock('../analytics/analytics');
jest.mock('./dbt/apiClient', () => ({
    lightdashApi: jest.fn(),
}));
jest.mock('../config', () => ({
    getConfig: jest.fn().mockResolvedValue({ context: {} }),
    setProject: jest.fn().mockResolvedValue(undefined),
    unsetProject: jest.fn().mockResolvedValue(undefined),
}));

const mockLightdashApi = lightdashApi as jest.MockedFunction<
    typeof lightdashApi
>;
const mockInquirer = inquirer as jest.Mocked<typeof inquirer>;
const mockSetProjectConfig = setProjectConfig as jest.MockedFunction<
    typeof setProjectConfig
>;

const MAIN_UUID = '00000000-0000-0000-0000-000000000001';
const PREVIEW_UUID = '00000000-0000-0000-0000-000000000002';

const buildProjects = (): OrganizationProject[] =>
    [
        {
            projectUuid: MAIN_UUID,
            name: 'main-project',
            type: ProjectType.DEFAULT,
        },
        {
            projectUuid: PREVIEW_UUID,
            name: 'a-preview',
            type: ProjectType.PREVIEW,
        },
    ] as OrganizationProject[];

describe('setProjectCommand', () => {
    const originalIsNonInteractive = GlobalState.isNonInteractive;

    beforeEach(() => {
        jest.clearAllMocks();
        GlobalState.isNonInteractive = jest.fn().mockReturnValue(false);
    });

    afterAll(() => {
        GlobalState.isNonInteractive = originalIsNonInteractive;
    });

    it('does not offer preview projects in the interactive list', async () => {
        mockLightdashApi.mockResolvedValueOnce(buildProjects() as never);
        const promptMock = jest
            .fn()
            .mockResolvedValueOnce({ project: MAIN_UUID });
        mockInquirer.prompt = promptMock as never;

        await setProjectCommand();

        const promptArgs = promptMock.mock.calls[0][0];
        const choices = promptArgs[0].choices.map(
            (c: { name: string; value: string }) => c.value,
        );
        expect(choices).toContain(MAIN_UUID);
        expect(choices).not.toContain(PREVIEW_UUID);
        expect(mockSetProjectConfig).toHaveBeenCalledWith(
            MAIN_UUID,
            'main-project',
        );
    });

    it('throws when --uuid points to a preview project', async () => {
        mockLightdashApi.mockResolvedValueOnce(buildProjects() as never);

        await expect(
            setProjectCommand(undefined, PREVIEW_UUID),
        ).rejects.toThrow(/preview project/);
        expect(mockSetProjectConfig).not.toHaveBeenCalled();
    });
});
