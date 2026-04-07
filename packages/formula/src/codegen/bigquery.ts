import { BaseSqlGenerator } from './base';
import type { StringLiteralNode } from '../types';

export class BigQuerySqlGenerator extends BaseSqlGenerator {
    protected quoteIdentifier(name: string): string {
        return `\`${name.replace(/`/g, '\\`')}\``;
    }

    protected generateStringLiteral(node: StringLiteralNode): string {
        // BigQuery treats ''' as a triple-quoted string opener,
        // so we must use backslash escaping instead of doubling quotes
        const escaped = node.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `'${escaped}'`;
    }

    protected generateModulo(left: string, right: string): string {
        // BigQuery MOD requires matching numeric types
        return `MOD(CAST(${left} AS NUMERIC), CAST(${right} AS NUMERIC))`;
    }
}
