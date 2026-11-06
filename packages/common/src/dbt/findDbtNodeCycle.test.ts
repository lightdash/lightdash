import { findDbtNodeCycle } from './findDbtNodeCycle';

const node = (unique_id: string, nodes: string[] = []) => ({
    unique_id,
    depends_on: { nodes },
});

describe('findDbtNodeCycle', () => {
    it('allows project cycles when model dependencies form a DAG', () => {
        expect(
            findDbtNodeCycle([
                node('model.a.uses', ['model.b.base']),
                node('model.b.uses', ['model.a.base']),
                node('model.a.base'),
                node('model.b.base'),
            ]),
        ).toBeNull();
    });
    it('returns the ordered node cycle including the closing node', () => {
        expect(
            findDbtNodeCycle([
                node('model.a.uses', ['model.b.uses']),
                node('model.b.uses', ['model.c.uses']),
                node('model.c.uses', ['model.a.uses']),
            ]),
        ).toEqual([
            'model.a.uses',
            'model.b.uses',
            'model.c.uses',
            'model.a.uses',
        ]);
    });
    it('checks disconnected components and ignores unknown dependencies', () => {
        expect(
            findDbtNodeCycle([
                node('model.a.ok', ['source.a.raw']),
                node('seed.b.loop', ['seed.b.loop']),
            ]),
        ).toEqual(['seed.b.loop', 'seed.b.loop']);
        expect(findDbtNodeCycle([])).toBeNull();
    });
});

it('checks a deep acyclic model chain without using the call stack', () => {
    const nodes = Array.from({ length: 20000 }, (_, index) =>
        node(
            `model.a.m${index}`,
            index === 19999 ? [] : [`model.a.m${index + 1}`],
        ),
    );
    expect(findDbtNodeCycle(nodes)).toBeNull();
});

it('returns cycles that include snapshots and seeds', () => {
    expect(
        findDbtNodeCycle([
            node('model.a.m', ['model.b.m']),
            node('model.b.m', ['snapshot.b.s']),
            node('snapshot.b.s', ['model.a.m']),
            node('seed.a.raw'),
        ]),
    ).toEqual(['model.a.m', 'model.b.m', 'snapshot.b.s', 'model.a.m']);
});
