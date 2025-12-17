/* insert migration number 404 into knex migrations table for testing */
INSERT INTO 
   knex_migrations (id, "name", batch, migration_time) 
VALUES (404, '20251210100000_test_migration', 1, NOW());