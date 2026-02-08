import * as path from 'path';

const SCRIPTS_DIR = path.resolve(__dirname, '..');

export const BACKEND_SRC = path.resolve(SCRIPTS_DIR, '../packages/backend/src');
export const SERVICE_REPO = path.join(BACKEND_SRC, 'services/ServiceRepository.ts');
export const CONTROLLERS_DIR = path.join(BACKEND_SRC, 'controllers');
export const ROUTERS_DIR = path.join(BACKEND_SRC, 'routers');
export const EE_DIR = path.join(BACKEND_SRC, 'ee');
export const EE_CONTROLLERS_DIR = path.join(EE_DIR, 'controllers');
export const EE_INDEX = path.join(EE_DIR, 'index.ts');

export const DOMAIN_CACHE = path.join(SCRIPTS_DIR, '.dep-graph-domains.json');
export const SUMMARY_CACHE = path.join(SCRIPTS_DIR, '.dep-graph-summaries.json');
export const HEALTH_SUMMARY_CACHE = path.join(SCRIPTS_DIR, '.dep-graph-health-summaries.json');
export const DUPLICATION_CACHE = path.join(SCRIPTS_DIR, '.dep-graph-duplication.json');
export const DUPLICATION_SUMMARY_CACHE = path.join(SCRIPTS_DIR, '.dep-graph-duplication-summaries.json');
export const SENTRY_CACHE = path.join(SCRIPTS_DIR, '.dep-graph-sentry.json');
export const SENTRY_CACHE_TTL = 24 * 60 * 60 * 1000;
