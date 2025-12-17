# VS Code Workspace Configuration

This directory contains workspace settings for VS Code and compatible IDEs (like Cursor, VSCodium, etc.).

## What's Configured

### Automatic Formatting & Linting

-   **Format on Save**: Enabled with Prettier
-   **ESLint Auto-Fix**: Runs on save to fix linting issues automatically
-   **Tab Size**: 4 spaces (matching the project's Prettier config)

### Required Extensions

When you open this workspace, you'll be prompted to install:

-   **ESLint** (`dbaeumer.vscode-eslint`)
-   **Prettier** (`esbenp.prettier-vscode`)
-   **Dracula Theme** (`dracula-theme.theme-dracula`) - For the workspace color theme
-   **SQLTools** (`mtxr.sqltools`) - SQL database management
-   **SQLTools PostgreSQL Driver** (`mtxr.sqltools-driver-pg`) - PostgreSQL support

### SQL Development Environment

This workspace is configured for PostgreSQL database debugging and development.

#### Setup

The database connection uses standard PostgreSQL environment variables:

-   `PGHOST` - Database host (default: `localhost`)
-   `PGPORT` - Database port (default: `5432`)
-   `PGUSER` - Database user (default: `postgres`)
-   `PGPASSWORD` - Database password (required)
-   `PGDATABASE` - Database name (default: `postgres`)

#### How to Use

1. **Set Environment Variables**: Make sure your PG environment variables are set (usually in `.env` or `.env.development`)
2. **Open SQLTools**: Click the database icon in the VS Code sidebar
3. **Connect**: Click "Lightdash Development DB" → "Connect"
4. **Browse Database**: Explore tables, views, and schemas in the sidebar
5. **Run Queries**:
    - Open `.vscode/sample-queries.sql` for examples
    - Select any SQL query and press `Cmd+E Cmd+E` (Mac) or `Ctrl+E Ctrl+E` (Windows/Linux)
    - Results will appear in a new tab

#### Features

-   🔍 **Browse Schema**: View all tables, columns, and relationships
-   ⚡ **Run Queries**: Execute SQL directly in VS Code
-   📊 **View Results**: See query results in a formatted table
-   💾 **Save Queries**: Keep frequently used queries in `.sql` files
-   🐛 **Debug**: Test and debug SQL queries before using them in code

### Monorepo Support

The ESLint configuration is set up to work correctly with this monorepo structure, with working directories configured for:

-   `packages/common`
-   `packages/warehouses`
-   `packages/cli`
-   `packages/backend`
-   `packages/frontend`
-   `packages/e2e`
-   `packages/sdk-next-test-app`
-   `packages/sdk-test-app`

## How It Works

1. **On Save**: Files are automatically formatted with Prettier and ESLint fixes are applied
2. **Import Organization**: Handled by the `prettier-plugin-organize-imports` plugin (configured in `.prettierrc.json`)
3. **TypeScript**: Uses the workspace TypeScript version for consistency

## Files

-   `settings.json` - Workspace settings for editor behavior, formatting, and linting
-   `extensions.json` - Recommended extensions for this workspace
-   `launch.json` - Debug configurations (if present)

## Troubleshooting

If formatting/linting isn't working:

1. Make sure you've installed the recommended extensions
2. Reload the VS Code window (`Cmd+Shift+P` → "Reload Window")
3. Check that you're using the workspace TypeScript version (should see a prompt)
4. Ensure `node_modules` are installed (`pnpm install`)
