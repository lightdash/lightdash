import type { Command } from 'commander';
import {
    agentCommandUnavailable,
    getAgentConnectionSelection,
    personalLoginRequired,
} from '../credentials';

type CommandPolicy =
    | { disposition: 'admit' | 'local'; reason: string }
    | { disposition: 'refuse'; reason: string; message: string };
const local = (reason: string): CommandPolicy => ({
    disposition: 'local',
    reason,
});
const admit = (reason: string): CommandPolicy => ({
    disposition: 'admit',
    reason,
});
const refuse = (
    reason: string,
    message = agentCommandUnavailable,
): CommandPolicy => ({ disposition: 'refuse', reason, message });

export const COMMAND_POLICY: Readonly<Record<string, CommandPolicy>> = {
    'upgrade-check': local('Public release index only'),
    'connect-snowflake': refuse('Separate warehouse credential deposit'),
    login: refuse('Personal bootstrap', personalLoginRequired),
    agent: local('Command group'),
    'agent connect': refuse('Personal bootstrap', personalLoginRequired),
    'agent status': admit('Own connection status'),
    'agent revoke': admit('Own connection revocation'),
    config: local('Command group'),
    'config set-project': refuse(
        'Saves a personal default; pass --project on the command',
    ),
    'config set-source': refuse(
        'Saves a personal default; pass --project on the command',
    ),
    'config list-projects': refuse('Organisation-wide discovery'),
    'config get-project': admit(
        'Read-only configuration with credential validation',
    ),
    'config rename-project': refuse('Project lifecycle'),
    'config unset-project': refuse('Changes personal defaults'),
    dbt: local('Command group'),
    'dbt run': local('Local dbt execution'),
    compile: local('Local compilation with selected optional server reads'),
    preview: refuse('Project lifecycle'),
    'start-preview': refuse('Project lifecycle'),
    'stop-preview': refuse('Project lifecycle'),
    download: admit(
        'Project content reads; organisation and shared skills modes refused',
    ),
    upload: refuse(
        'Complete bundle preflight is not yet supported; refuse before any write',
    ),
    apps: local('Command group'),
    'apps create': refuse('Unsupported authoring context'),
    'apps preview': refuse('Unsupported arbitrary API proxy'),
    'apps validate': local(
        'Local validation with selected optional catalogue reads',
    ),
    'apps build': local('Local build'),
    deploy: admit(
        'Existing approved project without source or target overrides',
    ),
    refresh: refuse('Required global job polling is unavailable'),
    validate: refuse(
        'Server validation and global job polling are unavailable',
    ),
    generate: local('Local model generation'),
    rename: refuse('Queued rename is unavailable'),
    'slug-update': refuse('Slug rename is unavailable'),
    'generate-exposures': admit('Approved project exposures'),
    diagnostics: refuse('Personal credential diagnostics'),
    lint: local('Local lint'),
    'warehouse-catalog': admit('Approved project catalogue'),
    'pre-aggregate-audit': refuse('Server audit is unavailable'),
    'pre-aggregate-check-external': local('Local warehouse check'),
    sql: admit('Approved project SQL query'),
    'run-chart': admit('Approved project metric query'),
    'set-warehouse': refuse('Warehouse credential configuration'),
    'export-chart-image': refuse('Public image export is unavailable'),
    'install-skills': local('Public GitHub assets only'),
};

const refusedModes: Readonly<Record<string, readonly string[]>> = {
    deploy: ['create', 'source', 'target'],
    download: ['organization', 'skills', 'includeSkills', 'includeAll'],
    upload: [
        'validate',
        'organization',
        'skills',
        'deleteSkills',
        'apps',
        'includeApps',
        'appsOnly',
        'chartTypes',
        'includeChartTypes',
        'chartTypesOnly',
        'spacesOnly',
        'public',
    ],
};

export const assertAgentCommandAllowed = (
    name: string,
    options: Readonly<Record<string, unknown>> = {},
): void => {
    if (getAgentConnectionSelection() === null) return;
    const mode = refusedModes[name]?.find((option) => {
        const value = options[option];
        return Array.isArray(value)
            ? value.length > 0
            : value !== undefined && value !== null && value !== false;
    });
    if (mode) {
        const flag = mode.replace(
            /[A-Z]/g,
            (letter) => `-${letter.toLowerCase()}`,
        );
        throw new Error(
            `${agentCommandUnavailable}\n--${flag} is not available with an agent connection.`,
        );
    }
    const policy = Object.prototype.hasOwnProperty.call(COMMAND_POLICY, name)
        ? COMMAND_POLICY[name]
        : undefined;
    if (!policy || policy.disposition === 'refuse') {
        const advice =
            name === 'config set-project' || name === 'config set-source'
                ? '\nPass --project on the command instead of saving a personal default.'
                : '';
        throw new Error(
            `${policy?.disposition === 'refuse' ? policy.message : agentCommandUnavailable}${advice}`,
        );
    }
};

export const agentCommandPath = (command: Command): string => {
    const parts: string[] = [];
    for (
        let current: Command | null = command;
        current.parent;
        current = current.parent
    )
        parts.unshift(current.name());
    return parts.join(' ');
};
