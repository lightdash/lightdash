import { AgentCapability } from '@lightdash/common';
import { validateAgentConnectionSelection } from '../credentials';

export type ConnectionConnectOptions = {
    verbose: boolean;
    name?: string;
    projects?: string[];
    capabilities?: string;
    expiresIn?: string;
    oauthPort?: string;
    timeout?: number;
};
export const connectionConnectInputs = (options: ConnectionConnectOptions) => {
    const name = options.name ?? 'default';
    validateAgentConnectionSelection(name);
    const projects =
        options.projects === undefined ? null : [...new Set(options.projects)];
    if (
        projects?.some(
            (project) =>
                !project ||
                project !== project.trim() ||
                /[/\\?#\x00-\x1f\x7f]/.test(project),
        ) ||
        projects?.length === 0
    )
        throw new Error(
            'Specify a non-empty project UUID or slug without URL or path separators.',
        );
    const known = Object.values(AgentCapability);
    const requested =
        options.capabilities === undefined
            ? known
            : options.capabilities.split(',');
    const capabilities = [...new Set(requested)].map((value) => {
        const capability = known.find((key) => key === value);
        if (capability === undefined)
            throw new Error(
                `Invalid capability. Valid keys: ${known.join(', ')}.`,
            );
        return capability;
    });
    const duration = /^(\d+)(s|m|h|d)$/.exec(options.expiresIn ?? '24h');
    const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    const expiresInSeconds = duration
        ? Number(duration[1]) * units[duration[2]]
        : NaN;
    if (
        !Number.isSafeInteger(expiresInSeconds) ||
        expiresInSeconds < 1 ||
        expiresInSeconds > 604800
    )
        throw new Error(
            'Expiry must be a positive integer duration in s, m, h or d, no greater than 7d.',
        );
    const rawPort = options.oauthPort ?? process.env.LIGHTDASH_OAUTH_PORT;
    const port = rawPort === undefined ? 0 : Number(rawPort);
    if (
        rawPort !== undefined &&
        (!/^\d+$/.test(rawPort) ||
            !Number.isInteger(port) ||
            port < 1 ||
            port > 65535)
    )
        throw new Error('Port must be a number between 1 and 65535');
    const timeout = options.timeout ?? 180;
    if (
        !Number.isFinite(timeout) ||
        timeout <= 0 ||
        timeout * 1000 > 2147483647
    )
        throw new Error(
            'Timeout must be a positive number of seconds no greater than 2147483.647',
        );
    return { name, projects, capabilities, expiresInSeconds, port, timeout };
};
export type ConnectionConnectInputs = ReturnType<
    typeof connectionConnectInputs
>;
