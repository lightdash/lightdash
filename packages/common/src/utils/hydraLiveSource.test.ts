import {
    formatHydraBehaviour,
    getHydraSettingsProblem,
    HYDRA_DEFAULT_SETTINGS,
    parseHydraBehaviour,
} from './hydraLiveSource';

describe('Hydra behaviour', () => {
    it('reads blank as the defaults', () => {
        expect(parseHydraBehaviour('  ')).toEqual(HYDRA_DEFAULT_SETTINGS);
    });

    it('reads what it formats', () => {
        const settings = {
            ...HYDRA_DEFAULT_SETTINGS,
            latencyMs: 250,
            errorRate: 0.25,
            failAuth: true,
            pageSize: 50,
        };
        expect(parseHydraBehaviour(formatHydraBehaviour(settings))).toEqual(
            settings,
        );
    });

    it('writes only the keys that differ from the defaults', () => {
        expect(formatHydraBehaviour(HYDRA_DEFAULT_SETTINGS)).toBe('');
        expect(
            formatHydraBehaviour({
                ...HYDRA_DEFAULT_SETTINGS,
                latencyMs: 3000,
            }),
        ).toBe('latencyMs=3000');
    });

    it('writes and reads JSON once a key needs it', () => {
        const settings = {
            ...HYDRA_DEFAULT_SETTINGS,
            latencyMs: 100,
            declaredLimits: null,
            script: [
                {
                    calls: '2',
                    respond: { status: 429, retryAfterSeconds: 3 },
                },
            ],
        };
        const text = formatHydraBehaviour(settings);
        expect(JSON.parse(text)).toEqual({
            latencyMs: 100,
            declaredLimits: null,
            script: settings.script,
        });
        expect(parseHydraBehaviour(text)).toEqual(settings);
    });

    it.each([
        'speed=1',
        'latencyMs',
        'latencyMs=-1',
        'latencyMs=1.5',
        'errorRate=1.5',
        'failAuth=yes',
        'vendorLimits=1',
        'latencyMs=999999',
        '{"speed": 1}',
        '{"script": [{"calls": "0-", "respond": "ok"}]}',
        '{not json',
        'rowCount=a=b',
    ])('refuses %s', (text) => {
        expect(parseHydraBehaviour(text)).toBeNull();
    });

    it.each([
        [
            { latencyMs: -1 },
            'latencyMs must be a whole number from 0 to 120000',
        ],
        [{ errorRate: 2 }, 'errorRate must be a number from 0 to 1'],
        [
            { pageSize: 10_001 },
            'pageSize must be a whole number from 0 to 10000',
        ],
        [
            { onLimit: { status: 200, retryAfter: 'none', body: null } },
            expect.stringMatching(/^onLimit\.status: /),
        ],
        [{ failAuth: 'yes' }, 'failAuth must be true or false'],
    ])('names the field and its range for %o', (overrides, problem) => {
        expect(
            getHydraSettingsProblem({
                ...HYDRA_DEFAULT_SETTINGS,
                ...overrides,
            }),
        ).toEqual(problem);
    });

    it('finds no problem with the defaults', () => {
        expect(getHydraSettingsProblem(HYDRA_DEFAULT_SETTINGS)).toBeNull();
    });
});
