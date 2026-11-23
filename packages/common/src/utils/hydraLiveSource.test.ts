import {
    formatHydraBehaviour,
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
            callsPerMinute: 2,
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

    it.each([
        'speed=1',
        'latencyMs',
        'latencyMs=-1',
        'latencyMs=1.5',
        'errorRate=1.5',
        'failAuth=yes',
        'callsPerMinute=0',
        'rowCount=a=b',
    ])('refuses %s', (text) => {
        expect(parseHydraBehaviour(text)).toBeNull();
    });
});
