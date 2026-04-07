import { BaseSqlGenerator } from './base';

export class BigQuerySqlGenerator extends BaseSqlGenerator {
    protected quoteIdentifier(name: string): string {
        return `\`${name.replace(/`/g, '\\`')}\``;
    }
}
