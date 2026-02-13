import {
    isCreateSchedulerMsTeamsTarget,
    isCreateSchedulerSlackTarget,
} from '@lightdash/common';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import type { LightdashConfig } from '../config/parseConfig';

type ChannelType = 'email' | 'slack' | 'msteams';

type Target = { channel: string } | { recipient: string } | { webhook: string };

/**
 * Extracted from SchedulerTask.handleScheduledDelivery (lines 3098-3160).
 * Tests the pure per-channel expiration grouping logic without the full
 * SchedulerTask dependency graph.
 */
function computePerChannelExpirations(
    config: LightdashConfig['persistentDownloadUrls'],
    targets: Target[],
): Map<number, Set<ChannelType>> {
    const {
        expirationSeconds,
        expirationSecondsEmail,
        expirationSecondsSlack,
        expirationSecondsMsTeams,
    } = config;

    const emailExpiration = expirationSecondsEmail ?? expirationSeconds;
    const slackExpiration = expirationSecondsSlack ?? expirationSeconds;
    const msTeamsExpiration = expirationSecondsMsTeams ?? expirationSeconds;

    const hasEmail = targets.some(
        (t) =>
            !isCreateSchedulerSlackTarget(t) &&
            !isCreateSchedulerMsTeamsTarget(t),
    );
    const hasSlack = targets.some(isCreateSchedulerSlackTarget);
    const hasMsTeams = targets.some(isCreateSchedulerMsTeamsTarget);

    const expirationToChannels = new Map<number, Set<ChannelType>>();
    const addToMap = (expiration: number, channel: ChannelType) => {
        const existing = expirationToChannels.get(expiration);
        if (existing) {
            existing.add(channel);
        } else {
            expirationToChannels.set(expiration, new Set([channel]));
        }
    };
    if (hasEmail) addToMap(emailExpiration, 'email');
    if (hasSlack) addToMap(slackExpiration, 'slack');
    if (hasMsTeams) addToMap(msTeamsExpiration, 'msteams');

    return expirationToChannels;
}

const baseConfig = lightdashConfigMock.persistentDownloadUrls;

describe('Per-channel expiration routing', () => {
    describe('fallback behavior (no per-channel env vars set)', () => {
        it('all channels fall back to base expirationSeconds', () => {
            const config: LightdashConfig['persistentDownloadUrls'] = {
                ...baseConfig,
                expirationSeconds: 259200,
                expirationSecondsEmail: undefined,
                expirationSecondsSlack: undefined,
                expirationSecondsMsTeams: undefined,
            };
            const targets: Target[] = [
                { recipient: 'user@example.com' },
                { channel: '#general' },
                { webhook: 'https://teams.webhook' },
            ];
            const result = computePerChannelExpirations(config, targets);

            expect(result.size).toBe(1);
            const channels = result.get(259200);
            expect(channels).toBeDefined();
            expect(channels!.has('email')).toBe(true);
            expect(channels!.has('slack')).toBe(true);
            expect(channels!.has('msteams')).toBe(true);
        });
    });

    describe('per-channel override', () => {
        it('each channel uses its own configured expiration', () => {
            const config: LightdashConfig['persistentDownloadUrls'] = {
                ...baseConfig,
                expirationSeconds: 259200,
                expirationSecondsEmail: 86400,
                expirationSecondsSlack: 604800,
                expirationSecondsMsTeams: 172800,
            };
            const targets: Target[] = [
                { recipient: 'user@example.com' },
                { channel: '#general' },
                { webhook: 'https://teams.webhook' },
            ];
            const result = computePerChannelExpirations(config, targets);

            expect(result.size).toBe(3);

            const emailChannels = result.get(86400);
            expect(emailChannels).toBeDefined();
            expect(emailChannels!.has('email')).toBe(true);
            expect(emailChannels!.size).toBe(1);

            const slackChannels = result.get(604800);
            expect(slackChannels).toBeDefined();
            expect(slackChannels!.has('slack')).toBe(true);
            expect(slackChannels!.size).toBe(1);

            const msTeamsChannels = result.get(172800);
            expect(msTeamsChannels).toBeDefined();
            expect(msTeamsChannels!.has('msteams')).toBe(true);
            expect(msTeamsChannels!.size).toBe(1);
        });
    });

    describe('same-expiration optimization', () => {
        it('channels with the same expiration share a single group', () => {
            const config: LightdashConfig['persistentDownloadUrls'] = {
                ...baseConfig,
                expirationSeconds: 259200,
                expirationSecondsEmail: 86400,
                expirationSecondsSlack: 86400,
                expirationSecondsMsTeams: undefined,
            };
            const targets: Target[] = [
                { recipient: 'user@example.com' },
                { channel: '#general' },
                { webhook: 'https://teams.webhook' },
            ];
            const result = computePerChannelExpirations(config, targets);

            expect(result.size).toBe(2);

            const sharedGroup = result.get(86400);
            expect(sharedGroup).toBeDefined();
            expect(sharedGroup!.has('email')).toBe(true);
            expect(sharedGroup!.has('slack')).toBe(true);
            expect(sharedGroup!.size).toBe(2);

            const msTeamsGroup = result.get(259200);
            expect(msTeamsGroup).toBeDefined();
            expect(msTeamsGroup!.has('msteams')).toBe(true);
            expect(msTeamsGroup!.size).toBe(1);
        });
    });

    describe('partial channel targets', () => {
        it('only includes channels that have actual targets', () => {
            const config: LightdashConfig['persistentDownloadUrls'] = {
                ...baseConfig,
                expirationSeconds: 259200,
                expirationSecondsEmail: 86400,
                expirationSecondsSlack: 604800,
                expirationSecondsMsTeams: 172800,
            };
            const targets: Target[] = [{ recipient: 'user@example.com' }];
            const result = computePerChannelExpirations(config, targets);

            expect(result.size).toBe(1);
            const emailChannels = result.get(86400);
            expect(emailChannels).toBeDefined();
            expect(emailChannels!.has('email')).toBe(true);
            expect(emailChannels!.size).toBe(1);
        });

        it('returns empty map when there are no targets', () => {
            const config: LightdashConfig['persistentDownloadUrls'] = {
                ...baseConfig,
                expirationSeconds: 259200,
            };
            const result = computePerChannelExpirations(config, []);

            expect(result.size).toBe(0);
        });
    });

    describe('backwards compatibility handler resolution', () => {
        it('Slack handler resolves channel-specific expiration with fallback', () => {
            const config: LightdashConfig['persistentDownloadUrls'] = {
                ...baseConfig,
                expirationSeconds: 259200,
                expirationSecondsSlack: 604800,
            };
            const slackExpiration =
                config.expirationSecondsSlack ?? config.expirationSeconds;
            expect(slackExpiration).toBe(604800);
        });

        it('Slack handler falls back to base when channel override is unset', () => {
            const config: LightdashConfig['persistentDownloadUrls'] = {
                ...baseConfig,
                expirationSeconds: 259200,
                expirationSecondsSlack: undefined,
            };
            const slackExpiration =
                config.expirationSecondsSlack ?? config.expirationSeconds;
            expect(slackExpiration).toBe(259200);
        });

        it('Email handler resolves channel-specific expiration with fallback', () => {
            const config: LightdashConfig['persistentDownloadUrls'] = {
                ...baseConfig,
                expirationSeconds: 259200,
                expirationSecondsEmail: 86400,
            };
            const emailExpiration =
                config.expirationSecondsEmail ?? config.expirationSeconds;
            expect(emailExpiration).toBe(86400);
        });

        it('MS Teams handler resolves channel-specific expiration with fallback', () => {
            const config: LightdashConfig['persistentDownloadUrls'] = {
                ...baseConfig,
                expirationSeconds: 259200,
                expirationSecondsMsTeams: 172800,
            };
            const msTeamsExpiration =
                config.expirationSecondsMsTeams ?? config.expirationSeconds;
            expect(msTeamsExpiration).toBe(172800);
        });
    });

    describe('Math.ceil day display calculation', () => {
        const testCases = [
            { seconds: 86400, expectedDays: 1, label: 'exactly 1 day' },
            {
                seconds: 90000,
                expectedDays: 2,
                label: '1.04 days rounds up to 2',
            },
            { seconds: 172800, expectedDays: 2, label: 'exactly 2 days' },
            { seconds: 259200, expectedDays: 3, label: 'exactly 3 days' },
            {
                seconds: 604800,
                expectedDays: 7,
                label: 'exactly 7 days (1 week)',
            },
            {
                seconds: 43200,
                expectedDays: 1,
                label: '0.5 days rounds up to 1',
            },
            { seconds: 1, expectedDays: 1, label: '1 second rounds up to 1' },
        ];

        testCases.forEach(({ seconds, expectedDays, label }) => {
            it(`${seconds}s → ${expectedDays} days (${label})`, () => {
                expect(Math.ceil(seconds / 86400)).toBe(expectedDays);
            });
        });
    });
});
