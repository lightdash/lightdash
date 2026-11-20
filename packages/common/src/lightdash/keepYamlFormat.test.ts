import { parseDocument } from 'yaml';
import { stringifyKeepingFormat } from './keepYamlFormat';

const edit = (
    source: string,
    change: (doc: ReturnType<typeof parseDocument>) => void,
) => {
    const doc = parseDocument(source);
    change(doc);
    return stringifyKeepingFormat(source, doc);
};

const MODEL = `type: model
name: progression
# kept as written
description: Cumulative championship points by driver per round, shows how the title
  battle evolved
dimensions:
- name: driver_id
  type: number
  colors:
    A: '#64C4FF'
- name: round_points
  type: number
  metrics:
    total_round_points:
      type: sum
`;

describe('stringifyKeepingFormat', () => {
    test('adding a metric touches only the lines it adds', () => {
        expect(
            edit(MODEL, (doc) =>
                doc.setIn(
                    ['dimensions', 1, 'metrics', 'average_points'],
                    doc.createNode({ type: 'average', label: 'Average' }),
                ),
            ),
        ).toBe(
            `${MODEL}    average_points:\n      type: average\n      label: Average\n`,
        );
    });

    test('a new dimension takes the file own list indent', () => {
        const indented = `type: model\nname: m\ndimensions:\n  - name: a\n    type: string\n`;
        expect(
            edit(indented, (doc) =>
                doc.addIn(
                    ['dimensions'],
                    doc.createNode({ name: 'b', type: 'number' }),
                ),
            ),
        ).toBe(`${indented}  - name: b\n    type: number\n`);
    });

    test('a new dimension after a changed one keeps their order', () => {
        const result = edit(MODEL, (doc) => {
            doc.setIn(['dimensions', 1, 'label'], 'Points');
            doc.addIn(
                ['dimensions'],
                doc.createNode({ name: 'team', type: 'string' }),
            );
        });
        expect(result).toBe(
            `${MODEL}  label: Points\n- name: team\n  type: string\n`,
        );
    });

    test('removing a dimension removes only its lines', () => {
        expect(edit(MODEL, (doc) => doc.deleteIn(['dimensions', 0]))).toBe(
            MODEL.replace(
                `- name: driver_id\n  type: number\n  colors:\n    A: '#64C4FF'\n`,
                '',
            ),
        );
    });

    test('a changed value is rewritten in place', () => {
        expect(
            edit(MODEL, (doc) =>
                doc.setIn(['dimensions', 0, 'type'], 'string'),
            ),
        ).toBe(
            MODEL.replace('type: number\n  colors', 'type: string\n  colors'),
        );
    });

    test('falls back to the whole document when the shape changes', () => {
        const result = edit(MODEL, (doc) => doc.set('dimensions', 'none'));
        expect(parseDocument(result).toJSON()).toEqual({
            ...parseDocument(MODEL).toJSON(),
            dimensions: 'none',
        });
    });
});
