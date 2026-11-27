import { ApiConnectorType, DimensionType } from '@lightdash/common';
import { HYDRA_USERS_EXPLORE } from '../integrations/hydra/model';
import { getLiveBaseLayer } from './build';
import { type LiveExploreDefinition } from './definition';
import {
    applyLiveSourceExploreChanges,
    getLiveFieldEditKey,
    getLiveModelEdits,
    isLiveExploreInUse,
    listLiveSourceFields,
    type LiveSourceFieldEdits,
} from './fields';
import { parseLiveSourceFieldState } from './source';

describe('declared live source fields', () => {
    test.each(Object.values(ApiConnectorType))(
        'every declared %s field tells people and agents what it means',
        (connector) => {
            const { definitions } = getLiveBaseLayer(connector);
            const undescribed = definitions
                .flatMap((definition) => [
                    ...definition.dimensions,
                    ...definition.metrics,
                ])
                .filter((field) => !field.description?.trim())
                .map((field) => field.name);
            expect(undescribed).toEqual([]);
        },
    );
});

describe('field edits of several explores', () => {
    const edits = {
        amount: { inUse: true, lastEdit: null },
        'contacts.createdate': { inUse: true, lastEdit: null },
        'companies.createdate': { inUse: false, lastEdit: null },
    };

    it('keeps the first explore’s edits under bare names, as stored before', () => {
        expect(getLiveFieldEditKey(null, 'amount')).toBe('amount');
        expect(getLiveFieldEditKey('contacts', 'email')).toBe('contacts.email');
    });

    it('gives each explore only its own edits', () => {
        expect(getLiveModelEdits(edits, 'contacts')).toEqual({
            createdate: { inUse: true, lastEdit: null },
        });
        expect(getLiveModelEdits(edits, null)).toEqual({
            amount: { inUse: true, lastEdit: null },
        });
    });
});

describe('fields in use', () => {
    const definition: LiveExploreDefinition = {
        ...HYDRA_USERS_EXPLORE,
        dimensions: [
            ...HYDRA_USERS_EXPLORE.dimensions,
            {
                name: 'internal_id',
                apiName: 'internal_id',
                label: 'Internal id',
                type: DimensionType.STRING,
                filterOperators: [],
                onByDefault: false,
            },
            {
                name: 'region',
                apiName: 'region',
                label: 'Region',
                type: DimensionType.STRING,
                filterOperators: [],
            },
        ],
    };
    const declaredNames = new Set(
        [...HYDRA_USERS_EXPLORE.dimensions, ...HYDRA_USERS_EXPLORE.metrics].map(
            ({ name }) => name,
        ),
    );
    const inUse = (edits: LiveSourceFieldEdits) =>
        Object.fromEntries(
            listLiveSourceFields({
                definition,
                declaredNames,
                edits,
                usageByFieldName: {},
            })
                .filter(({ name }) => ['internal_id', 'region'].includes(name))
                .map(({ name, inUse: isInUse }) => [name, isInUse]),
        );

    it('starts a field as its definition says, on when it says nothing', () => {
        expect(inUse({})).toEqual({ internal_id: false, region: true });
    });

    it('keeps the state an admin set over the default', () => {
        expect(
            inUse({
                internal_id: { inUse: true, lastEdit: null },
                region: { inUse: false, lastEdit: null },
            }),
        ).toEqual({ internal_id: true, region: false });
    });
});

describe('explore edits', () => {
    const editor = { userUuid: 'user-1', userName: 'Ada', at: '2026-11-24' };

    it('reads a missing or unreadable explores key as every explore on', () => {
        expect(parseLiveSourceFieldState({}).explores).toEqual({});
        expect(parseLiveSourceFieldState({ explores: 'bad' }).explores).toEqual(
            {},
        );
        const { explores } = parseLiveSourceFieldState({
            explores: { users: { inUse: false } },
        });
        expect(isLiveExploreInUse(explores, 'users')).toBe(false);
        expect(isLiveExploreInUse(explores, 'events')).toBe(true);
        expect(isLiveExploreInUse(explores, 'events', false)).toBe(false);
    });

    it('stores whether an explore is on as set, and clears texts set to null', () => {
        const off = applyLiveSourceExploreChanges({
            current: {},
            changes: [{ model: 'users', inUse: false, label: ' People ' }],
            editor,
        });
        expect(off).toEqual({
            users: { inUse: false, label: 'People', lastEdit: editor },
        });
        expect(
            applyLiveSourceExploreChanges({
                current: off,
                changes: [{ model: 'users', inUse: true, label: null }],
                editor,
            }),
        ).toEqual({ users: { inUse: true, lastEdit: editor } });
    });

    it('refuses an empty label or text over the limit', () => {
        expect(() =>
            applyLiveSourceExploreChanges({
                current: {},
                changes: [{ model: 'users', label: '  ' }],
                editor,
            }),
        ).toThrow('needs a label');
        expect(() =>
            applyLiveSourceExploreChanges({
                current: {},
                changes: [{ model: 'users', aiHint: 'a'.repeat(2001) }],
                editor,
            }),
        ).toThrow('over 2000 characters');
    });
});
