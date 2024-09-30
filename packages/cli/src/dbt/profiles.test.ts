import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findDbtDefaultProfile } from './profile';

jest.mock('os');
jest.mock('fs');
jest.mock('path');

describe('Profile', () => {
    const { env, cwd } = process;
    const mockAccessSync = fs.accessSync as jest.MockedFunction<
        typeof fs.accessSync
    >;
    const mockHomedir = os.homedir as jest.MockedFunction<typeof os.homedir>;
    const mockJoin = path.join as jest.MockedFunction<typeof path.join>;

    beforeEach(() => {
        jest.resetAllMocks();
        jest.resetModules();
        process.cwd = jest.fn(() => '/current/dir');
        mockHomedir.mockReturnValue('/root');
        mockJoin.mockImplementation((...paths) => paths.join('/'));
        process.env = { ...env };
    });

    afterEach(() => {
        process.env = env;
        process.cwd = cwd;
    });

    describe('findDbtDefaultProfile', () => {
        test('should return path from DBT_PROFILE_DIR when set', () => {
            process.env.DBT_PROFILES_DIR = '/path/to/profiles';
            const result = findDbtDefaultProfile();
            expect(result).toBe('/path/to/profiles');
        });
        test('should return cwd when profile.yml exists and DBT_PROFILE_DIR is undefined', () => {
            delete process.env.DBT_PROFILES_DIR;
            mockAccessSync.mockImplementation(() => undefined);
            expect(findDbtDefaultProfile()).toBe('/current/dir');
            expect(mockAccessSync).toHaveBeenCalledWith(
                '/current/dir/profiles.yml',
                fs.constants.F_OK,
            );
        });
        test('should return homedir when profile.yml does not exist in cwd', () => {
            delete process.env.DBT_PROFILE_DIR;
            mockAccessSync.mockImplementation(() => {
                throw new Error('File not found');
            });
            expect(findDbtDefaultProfile()).toBe('/root/.dbt');
            expect(mockAccessSync).toHaveBeenCalledWith(
                '/current/dir/profiles.yml',
                fs.constants.F_OK,
            );
            expect(mockHomedir).toHaveBeenCalled();
        });
    });
});
