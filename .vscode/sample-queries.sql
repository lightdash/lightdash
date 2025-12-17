-- Lightdash Development Database Queries
-- This file is for testing and debugging SQL queries against your local Lightdash database
-- 
-- To use:
-- 1. Make sure your environment variables are set (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE)
-- 2. Click the SQLTools icon in the sidebar (database icon)
-- 3. Connect to "Lightdash Development DB"
-- 4. Run queries by selecting them and pressing Cmd+E Cmd+E (or Ctrl+E Ctrl+E)

-- Example: List all tables in the public schema
SELECT 
    table_name,
    table_type
FROM 
    information_schema.tables
WHERE 
    table_schema = 'public'
ORDER BY 
    table_name;

-- Example: Check database version
SELECT version();

-- Example: List all users/organizations
-- SELECT * FROM users LIMIT 10;

-- Example: Check recent activity
-- SELECT * FROM analytics LIMIT 10;

-- Add your own queries below:
