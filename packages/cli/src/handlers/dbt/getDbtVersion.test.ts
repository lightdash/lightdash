import {
    DbtVersionOptionLatest,
    getLatestSupportDbtVersion,
    SupportedDbtVersions,
} from '@lightdash/common';
import execa from 'execa';
import inquirer from 'inquirer';
import type { Mock } from 'vitest';
import GlobalState from '../../globalState';
import { getDbtVersion } from './getDbtVersion';
import { cliMocks } from './getDbtVersion.mocks';

vi.mock('execa');
const execaMock = execa as unknown as Mock;
vi.mock('inquirer', () => ({
    default: {
        prompt: vi.fn(),
    },
}));
const promptMock = inquirer.prompt as unknown as Mock;
const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('Get dbt version', () => {
    const { env } = process;

    beforeEach(() => {
        vi.resetAllMocks();
        vi.resetModules();
        process.env = { ...env };
        execaMock.mockImplementation(async () => cliMocks.dbt1_4);
        promptMock.mockImplementation(async () => ({ isConfirm: true }));
        GlobalState.clearPromptAnswer();
    });

    afterEach(() => {
        process.env = env;
    });

    describe('getDbtVersion', () => {
        test('should return error if dbt cli is not installed', async () => {
            execaMock.mockImplementation(async () => cliMocks.error);
            await expect(getDbtVersion()).rejects.toThrowError();
        });
        test('should return supported dbt versions', async () => {
            // Test for 1.4
            const version = await getDbtVersion();
            expect(version.verboseVersion).toEqual('1.4.9');
            expect(version.versionOption).toEqual(SupportedDbtVersions.V1_4);
            // Test for 1.9
            execaMock.mockImplementation(async () => cliMocks.dbt1_9);
            const version2 = await getDbtVersion();
            expect(version2.verboseVersion).toEqual('1.9.1');
            expect(version2.versionOption).toEqual(SupportedDbtVersions.V1_9);
            // Test for 1.11
            execaMock.mockImplementation(async () => cliMocks.dbt1_11);
            const version3 = await getDbtVersion();
            expect(version3.verboseVersion).toEqual('1.11.0');
            expect(version3.versionOption).toEqual(SupportedDbtVersions.V1_11);
        });
        test('should return latest for dbt cloud', async () => {
            execaMock.mockImplementation(async () => cliMocks.dbtCloud);
            const version3 = await getDbtVersion();
            expect(version3.verboseVersion).toEqual(
                expect.stringContaining('dbt Cloud CLI'),
            );
            expect(version3.versionOption).toEqual(
                DbtVersionOptionLatest.LATEST,
            );
        });
        test('when CI=true, should warn user about unsupported version and return fallback', async () => {
            process.env.CI = 'true';
            // Test for 1.3
            execaMock.mockImplementation(async () => cliMocks.dbt1_3);
            const version = await getDbtVersion();
            expect(version.verboseVersion).toEqual('1.3.0');
            expect(version.versionOption).toEqual(SupportedDbtVersions.V1_4);
            expect(consoleError).toHaveBeenCalledTimes(1);
            expect(consoleError).nthCalledWith(
                1,
                expect.stringContaining(
                    "We don't currently support version 1.3.0",
                ),
            );
            // Clear saved prompt answer
            GlobalState.clearPromptAnswer();
            // Test for future version
            execaMock.mockImplementation(async () => cliMocks.dbt20_1);
            const version2 = await getDbtVersion();
            expect(version2.verboseVersion).toEqual('20.1.0');
            expect(version2.versionOption).toEqual(
                getLatestSupportDbtVersion(),
            );
            expect(consoleError).toHaveBeenCalledTimes(2);
            expect(consoleError).nthCalledWith(
                2,
                expect.stringContaining(
                    "We don't currently support version 20.1.0",
                ),
            );
        });
        test('when CI=false, should return fallback version if user confirms', async () => {
            process.env.CI = 'false';
            execaMock.mockImplementation(async () => cliMocks.dbt1_3);
            const version = await getDbtVersion();
            expect(version.verboseVersion).toEqual('1.3.0');
            expect(version.versionOption).toEqual(SupportedDbtVersions.V1_4);
            expect(promptMock).toHaveBeenCalledTimes(1);
            expect(consoleError).toHaveBeenCalledTimes(0);
        });
        test('when CI=false, should return error if user declines fallback', async () => {
            const exitSpy = vi
                .spyOn(process, 'exit')
                .mockImplementation((() => undefined) as never);
            process.env.CI = 'false';
            execaMock.mockImplementation(async () => cliMocks.dbt1_3);
            promptMock.mockImplementation(async () => ({ isConfirm: false }));
            await getDbtVersion();
            expect(promptMock).toHaveBeenCalledTimes(1);
            expect(consoleError).toHaveBeenCalledTimes(1);
            expect(exitSpy).toHaveBeenCalledWith(1);
            exitSpy.mockRestore();
        });
    });
});
