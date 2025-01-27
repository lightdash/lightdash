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

const execaMock = execa as unknown as jest.Mock;

jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    writeFile: jest.fn(),
}));
jest.mock('execa');

Object.values(SupportedDbtVersions).map((dbtVersion) => {
    const cliArgs = {
        ...cliArgsWithoutVersion,
        dbtVersion,
    };
    return describe(`DbtCliClient ${dbtVersion}`, () => {
        beforeEach(() => {
            jest.resetAllMocks();
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
            jest.spyOn(fs, 'readFile').mockImplementationOnce(
                async () => dbtProjectYml,
            );
            jest.spyOn(fs, 'readFile').mockImplementationOnce(async () =>
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
                [...expectedDbtOptions, 'compile', ...expectedCommandOptions],
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
});

describe('DbtCliClient', () => {
    describe('validateSelector', () => {
        it('should allow valid selectors', () => {
            const validSelectors = [
                'model_name',
                'tag:daily',
                'my_model+', // select my_model and all descendants
                '+my_model', // select my_model and all ancestors
                'folder.model',
                'model_123',
                'model-name',
                'model:staging',
                'model_name_with_underscore',
                '*_wildcard_*',
                'middle_wild*card',
                '@my_model', // select my_model, its descendants, and the ancestors of its descendants
                'events +customers tag:lightdash', // Complex selector with multiple parts
            ];

            validSelectors.forEach((selector) => {
                expect(DbtCliClient.validateSelector(selector)).toBe(true);
            });
        });

        it('should reject invalid selectors', () => {
            const invalidSelectors = [
                'model/name', // forward slash
                'model\\name', // backslash
                'model$name', // special character
                'model@name', // @ in the middle
                'model@', // @ in the end
                'model;name', // semicolon
                'model`name', // backtick
                'model"name', // quotes
            ];

            invalidSelectors.forEach((selector) => {
                expect(DbtCliClient.validateSelector(selector)).toBe(false);
            });
        });
    });
});
