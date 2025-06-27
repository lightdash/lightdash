import parseNodeVersion from 'parse-node-version';

import packageJson from '../package.json';
import { findDbtDefaultProfile } from './dbt/profile';

export const NODE_VERSION = { major: parseNodeVersion(process.version).major };

export const OPTIMIZED_NODE_VERSION = 20;

export const { version: CLI_VERSION } = packageJson;

export const DEFAULT_DBT_PROJECT_DIR = process.env.DBT_PROJECT_DIR || '.';
export const DEFAULT_DBT_PROFILES_DIR: string = findDbtDefaultProfile();
