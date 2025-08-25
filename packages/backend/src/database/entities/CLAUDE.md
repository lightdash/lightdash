# Entity Files Guide

This document provides guidelines for creating and using entity files in the Lightdash database layer.

## Entity File Structure

Each entity file in this directory defines the database schema types for a specific table. The standard pattern includes:

1. A constant for the table name
2. A type for the result/row definition
3. A Knex composite table type

### Example Structure

```typescript
export const MyTableName = 'example';

// Type for my result/row definition
export type DbMyTable = {
    user_uuid: string;
    created_at: Date;
    example: string;
};

// Knex table type
export type ExampleTable = Knex.CompositeTableType<
    DbMyTable,
    Pick<DbMyTable, 'user_uuid' | 'example'>, // insert type
    Pick<DbMyTable, 'example'> // update type, used if different from insert
>;
```

## Extending Knex Typing

After defining your entity types, you must extend the Knex typing in `packages/backend/src/@types/knex-tables.d.ts`:

```typescript
// In knex-tables.d.ts
declare module 'knex/types/tables' {
    interface Tables {
        [MyTableName]: ExampleTable; // Correct
    }
}
```

### Common Mistakes

The most common mistake is using the result definition instead of the table type:

```typescript
// WRONG
declare module 'knex/types/tables' {
    interface Tables {
        [MyTableName]: DbMyTable; // Wrong - using result type instead of table type
    }
}
```

Instead do this:

```typescript
declare module 'knex/types/tables' {
    interface Tables {
        [MyTableName]: ExampleTable; // Correct - using table type
    }
}
```

## Type Guidelines

-   Use `null` instead of `undefined` or optional types (`?`) for nullable database fields since databases don't have the concept of undefined
-   Use `Pick<>` to specify which fields are required for insert operations
-   Specify a separate update type if it differs from the insert type
-   Use descriptive names: `DbTableName` for row definitions and `TableNameTable` for Knex composite types

## Examples from the Codebase

### Basic Example

```typescript
export const ValidationTableName = 'validations';

export type DbValidationTable = {
    validation_id: number;
    created_at: Date;
    project_uuid: string;
    error: string;
    // ...other fields
};

export type ValidationTable = Knex.CompositeTableType<DbValidationTable>;
```

### Example with Insert Type

```typescript
export const UserAttributesTable = 'user_attributes';

export type DbUserAttribute = {
    user_attribute_uuid: string;
    created_at: Date;
    name: string;
    description?: string;
    organization_id: number;
    attribute_default: string | null;
};

export type UserAttributeTable = Knex.CompositeTableType<
    DbUserAttribute,
    Pick<
        DbUserAttribute,
        'name' | 'description' | 'organization_id' | 'attribute_default'
    >
>;
```

### Example with Insert and Update Types

```typescript
export const OpenIdIdentitiesTableName = 'openid_identities';

export type DbOpenIdIdentity = {
    issuer: string;
    issuer_type: OpenIdIdentityIssuerType;
    subject: string;
    user_id: number;
    created_at: Date;
    email: string;
    refresh_token?: string;
    team_id?: string;
};

export type OpenIdIdentitiesTable = Knex.CompositeTableType<
    DbOpenIdIdentity,
    Omit<DbOpenIdIdentity, 'created_at'>, // insert type
    Pick<DbOpenIdIdentity, 'refresh_token'> // update type
>;
```
