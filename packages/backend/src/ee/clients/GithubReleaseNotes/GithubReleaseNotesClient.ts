import { z } from 'zod';
import Logger from '../../../logging/logger';
import {
    parseCommitFeatureCandidates,
    parseReleaseFeatureCandidates,
    type ReleaseFeatureCandidate,
} from './releaseFeatureCandidates';
import { compareReleaseVersions, isReleaseVersion } from './releaseVersions';

const API_URL = 'https://api.github.com/repos/lightdash/lightdash';
const MAX_CANDIDATES = 300;
const ReleasesSchema = z.array(
    z.object({
        tag_name: z.string(),
        draft: z.boolean(),
        prerelease: z.boolean(),
        body: z.string().nullable(),
    }),
);
const CompareSchema = z.object({
    commits: z.array(z.object({ commit: z.object({ message: z.string() }) })),
});

export type ReleaseFeatureCandidatesSource =
    | { status: 'ready'; candidates: ReleaseFeatureCandidate[] }
    | { status: 'unavailable' };

export class GithubReleaseNotesClient {
    private async request(path: string): Promise<unknown> {
        const response = await fetch(`${API_URL}${path}`, {
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': 'Lightdash-release-notes',
            },
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok)
            throw new Error(`Release notes source returned ${response.status}`);
        return response.json();
    }

    private async getReleaseBodies(
        fromVersion: string,
        toVersion: string,
        page: number,
    ): Promise<{ version: string; body: string }[]> {
        const response = ReleasesSchema.parse(
            await this.request(`/releases?per_page=100&page=${page}`),
        );
        const versions = response
            .map((release) => ({
                ...release,
                version: release.tag_name.replace(/^v/, ''),
            }))
            .filter(({ version }) => isReleaseVersion(version));
        const releases = versions
            .filter(
                (release) =>
                    !release.draft &&
                    !release.prerelease &&
                    release.body?.trim() &&
                    compareReleaseVersions(release.version, fromVersion) > 0 &&
                    compareReleaseVersions(release.version, toVersion) <= 0,
            )
            .map(({ version, body }) => ({
                version,
                body: body?.trim() ?? '',
            }));
        if (
            page >= 5 ||
            response.length === 0 ||
            versions.some(
                ({ version }) =>
                    compareReleaseVersions(version, fromVersion) <= 0,
            )
        )
            return releases;
        return [
            ...releases,
            ...(await this.getReleaseBodies(fromVersion, toVersion, page + 1)),
        ];
    }

    async getFeatureCandidates(
        fromVersion: string,
        toVersion: string,
    ): Promise<ReleaseFeatureCandidatesSource> {
        try {
            const releases = await this.getReleaseBodies(
                fromVersion,
                toVersion,
                1,
            );
            let candidates = parseReleaseFeatureCandidates(releases);
            if (releases.length === 0) {
                const comparison = CompareSchema.parse(
                    await this.request(
                        `/compare/${fromVersion}...${toVersion}`,
                    ),
                );
                candidates = parseCommitFeatureCandidates(
                    comparison.commits.map(({ commit }) => commit.message),
                    toVersion,
                );
            }
            return {
                status: 'ready',
                candidates: candidates.slice(0, MAX_CANDIDATES),
            };
        } catch (error) {
            Logger.warn('Unable to fetch release notes source', error);
            return { status: 'unavailable' };
        }
    }
}
