import fetch from 'node-fetch';
import Logger from '../../logging/logger';

let dockerHubVersion: string | undefined;

const filterByName = (result: { name: string }): boolean =>
    /[0-9.]+$/.test(result.name);

const sorterByDate = (
    a: { last_updated: string },
    b: { last_updated: string },
): number =>
    Number(new Date(b.last_updated)) - Number(new Date(a.last_updated));

export async function fetchDockerHubVersion(): Promise<string | undefined> {
    try {
        const response = await fetch(
            'https://hub.docker.com/v2/repositories/lightdash/lightdash/tags',
            { method: 'GET' },
        );
        const version = (await response.json()).results
            .filter(filterByName)
            .sort(sorterByDate)[0].name;
        return version;
    } catch {
        return undefined;
    }
}

async function updateDockerHubVersion() {
    const version = await fetchDockerHubVersion();
    if (version) dockerHubVersion = version;
}
if (process.env.NODE_ENV !== 'test') {
    setInterval(updateDockerHubVersion, 10 * 60 * 1000); // 10 minutes
}
updateDockerHubVersion().catch((e) =>
    Logger.error(`Unable to update DockerHub version: ${e}`),
);

export function getDockerHubVersion(): string | undefined {
    return dockerHubVersion;
}
