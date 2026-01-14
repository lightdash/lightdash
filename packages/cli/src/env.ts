import parseNodeVersion from 'parse-node-version';

import packageJson from '../package.json';
import { findDbtDefaultProfile } from './dbt/profile';

export const NODE_VERSION = { major: parseNodeVersion(process.version).major };

export const OPTIMIZED_NODE_VERSION = 20;

export const { version: CLI_VERSION } = packageJson;

export const DEFAULT_DBT_PROJECT_DIR = process.env.DBT_PROJECT_DIR || '.';
export const DEFAULT_DBT_PROFILES_DIR: string = findDbtDefaultProfile();

type InstallMethod = 'npm' | 'homebrew' | 'binary';

export const getInstallMethod = (): InstallMethod => {
    // pkg-compiled binary
    if ((process as NodeJS.Process & { pkg?: unknown }).pkg) {
        return 'binary';
    }

    const { execPath } = process;
    // Homebrew: macOS (Apple Silicon, Intel) or Linux (Linuxbrew)
    if (
        execPath.includes('/opt/homebrew/') ||
        execPath.includes('/usr/local/Cellar/') ||
        execPath.includes('linuxbrew')
    ) {
        return 'homebrew';
    }

    return 'npm';
};

export const getUpdateInstructions = (version: string): string => {
    const method = getInstallMethod();
    switch (method) {
        case 'homebrew':
            return 'running: brew upgrade lightdash';
        case 'binary':
            return 'downloading from: https://github.com/lightdash/lightdash/releases';
        case 'npm':
        default:
            return `running: npm install -g @lightdash/cli@${version}`;
    }
};
