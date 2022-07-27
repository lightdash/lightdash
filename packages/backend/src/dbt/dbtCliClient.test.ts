import { DbtError } from '@lightdash/common';
import execa from 'execa';
import * as fs from 'fs/promises';
import { DbtCliClient } from './dbtCliClient';
import {
    catalogMock,
    cliArgs,
    cliMockImplementation,
    dbtProjectYml,
    expectedCommandOptions,
    expectedPackages,
    manifestMock,
    packagesYml,
} from './dbtCliClient.mock';

const execaMock = execa as unknown as jest.Mock;

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    writeFile: jest.fn(),
}));
jest.mock('execa');

describe('DbtCliClient', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });
    it('should install dependencies with success', async () => {
        execaMock.mockImplementationOnce(cliMockImplementation.success);

        const client = new DbtCliClient(cliArgs);

        await expect(client.installDeps()).resolves.toEqual(undefined);
        await expect(execaMock).toHaveBeenCalledTimes(1);
        await expect(execaMock).toHaveBeenCalledWith(
            'dbt',
            ['deps', ...expectedCommandOptions],
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
        jest.spyOn(fs, 'readFile').mockImplementationOnce(
            async () => dbtProjectYml,
        );
        jest.spyOn(fs, 'readFile').mockImplementationOnce(async () =>
            JSON.stringify(manifestMock),
        );

        const client = new DbtCliClient(cliArgs);

        await expect(client.getDbtManifest()).resolves.toEqual({
            manifest: manifestMock,
        });
        await expect(execaMock).toHaveBeenCalledTimes(1);
        await expect(execaMock).toHaveBeenCalledWith(
            'dbt',
            ['compile', ...expectedCommandOptions],
            expect.anything(),
        );
    });
    it('should get catalog with success', async () => {
        execaMock.mockImplementationOnce(cliMockImplementation.success);
        jest.spyOn(fs, 'readFile').mockImplementationOnce(
            async () => dbtProjectYml,
        );
        jest.spyOn(fs, 'readFile').mockImplementationOnce(async () =>
            JSON.stringify(catalogMock),
        );

        const client = new DbtCliClient(cliArgs);

        await expect(client.getDbtCatalog()).resolves.toEqual(catalogMock);
        await expect(execaMock).toHaveBeenCalledTimes(1);
        await expect(execaMock).toHaveBeenCalledWith(
            'dbt',
            ['docs', 'generate', ...expectedCommandOptions],
            expect.anything(),
        );
    });
    it('should get packages with success', async () => {
        jest.spyOn(fs, 'readFile').mockImplementationOnce(
            async () => packagesYml,
        );

        const client = new DbtCliClient(cliArgs);

        await expect(client.getDbtPackages()).resolves.toEqual(
            expectedPackages,
        );
    });
    it('should ignore error when packages.yml doesnt exist', async () => {
        jest.spyOn(fs, 'readFile').mockImplementationOnce(() => {
            throw new Error('file not found');
        });

        const client = new DbtCliClient(cliArgs);

        await expect(client.getDbtPackages()).resolves.toBeUndefined();
    });
});
