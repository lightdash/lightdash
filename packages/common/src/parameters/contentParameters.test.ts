import { type ParameterDefinitions } from '../types/parameters';
import { getContentParameters } from './contentParameters';

const projectDefinitions: ParameterDefinitions = {
    region: {
        label: 'Region',
        type: 'string',
        options: ['EMEA', 'APAC'],
        default: 'EMEA',
    },
    currency: { label: 'Currency', type: 'string' },
};
const modelDefinitions: ParameterDefinitions = {
    min_amount: { label: 'Minimum amount', type: 'number', default: 10 },
};
const definitions: ParameterDefinitions = {
    ...projectDefinitions,
    ...modelDefinitions,
};
const now = new Date('2026-11-05T12:00:00Z');

describe('getContentParameters', () => {
    it('lists each referenced parameter once, in reference order', () => {
        const result = getContentParameters({
            parameterReferences: ['min_amount', 'region', 'min_amount'],
            definitions,
            projectDefinitions,
            savedValues: {},
            now,
        });
        expect(result.map(({ name }) => name)).toEqual([
            'min_amount',
            'region',
        ]);
    });

    it('says whether each is defined in the project or a model', () => {
        const result = getContentParameters({
            parameterReferences: ['region', 'min_amount'],
            definitions,
            projectDefinitions,
            savedValues: {},
            now,
        });
        expect(result.map(({ source }) => source)).toEqual([
            'project',
            'model',
        ]);
    });

    it('counts a model definition that shadows a project one as the model', () => {
        const shadowing = {
            region: { label: 'Model region', type: 'string' as const },
        };
        const result = getContentParameters({
            parameterReferences: ['region'],
            definitions: { ...projectDefinitions, ...shadowing },
            projectDefinitions,
            savedValues: {},
            now,
        });
        expect(result[0]).toMatchObject({
            source: 'model',
            config: shadowing.region,
        });
    });

    it('takes the saved value, else the default, else null', () => {
        const result = getContentParameters({
            parameterReferences: ['region', 'min_amount', 'currency'],
            definitions,
            projectDefinitions,
            savedValues: { region: 'APAC' },
            now,
        });
        expect(result.map(({ currentValue }) => currentValue)).toEqual([
            'APAC',
            10,
            null,
        ]);
    });

    it('ignores a saved value outside the fixed options', () => {
        const result = getContentParameters({
            parameterReferences: ['region'],
            definitions,
            projectDefinitions,
            savedValues: { region: 'LATAM' },
            now,
        });
        expect(result[0].currentValue).toBe('EMEA');
    });

    it('resolves a "today" default to a date', () => {
        const result = getContentParameters({
            parameterReferences: ['from'],
            definitions: {
                from: { label: 'From', type: 'date', default: 'today' },
            },
            projectDefinitions: {},
            savedValues: {},
            now,
            timezone: 'UTC',
        });
        expect(result[0].currentValue).toBe('2026-11-05');
    });

    it('leaves out a reference with no definition', () => {
        const result = getContentParameters({
            parameterReferences: ['unknown', 'region'],
            definitions,
            projectDefinitions,
            savedValues: {},
            now,
        });
        expect(result.map(({ name }) => name)).toEqual(['region']);
    });
});
