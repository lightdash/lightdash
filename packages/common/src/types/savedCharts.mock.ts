/* eslint-disable no-useless-escape */

// prettier-ignore
export const PIVOT_KEYS: Record<string, [string, string]> = {
    'y_axis.test': ['y_axis', 'test'],
    'y_axis.endswith\.': ['y_axis', 'endswith.'],
    'y_axis.\.startswith': ['y_axis', '.startswith'],
    'y_axis.12\.01\.2020': ['y_axis', '12.01.2020'],
    'y_axis.test!@/': ['y_axis', 'test!@/'],
};

export default PIVOT_KEYS;
