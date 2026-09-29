import { readFileSync } from 'fs';
import path from 'path';
import schema from '../schemas/json/lightdash-dbt-2.0.json';
import { findYamlKeyTypos } from './learnYamlKeyTypos';

const find = (content: string) =>
    findYamlKeyTypos(content, schema as Record<string, unknown>);

const model = (lines: string[]) =>
    ['version: 2', 'models:', '  - name: orders', ...lines].join('\n');

describe('findYamlKeyTypos', () => {
    it('names a misspelt model key and where it is', () => {
        expect(find(model(['    descripton: Every order']))).toEqual([
            {
                key: 'descripton',
                suggestion: 'description',
                line: 4,
                column: 5,
                endColumn: 15,
            },
        ]);
    });

    it('finds a slip at any depth: column, dimension, metric, join', () => {
        const typos = find(
            model([
                '    meta:',
                '      joins:',
                '        - join: customers',
                '          relatiosnship: many_to_one',
                '    columns:',
                '      - name: amount',
                '        desciption: Order value',
                '        meta:',
                '          dimenson:',
                '            type: number',
                '          metrics:',
                '            total_amount:',
                '              tpye: sum',
            ]),
        );
        expect(typos.map((t) => `${t.key}>${t.suggestion}@${t.line}`)).toEqual([
            'relatiosnship>relationship@7',
            'desciption>description@10',
            'dimenson>dimension@12',
            'tpye>type@16',
        ]);
    });

    it('leaves alone keys the schema does not list but Lightdash reads', () => {
        expect(
            find(
                model([
                    '    config:',
                    '      tags: ["core"]',
                    '    columns:',
                    '      - name: amount',
                    '        data_type: numeric',
                    '        meta:',
                    '          dimension:',
                    '            colors: { a: "#fff" }',
                    '          metrics:',
                    '            total_amount:',
                    '              type: sum',
                    '              filters:',
                    '                - status: completed',
                ]),
            ),
        ).toEqual([]);
    });

    it('never reads a metric or dimension id as a misspelt key', () => {
        expect(
            find(
                model([
                    '    columns:',
                    '      - name: amount',
                    '        meta:',
                    '          metrics:',
                    '            labels:',
                    '              type: count',
                    '          additional_dimensions:',
                    '            hiden:',
                    '              type: string',
                    '              sql: ${amount}',
                ]),
            ),
        ).toEqual([]);
    });

    it('says nothing about a file that does not parse, or is not a mapping', () => {
        expect(find('models:\n  - name: [oops')).toEqual([]);
        expect(find('')).toEqual([]);
        expect(find('- just\n- a list')).toEqual([]);
    });

    it('flags only the two real mistakes in the shipped learn bundle', () => {
        const bundle = JSON.parse(
            readFileSync(
                path.join(
                    __dirname,
                    '../../../backend/assets/learn/jaffle-dbt.json',
                ),
                'utf8',
            ),
        ) as { files: { path: string; content: string }[] };
        const hits = bundle.files
            .filter((f) => /^models\/.*\.ya?ml$/.test(f.path))
            .flatMap((f) =>
                find(f.content).map(
                    (t) => `${f.path}:${t.line} ${t.key}>${t.suggestion}`,
                ),
            );
        // Both are slips in the sample project itself. Anything new here is
        // either another one or, more likely, a false alarm to fix.
        expect(hits).toEqual([
            'models/events.yml:385 group>groups',
            'models/fanouts_examples/fanouts_addresses.yml:16 relatiosnship>relationship',
        ]);
    });
});
