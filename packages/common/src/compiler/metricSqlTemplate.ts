import { CompileError } from '../types/errors';
import {
    type CompiledMetricSqlPart,
    type CompiledMetricSqlTemplate,
} from '../types/field';

/** Apply the existing warehouse SQL wrapper without losing filter occurrences. */
export const transformMetricSqlTemplate = (
    parts: CompiledMetricSqlTemplate,
    transform: (sql: string) => string,
): CompiledMetricSqlTemplate => {
    const source = parts
        .map((part) => (part.type === 'sql' ? part.sql : part.compiledSql))
        .join('');
    let prefix = '__lightdash_metric_filter_';
    while (source.includes(prefix)) prefix += '_';
    const slots = new Map<string, CompiledMetricSqlPart>();
    const templateSql = parts
        .map((part, index) => {
            if (part.type === 'sql') return part.sql;
            const token = `${prefix}${index}__`;
            slots.set(token, part);
            return token;
        })
        .join('');
    const transformed = transform(templateSql);
    const result: CompiledMetricSqlTemplate = [];
    let offset = 0;
    while (offset < transformed.length) {
        const start = transformed.indexOf(prefix, offset);
        if (start === -1) {
            result.push({ type: 'sql', sql: transformed.slice(offset) });
            break;
        }
        const end = transformed.indexOf('__', start + prefix.length);
        const token = transformed.slice(start, end + 2);
        const part = slots.get(token);
        if (!part || end === -1) {
            throw new CompileError(
                'Metric filter template was modified by SQL compilation',
            );
        }
        if (start > offset) {
            result.push({ type: 'sql', sql: transformed.slice(offset, start) });
        }
        result.push(part);
        offset = end + 2;
    }
    return result;
};
