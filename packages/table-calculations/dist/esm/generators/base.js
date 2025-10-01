import { Context } from 'effect';
// Service for field resolution with parameterization support
export class FieldResolver extends Context.Tag('FieldResolver')() {
}
// Service for SQL dialect configuration
export class SQLDialect extends Context.Tag('SQLDialect')() {
}
// Base SQL generator interface
export class BaseSQLGenerator {
    quoteIdentifier(name) {
        // Default implementation, can be overridden
        return `"${name}"`;
    }
}
//# sourceMappingURL=base.js.map