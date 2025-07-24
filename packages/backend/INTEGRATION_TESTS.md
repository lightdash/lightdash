# Backend Integration Tests

This guide explains how to run integration tests for the Lightdash backend.

## Prerequisites

1. **Environment Variables**
   ```bash
   # Required for Enterprise Edition features
   LIGHTDASH_LICENSE_KEY=your-license-key
   
   # Required for AI agent tests
   OPENAI_API_KEY=your-openai-api-key
   
   # PostgreSQL connection string
   PGCONNECTIONURI=postgresql://user:password@localhost:5432/lightdash
   ```

2. **Build Backend**
   Integration tests require compiled JavaScript files for migrations and seeds:
   ```bash
   pnpm -F backend build
   ```

3. **Test Database**
   The test setup automatically uses a database named `{your_database}_test`. For example, if your main database is `lightdash`, the test database will be `lightdash_test`.
   
   Create the test database manually:
   ```bash
   createdb lightdash_test
   ```

## Running Integration Tests

```bash
# Run all integration tests
pnpm -F backend test:integration

# Run with watch mode for development
pnpm -F backend test:integration:dev
```

## Writing Integration Tests

Integration tests should:
- Use the `.integration.test.ts` or `.integration.spec.ts` naming convention
- Be placed in the `src/ee/**` directory
- Use the `setupIntegrationTest()` helper for database and app setup
- Clean up after themselves (handled automatically by the setup)

## Troubleshooting

1. **Database not found error**
   - Ensure the test database exists: `createdb {your_database}_test`

2. **Migration errors**
   - Make sure you've built the backend: `pnpm -F backend build`
   - Check that migrations are up to date in the main database

3. **License key errors**
   - Ensure `LIGHTDASH_LICENSE_KEY` is set in your environment

4. **OpenAI API errors**
   - Tests requiring OpenAI will skip if `OPENAI_API_KEY` is not set
   - Set a valid API key to run AI agent tests