import { ApiConnectorType } from '../types/querySources';
import {
    getHydraSettingsProblem,
    HYDRA_DEFAULT_SETTINGS,
    HYDRA_DEFAULT_SOURCE,
    HYDRA_SETTINGS_SCHEMA,
    withHydraDefaults,
} from './hydraLiveSource';

const hydra = (settings: Record<string, unknown> = {}) => ({
    connector: ApiConnectorType.HYDRA,
    ...settings,
});

const field = (id: string) => ({ id, label: id, type: 'string' });
const object = (id: string, fields: unknown[] = [field('stage')]) => ({
    id,
    label: id,
    fields,
});

describe('Hydra settings', () => {
    it('fills in every setting a source leaves out', () => {
        expect(withHydraDefaults(HYDRA_DEFAULT_SOURCE)).toEqual(
            HYDRA_DEFAULT_SETTINGS,
        );
        expect(
            withHydraDefaults({ ...HYDRA_DEFAULT_SOURCE, rowCount: 50 }),
        ).toEqual({ ...HYDRA_DEFAULT_SETTINGS, rowCount: 50 });
    });

    it('finds no problem with a source that sets nothing, or everything', () => {
        expect(getHydraSettingsProblem(HYDRA_DEFAULT_SOURCE)).toBeNull();
        expect(
            getHydraSettingsProblem(
                hydra({ rowCount: 50, objects: [object('Deals')] }),
            ),
        ).toBeNull();
    });

    it('reads a stored source saved in an older shape, dropping what no longer fits', () => {
        const stored = hydra({
            rowCount: 50,
            latencyMs: 500,
            sourceName: 'hydra',
            lastScan: { fields: [], scannedAt: '2026-11-23' },
        });
        expect(HYDRA_SETTINGS_SCHEMA.parse(stored)).toEqual(
            hydra({ rowCount: 50 }),
        );
        // The API still refuses the same shape
        expect(getHydraSettingsProblem(stored)).not.toBeNull();
    });

    it.each([
        [{ rowCount: -1 }, 'rowCount must be a whole number from 0 to 100000'],
        [{ speed: 1 }, 'speed is not a Hydra setting'],
        [{ latencyMs: 500 }, 'latencyMs is not a Hydra setting'],
        [
            { objects: [object('Deals'), object('Deals')] },
            'objects must have unique ids',
        ],
        [
            { objects: [object('Deals', [field('stage'), field('stage')])] },
            'objects.0.fields must have unique ids',
        ],
        [
            {
                objects: Array.from({ length: 11 }, (_, index) =>
                    object(`Object${index}`),
                ),
            },
            'objects must have at most 10 entries',
        ],
    ])('names the field and what it allows for %o', (settings, problem) => {
        expect(getHydraSettingsProblem(hydra(settings))).toEqual(problem);
    });
});
