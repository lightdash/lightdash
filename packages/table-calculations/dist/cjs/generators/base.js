"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseSQLGenerator = exports.SQLDialect = exports.FieldResolver = void 0;
const effect_1 = require("effect");
// Service for field resolution with parameterization support
class FieldResolver extends effect_1.Context.Tag('FieldResolver')() {
}
exports.FieldResolver = FieldResolver;
// Service for SQL dialect configuration
class SQLDialect extends effect_1.Context.Tag('SQLDialect')() {
}
exports.SQLDialect = SQLDialect;
// Base SQL generator interface
class BaseSQLGenerator {
    quoteIdentifier(name) {
        // Default implementation, can be overridden
        return `"${name}"`;
    }
}
exports.BaseSQLGenerator = BaseSQLGenerator;
//# sourceMappingURL=base.js.map