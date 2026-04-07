import { BaseSqlGenerator } from './base';

export class SnowflakeSqlGenerator extends BaseSqlGenerator {
    protected quoteIdentifier(name: string): string {
        return `"${name.replace(/"/g, '""')}"`;
    }
}
