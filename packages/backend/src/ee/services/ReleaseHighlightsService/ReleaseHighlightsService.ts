import {
    Account,
    assertRegisteredAccount,
    LightdashMode,
    ReleaseHighlightsResult,
    SessionUser,
} from '@lightdash/common';
import { toSessionUser } from '../../../auth/account';
import { getDockerHubVersion } from '../../../clients/DockerHub/DockerHub';
import { LightdashConfig } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';
import { VERSION } from '../../../version';
import { GithubReleaseNotesClient } from '../../clients/GithubReleaseNotes/GithubReleaseNotesClient';
import {
    compareReleaseVersions,
    isReleaseVersion,
} from '../../clients/GithubReleaseNotes/releaseVersions';
import {
    ReleaseHighlightsModel,
    type CachedReleaseHighlights,
} from '../../models/ReleaseHighlightsModel';
import { AiService } from '../AiService/AiService';
import { RoadmapService } from '../RoadmapService/RoadmapService';
import { buildHighlights } from './buildHighlights';

type Dependencies = {
    lightdashConfig: Pick<LightdashConfig, 'mode' | 'updateCheck'>;
    model: Pick<ReleaseHighlightsModel, 'get' | 'insert'>;
    githubClient: Pick<GithubReleaseNotesClient, 'getFeatureCandidates'>;
    aiService: Pick<
        AiService,
        'isAmbientAiEnabled' | 'generateReleaseHighlights'
    >;
    roadmapService: Pick<RoadmapService, 'getShippedRequestedItems'> | null;
    now: (() => number) | null;
};

type CachedResult =
    | { status: 'ready'; cached: CachedReleaseHighlights }
    | Extract<ReleaseHighlightsResult, { status: 'unavailable' }>;

const COOLDOWN_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export class ReleaseHighlightsService {
    private readonly inFlight = new Map<string, Promise<CachedResult>>();

    private readonly failures = new Map<string, number>();

    private attempts: number[] = [];

    private readonly now: () => number;

    constructor(private readonly dependencies: Dependencies) {
        this.now = dependencies.now ?? Date.now;
    }

    async getHighlights(account: Account): Promise<ReleaseHighlightsResult> {
        const { lightdashConfig, aiService } = this.dependencies;
        if (lightdashConfig.mode !== LightdashMode.DEFAULT)
            return { status: 'unavailable', reason: 'not_self_hosted' };
        if (!lightdashConfig.updateCheck.enabled)
            return { status: 'unavailable', reason: 'update_check_disabled' };
        const fromVersion: string = VERSION;
        const toVersion = getDockerHubVersion();
        if (
            !toVersion ||
            !isReleaseVersion(fromVersion) ||
            !isReleaseVersion(toVersion) ||
            compareReleaseVersions(fromVersion, toVersion) >= 0
        ) {
            return { status: 'unavailable', reason: 'up_to_date' };
        }
        try {
            assertRegisteredAccount(account);
            const user = toSessionUser(account);
            if (!(await aiService.isAmbientAiEnabled(user)))
                return { status: 'unavailable', reason: 'ai_not_configured' };
            const key = `${fromVersion}:${toVersion}`;
            let operation = this.inFlight.get(key);
            if (!operation) {
                operation = this.getOrGenerate(
                    user,
                    fromVersion,
                    toVersion,
                    key,
                ).finally(() => this.inFlight.delete(key));
                this.inFlight.set(key, operation);
            }
            const result = await operation;
            if (result.status === 'unavailable') return result;
            const { cached } = result;
            const matches = await this.getRoadmapMatches(account);
            return {
                status: 'ready',
                fromVersion: cached.fromVersion,
                toVersion: cached.toVersion,
                highlights: buildHighlights(cached, matches),
                generatedAt: cached.generatedAt,
            };
        } catch (error) {
            Logger.warn('Unable to load release highlights', error);
            return { status: 'unavailable', reason: 'generation_failed' };
        }
    }

    private async getRoadmapMatches(
        account: Account,
    ): Promise<{ title: string; numbers: number[] }[]> {
        const { roadmapService } = this.dependencies;
        if (roadmapService === null) return [];
        let timer: ReturnType<typeof setTimeout> | null = null;
        try {
            const result = await Promise.race([
                roadmapService.getShippedRequestedItems(account),
                new Promise<{ status: 'unavailable' }>((resolve) => {
                    timer = setTimeout(
                        () => resolve({ status: 'unavailable' }),
                        3_000,
                    );
                }),
            ]);
            return result.status === 'ok' ? result.items : [];
        } catch {
            return [];
        } finally {
            if (timer !== null) clearTimeout(timer);
        }
    }

    private async getOrGenerate(
        user: SessionUser,
        fromVersion: string,
        toVersion: string,
        key: string,
    ): Promise<CachedResult> {
        const { model, githubClient, aiService } = this.dependencies;
        try {
            const cached = await model.get(fromVersion, toVersion);
            if (cached) return { status: 'ready', cached };
            const now = this.now();
            this.failures.forEach((failedAt, range) => {
                if (now - failedAt >= COOLDOWN_MS) this.failures.delete(range);
            });
            this.attempts = this.attempts.filter(
                (attempt) => now - attempt < HOUR_MS,
            );
            if (this.failures.has(key) || this.attempts.length >= 10)
                return { status: 'unavailable', reason: 'rate_limited' };
            this.attempts.push(now);
            const source = await githubClient.getFeatureCandidates(
                fromVersion,
                toVersion,
            );
            if (source.status === 'unavailable') {
                this.failures.set(key, this.now());
                return { status: 'unavailable', reason: 'source_unavailable' };
            }
            if (source.candidates.length === 0) {
                this.failures.set(key, this.now());
                return { status: 'unavailable', reason: 'no_features' };
            }
            const ranked = await aiService.generateReleaseHighlights(user, {
                fromVersion,
                toVersion,
                candidates: source.candidates,
            });
            if (ranked.length === 0) {
                this.failures.set(key, this.now());
                return { status: 'unavailable', reason: 'no_features' };
            }
            await model.insert(
                fromVersion,
                toVersion,
                source.candidates,
                ranked,
            );
            const stored = await model.get(fromVersion, toVersion);
            if (!stored) throw new Error('Release highlights were not saved');
            return { status: 'ready', cached: stored };
        } catch (error) {
            this.failures.set(key, this.now());
            Logger.warn('Unable to generate release highlights', error);
            return { status: 'unavailable', reason: 'generation_failed' };
        }
    }
}
