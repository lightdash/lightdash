import fetch, { type Response } from 'node-fetch';

const DEFAULT_TIMEOUT_MS = 15000;

export class MigrationFactsFetchError extends Error {
    readonly url: string;

    constructor(message: string, url: string) {
        super(message);
        this.name = 'MigrationFactsFetchError';
        this.url = url;
    }
}

export interface MigrationFactsClientDependencies {
    fetch: typeof fetch;
    timeoutMs: number;
}

const defaultDependencies: MigrationFactsClientDependencies = {
    fetch,
    timeoutMs: DEFAULT_TIMEOUT_MS,
};

export const migrationFactsUrl = (version: string): string =>
    `https://github.com/lightdash/lightdash/releases/download/${version}/migration-facts.json`;

const recoveryMessage = (url: string): string =>
    `Download ${url} yourself and pass the file with --facts <path>.`;

const responseError = (
    response: Response,
    version: string,
    url: string,
): MigrationFactsFetchError => {
    if (response.status === 404) {
        return new MigrationFactsFetchError(
            `Could not obtain migration facts for ${version}: no release asset was found at ${url} (HTTP 404). ${recoveryMessage(url)}`,
            url,
        );
    }
    return new MigrationFactsFetchError(
        `Could not obtain migration facts for ${version}: ${url} returned HTTP ${response.status}. ${recoveryMessage(url)}`,
        url,
    );
};

export const fetchMigrationFacts = async (
    version: string,
    dependencies: MigrationFactsClientDependencies = defaultDependencies,
): Promise<string> => {
    const url = migrationFactsUrl(version);
    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        dependencies.timeoutMs,
    );
    try {
        const response = await dependencies.fetch(url, {
            method: 'GET',
            signal: controller.signal,
        });
        if (!response.ok) throw responseError(response, version, url);
        const raw = await response.text();
        try {
            JSON.parse(raw);
        } catch {
            throw new MigrationFactsFetchError(
                `Could not obtain migration facts for ${version}: ${url} returned a non-JSON response. ${recoveryMessage(url)}`,
                url,
            );
        }
        return raw;
    } catch (error) {
        if (error instanceof MigrationFactsFetchError) throw error;
        if (error instanceof Error && error.name === 'AbortError') {
            throw new MigrationFactsFetchError(
                `Could not obtain migration facts for ${version}: the request to ${url} timed out after ${dependencies.timeoutMs}ms. ${recoveryMessage(url)}`,
                url,
            );
        }
        throw new MigrationFactsFetchError(
            `Could not obtain migration facts for ${version}: the request to ${url} failed${error instanceof Error ? ` (${error.message})` : ''}. ${recoveryMessage(url)}`,
            url,
        );
    } finally {
        clearTimeout(timeout);
    }
};
