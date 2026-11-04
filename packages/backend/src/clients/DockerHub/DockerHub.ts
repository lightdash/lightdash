import fetch from 'node-fetch';
import Logger from '../../logging/logger';

const DOCKER_HUB_TAGS_URL =
    'https://hub.docker.com/v2/repositories/lightdash/lightdash/tags';
const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

let dockerHubVersion: string | undefined;
let pollInterval: NodeJS.Timeout | undefined;

const filterByName = (result: { name: string }): boolean =>
    /[0-9.]+$/.test(result.name);

const sorterByDate = (
    a: { last_updated: string },
    b: { last_updated: string },
): number =>
    Number(new Date(b.last_updated)) - Number(new Date(a.last_updated));

export async function fetchDockerHubVersion(): Promise<string | undefined> {
    try {
        const response = await fetch(DOCKER_HUB_TAGS_URL, { method: 'GET' });
        const version = (await response.json()).results
            .filter(filterByName)
            .sort(sorterByDate)[0].name;
        return version;
    } catch {
        return undefined;
    }
}

async function updateDockerHubVersion(): Promise<void> {
    try {
        const version = await fetchDockerHubVersion();
        if (version) dockerHubVersion = version;
    } catch (e) {
        Logger.error(`Unable to update DockerHub version: ${e}`);
    }
}

/**
 * Starts polling Docker Hub for the newest published Lightdash tag, which
 * `/api/v1/health` exposes as `latest.version` so the frontend can show an
 * "update available" badge. Only the API server needs to call this; the
 * scheduler and NATS workers never serve that field. Operators that block
 * egress to Docker Hub can turn the check off with
 * `LIGHTDASH_DISABLE_UPDATE_CHECK=true` (`lightdashConfig.updateCheck`).
 */
export function startDockerHubVersionPolling(): void {
    if (pollInterval) return;
    void updateDockerHubVersion();
    pollInterval = setInterval(() => {
        void updateDockerHubVersion();
    }, POLL_INTERVAL_MS);
    pollInterval.unref();
}

export function stopDockerHubVersionPolling(): void {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = undefined;
    }
}

export function getDockerHubVersion(): string | undefined {
    return dockerHubVersion;
}
