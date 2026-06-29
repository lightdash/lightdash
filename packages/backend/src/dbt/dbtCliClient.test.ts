import { DbtError, SupportedDbtVersions } from '@lightdash/common';
import execa from 'execa';
import * as fs from 'fs/promises';
import { DbtCliClient } from './dbtCliClient';
import {
    catalogMock,
    cliArgs as cliArgsWithoutVersion,
    cliMockImplementation,
    dbtProjectYml,
    expectedCommandOptions,
    expectedDbtOptions,
    expectedPackages,
    manifestMock,
    packagesYml,
} from './dbtCliClient.mock';

const execaMock = execa as unknown as import('vitest').Mock;

vi.mock('fs/promises', () => ({
    readFile: vi.fn(),
    writeFile: vi.fn(),
}));
vi.mock('execa');

Object.values(SupportedDbtVersions).map((dbtVersion) => {
    const cliArgs = {
        ...cliArgsWithoutVersion,
        dbtVersion,
    };
    return describe(`DbtCliClient ${dbtVersion}`, () => {
        beforeEach(() => {
            vi.resetAllMocks();
        });
        it('should install dependencies with success', async () => {
            execaMock.mockImplementationOnce(cliMockImplementation.success);

            const client = new DbtCliClient(cliArgs);
            const dbtExec = client.getDbtExec();

            await expect(client.installDeps()).resolves.toEqual(undefined);
            await expect(execaMock).toHaveBeenCalledTimes(1);
            await expect(execaMock).toHaveBeenCalledWith(
                dbtExec,
                [...expectedDbtOptions, 'deps', ...expectedCommandOptions],
                expect.anything(),
            );
        });
        it('should error on install dependencies', async () => {
            execaMock.mockImplementationOnce(cliMockImplementation.error);

            const client = new DbtCliClient(cliArgs);

            await expect(client.installDeps()).rejects.toThrowError(DbtError);
        });
        it('should get manifest with success', async () => {
            execaMock.mockImplementationOnce(cliMockImplementation.success);
            vi.spyOn(fs, 'readFile').mockImplementationOnce(
                async () => dbtProjectYml,
            );
            vi.spyOn(fs, 'readFile').mockImplementationOnce(async () =>
                JSON.stringify(manifestMock),
            );

            const client = new DbtCliClient(cliArgs);
            const dbtExec = client.getDbtExec();

            await expect(client.getDbtManifest()).resolves.toEqual({
                manifest: manifestMock,
            });
            await expect(execaMock).toHaveBeenCalledTimes(1);
            await expect(execaMock).toHaveBeenCalledWith(
                dbtExec,
                [
                    ...expectedDbtOptions,
                    'ls',
                    '--output',
                    'json',
                    '--output-keys',
                    'unique_id',
                    ...expectedCommandOptions,
                ],
                expect.anything(),
            );
        });
        it('should get packages with success', async () => {
            vi.spyOn(fs, 'readFile').mockImplementationOnce(
                async () => packagesYml,
            );

            const client = new DbtCliClient(cliArgs);

            await expect(client.getDbtPackages()).resolves.toEqual(
                expectedPackages,
            );
        });
        it('should ignore error when packages.yml doesnt exist', async () => {
            vi.spyOn(fs, 'readFile').mockImplementationOnce(() => {
                throw new Error('file not found');
            });

            const client = new DbtCliClient(cliArgs);

            await expect(client.getDbtPackages()).resolves.toBeUndefined();
        });
    });
});
