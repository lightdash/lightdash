import { BaseSqlGenerator } from './base';

export class DuckDBSqlGenerator extends BaseSqlGenerator {
    protected quoteIdentifier(name: string): string {
        return `"${name.replace(/"/g, '""')}"`;
    }

    protected generateModulo(left: string, right: string): string {
        return `(${left} % ${right})`;
    }
}
