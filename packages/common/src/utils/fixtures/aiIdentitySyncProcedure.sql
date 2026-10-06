CREATE OR REPLACE PROCEDURE LD_AI_TEST_GRANTS_GOV.AI_GRANTS.SYNC_AI_GRANTS()
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
  run_id      STRING        DEFAULT UUID_STRING();
  started     TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP();
  status      STRING        DEFAULT 'OK';
  granted     INTEGER       DEFAULT 0;
  revoked     INTEGER       DEFAULT 0;
  failures    INTEGER       DEFAULT 0;
  warnings    INTEGER       DEFAULT 0;
  stmt        STRING        DEFAULT '';
  err         STRING        DEFAULT '';
  lvl         STRING        DEFAULT '';
  msg         STRING        DEFAULT '';
  db          STRING;
  ai          STRING;
  rule_mode   STRING;
  pat         STRING;
  fmode       STRING;
  eff_mode    STRING;
  qdb         STRING;
  qrole       STRING;
  sq          STRING;
  dq          STRING;
  pq          STRING;
  gq          STRING;
  fq          STRING;
  n           INTEGER       DEFAULT 0;
  skip_target STRING        DEFAULT '';
  wkind       STRING;
  wtarget     STRING;
  modes       ARRAY         DEFAULT ARRAY_CONSTRUCT();
  rule_cur CURSOR FOR
    SELECT r.database_name, r.ai_role, r.mode, r.pattern_regex, r.future_mode
    FROM LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_RULES r
    JOIN LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_SCOPE s ON s.ai_role = r.ai_role AND s.database_name = r.database_name
    WHERE r.ai_role NOT IN ('PUBLIC', 'ACCOUNTADMIN', 'SECURITYADMIN', 'SYSADMIN', 'USERADMIN', 'ORGADMIN')
    ORDER BY r.database_name;
  role_cur CURSOR FOR
    SELECT DISTINCT ai_role FROM LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_SCOPE
    WHERE ai_role NOT IN ('PUBLIC', 'ACCOUNTADMIN', 'SECURITYADMIN', 'SYSADMIN', 'USERADMIN', 'ORGADMIN');
BEGIN
  INSERT INTO LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_LOG
    SELECT CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), 'WARN',
           'rule ignored: outside admin scope: ' || r.ai_role || ' on ' || r.database_name, NULL
    FROM LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_RULES r
    LEFT JOIN LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_SCOPE s ON s.ai_role = r.ai_role AND s.database_name = r.database_name
    WHERE s.ai_role IS NULL
       OR r.ai_role IN ('PUBLIC', 'ACCOUNTADMIN', 'SECURITYADMIN', 'SYSADMIN', 'USERADMIN', 'ORGADMIN');
  IF (SQLROWCOUNT > 0) THEN
    warnings := warnings + SQLROWCOUNT;
    status := 'WARN';
  END IF;

  stmt := 'SHOW GRANTS TO ROLE PUBLIC';
  EXECUTE IMMEDIATE :stmt;
  pq := LAST_QUERY_ID();

  FOR r IN rule_cur DO
    db := r.database_name;
    ai := r.ai_role;
    rule_mode := UPPER(r.mode);
    pat := r.pattern_regex;
    fmode := UPPER(r.future_mode);
    qdb := '"' || REPLACE(db, '"', '""') || '"';

    stmt := 'SHOW FUTURE GRANTS IN DATABASE ' || qdb;
    EXECUTE IMMEDIATE :stmt;
    dq := LAST_QUERY_ID();
    SELECT COUNT(*) INTO :n FROM TABLE(RESULT_SCAN(:dq))
      WHERE "grant_on" IN ('TABLE','VIEW','MATERIALIZED_VIEW','DYNAMIC_TABLE','EXTERNAL_TABLE','ICEBERG_TABLE','EVENT_TABLE')
        AND "grantee_name" <> :ai;
    eff_mode := IFF(n > 0 OR fmode = 'DATABASE', 'DATABASE', 'SCHEMA');
    IF (fmode = 'SCHEMA' AND n > 0) THEN
      msg := 'future_mode SCHEMA overridden to DATABASE: ' || n || ' database-level future grants exist in ' || db;
      INSERT INTO LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_LOG VALUES (CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), 'INFO', :msg, NULL);
    END IF;
    modes := ARRAY_APPEND(modes, OBJECT_CONSTRUCT('database', db, 'future_mode', eff_mode, 'other_db_future_grants', n));

    stmt := 'SHOW SCHEMAS IN DATABASE ' || qdb || ' LIMIT 10000';
    EXECUTE IMMEDIATE :stmt;
    sq := LAST_QUERY_ID();
    BEGIN
      INSERT INTO LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_DECISIONS (run_id, ai_role, database_name, schema_name, decision, fmode)
        SELECT :run_id, :ai, :db, x.name,
               CASE
                 WHEN s."name" = 'INFORMATION_SCHEMA' THEN 'EXCLUDE'
                 WHEN NOT REGEXP_LIKE(:db, '[A-Z_][A-Z0-9_$]*') THEN 'EXCLUDE'
                 WHEN NOT REGEXP_LIKE(s."name", '[A-Z_][A-Z0-9_$]*') THEN 'EXCLUDE'
                 WHEN :rule_mode = 'EXCLUDE' AND REGEXP_LIKE(s."name", :pat, 'i') THEN 'EXCLUDE'
                 WHEN :rule_mode = 'EXCLUDE' THEN 'ALLOW'
                 ELSE 'EXCLUDE'
               END,
               :eff_mode
        FROM TABLE(RESULT_SCAN(:sq)) s;
    EXCEPTION
      WHEN OTHER THEN
        err := SQLERRM;
        status := IFF(status = 'UNSAFE', 'UNSAFE', 'WARN');
        warnings := warnings + 1;
        msg := 'rule failed, every schema in ' || db || ' treated as EXCLUDE: ' || err;
        INSERT INTO LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_LOG VALUES (CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), 'ERROR', :msg, :pat);
        DELETE FROM LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_DECISIONS WHERE run_id = :run_id AND ai_role = :ai AND database_name = :db;
        INSERT INTO LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_DECISIONS (run_id, ai_role, database_name, schema_name, decision, fmode)
          SELECT :run_id, :ai, :db, "name", 'EXCLUDE', :eff_mode FROM TABLE(RESULT_SCAN(:sq));
    END;

    SELECT COUNT(DISTINCT ai_role || '.' || database_name || '.' || schema_name) INTO :n
    FROM LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_DECISIONS WHERE run_id = :run_id;
    msg := 'progress=' || n;
    INSERT INTO LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_LOG VALUES (CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), 'INFO', :msg, NULL);

    SELECT COUNT(*) INTO :n FROM TABLE(RESULT_SCAN(:pq)) p
      LEFT JOIN (
        SELECT database_name || '.' || schema_name AS disp
        FROM LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_DECISIONS
        WHERE run_id = :run_id AND ai_role = :ai AND database_name = :db
        GROUP BY 1
        HAVING MAX(IFF(decision = 'ALLOW', 1, 0)) = 1
           AND MAX(IFF(decision IN ('EXCLUDE'), 1, 0)) = 0
      ) d ON p."name" = d.disp OR STARTSWITH(p."name", d.disp || '.')
      WHERE p."granted_on" NOT IN ('DATABASE', 'ROLE', 'WAREHOUSE', 'ACCOUNT')
        AND STARTSWITH(p."name", :db || '.')
        AND d.disp IS NULL;
    IF (n > 0) THEN
      status := 'UNSAFE';
      msg := 'PUBLIC holds ' || n || ' grants on excluded schemas or their objects in ' || db;
      INSERT INTO LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_LOG VALUES (CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), 'ERROR', :msg, NULL);
    END IF;
  END FOR;

  FOR ar IN role_cur DO
    ai := ar.ai_role;
    qrole := '"' || REPLACE(ai, '"', '""') || '"';
    stmt := 'SHOW GRANTS TO ROLE ' || qrole;
    EXECUTE IMMEDIATE :stmt;
    gq := LAST_QUERY_ID();
    stmt := 'SHOW FUTURE GRANTS TO ROLE ' || qrole;
    EXECUTE IMMEDIATE :stmt;
    fq := LAST_QUERY_ID();

    SELECT COUNT(*) INTO :n FROM TABLE(RESULT_SCAN(:gq))
      WHERE "granted_on" = 'ROLE' OR ("privilege" = 'OWNERSHIP' AND "granted_on" NOT IN ('WAREHOUSE'));
    IF (n > 0) THEN
      status := 'UNSAFE';
      msg := ai || ' inherits ' || n || ' roles or owns objects; the sync cannot bound what it reads';
      INSERT INTO LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_LOG VALUES (CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), 'ERROR', :msg, NULL);
    END IF;

    LET work RESULTSET := (
      WITH
      types AS (
        SELECT column1 AS plural, column2 AS singular FROM VALUES
          ('TABLES', 'TABLE'), ('VIEWS', 'VIEW'), ('MATERIALIZED VIEWS', 'MATERIALIZED_VIEW'),
          ('DYNAMIC TABLES', 'DYNAMIC_TABLE'), ('EXTERNAL TABLES', 'EXTERNAL_TABLE'), ('ICEBERG TABLES', 'ICEBERG_TABLE')
      ),
      decs AS (
        SELECT database_name AS db, schema_name AS sch, decision, fmode,
               database_name || '.' || schema_name AS disp
        FROM LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_DECISIONS WHERE run_id = :run_id AND ai_role = :ai
      ),
      allowed AS (
        SELECT db, sch, disp, MIN(fmode) AS fmode FROM decs
        GROUP BY db, sch, disp
        HAVING MAX(IFF(decision = 'ALLOW', 1, 0)) = 1
           AND MAX(IFF(decision IN ('EXCLUDE'), 1, 0)) = 0
      ),
      dbs AS (SELECT db, MIN(fmode) AS fmode FROM decs GROUP BY db),
      g AS (SELECT "privilege" AS priv, "granted_on" AS gon, "name" AS nm FROM TABLE(RESULT_SCAN(:gq))),
      f AS (
        SELECT "privilege" AS priv, "grant_on" AS gon, "name" AS nm,
               REGEXP_REPLACE("name", '[.]<[A-Za-z_ ]+>$', '') AS scope
        FROM TABLE(RESULT_SCAN(:fq))
      ),
      g_usage AS (SELECT DISTINCT nm FROM g WHERE gon = 'SCHEMA' AND priv = 'USAGE'),
      g_db AS (SELECT DISTINCT nm FROM g WHERE gon = 'DATABASE' AND priv = 'USAGE'),
      f_sel AS (SELECT DISTINCT scope, gon FROM f WHERE priv = 'SELECT'),
      need AS (
        SELECT a.* FROM allowed a
        LEFT JOIN g_usage u ON u.nm = a.disp
        LEFT JOIN f_sel ft ON ft.scope = a.disp AND ft.gon = 'TABLE'
        WHERE u.nm IS NULL OR (a.fmode = 'SCHEMA' AND ft.scope IS NULL)
      ),
      obj AS (
        SELECT DISTINCT g.gon, t.plural,
               IFF(REGEXP_LIKE(g.nm, '[A-Z_][A-Z0-9_$]*[.][A-Z_][A-Z0-9_$]*[.].+'),
                   REGEXP_SUBSTR(g.nm, '^[A-Z_][A-Z0-9_$]*[.][A-Z_][A-Z0-9_$]*'), NULL) AS sch2,
               IFF(sch2 IS NULL, g.nm, NULL) AS onm
        FROM g
        JOIN types t ON t.singular = g.gon
        LEFT JOIN allowed a ON STARTSWITH(g.nm, a.disp || '.')
        WHERE g.priv <> 'OWNERSHIP' AND a.disp IS NULL
      ),
      schema_scope AS (SELECT disp FROM allowed WHERE fmode = 'SCHEMA'),
      db_scope AS (SELECT db FROM dbs WHERE fmode = 'DATABASE'),
      stmts AS (
        SELECT 'REVOKE' AS kind, 1 AS ord, x.nm AS target,
               'REVOKE ALL PRIVILEGES ON SCHEMA ' || x.nm || ' FROM ROLE ' || :qrole AS stmt
        FROM (SELECT DISTINCT nm FROM g WHERE gon = 'SCHEMA' AND priv <> 'OWNERSHIP') x
        LEFT JOIN allowed a ON a.disp = x.nm
        WHERE a.disp IS NULL
        UNION ALL
        SELECT 'REVOKE', 2, COALESCE(sch2, onm),
               IFF(sch2 IS NOT NULL,
                   'REVOKE ALL PRIVILEGES ON ALL ' || plural || ' IN SCHEMA ' || sch2,
                   'REVOKE ALL PRIVILEGES ON ' || REPLACE(gon, '_', ' ') || ' ' || onm) || ' FROM ROLE ' || :qrole
        FROM obj
        UNION ALL
        SELECT 'REVOKE', 3, f.scope,
               'REVOKE ALL PRIVILEGES ON FUTURE ' || t.plural || ' IN '
                 || IFF(CONTAINS(f.scope, '.'), 'SCHEMA ', 'DATABASE ') || f.scope || ' FROM ROLE ' || :qrole
        FROM f
        JOIN types t ON t.singular = f.gon
        LEFT JOIN schema_scope ss ON ss.disp = f.scope
        LEFT JOIN db_scope ds ON ds.db = f.scope
        WHERE (CONTAINS(f.scope, '.') AND ss.disp IS NULL)
           OR (NOT CONTAINS(f.scope, '.') AND ds.db IS NULL)
        UNION ALL
        SELECT 'GRANT', 0, d.db, 'GRANT USAGE ON DATABASE ' || d.db || ' TO ROLE ' || :qrole
        FROM (SELECT DISTINCT db FROM dbs) d
        LEFT JOIN g_db gd ON gd.nm = d.db
        WHERE REGEXP_LIKE(d.db, '[A-Z_][A-Z0-9_$]*') AND gd.nm IS NULL
        UNION ALL
        SELECT 'GRANT', 0, d.db, 'GRANT SELECT ON FUTURE ' || t.plural || ' IN DATABASE ' || d.db || ' TO ROLE ' || :qrole
        FROM dbs d
        CROSS JOIN types t
        LEFT JOIN f_sel fs ON fs.scope = d.db AND fs.gon = t.singular
        WHERE d.fmode = 'DATABASE' AND REGEXP_LIKE(d.db, '[A-Z_][A-Z0-9_$]*') AND fs.scope IS NULL
        UNION ALL
        SELECT 'GRANT', 4, a.disp, 'GRANT SELECT ON FUTURE ' || t.plural || ' IN SCHEMA ' || a.disp || ' TO ROLE ' || :qrole
        FROM need a CROSS JOIN types t WHERE a.fmode = 'SCHEMA'
        UNION ALL
        SELECT 'GRANT', 5, a.disp, 'GRANT SELECT ON ALL ' || t.plural || ' IN SCHEMA ' || a.disp || ' TO ROLE ' || :qrole
        FROM need a CROSS JOIN types t
        UNION ALL
        SELECT 'GRANT', 6, a.disp, 'GRANT USAGE ON SCHEMA ' || a.disp || ' TO ROLE ' || :qrole
        FROM need a
      )
      SELECT DISTINCT kind, ord, target, stmt FROM stmts
      ORDER BY IFF(kind = 'REVOKE', 0, 1), target, ord, stmt
    );

    skip_target := '';
    LET wc CURSOR FOR work;
    FOR w IN wc DO
      wkind := w.kind;
      wtarget := w.target;
      stmt := w.stmt;
      IF (wkind = 'GRANT' AND wtarget = skip_target) THEN
        CONTINUE;
      END IF;
      BEGIN
        EXECUTE IMMEDIATE :stmt;
        IF (wkind = 'REVOKE') THEN
          revoked := revoked + 1;
        ELSE
          granted := granted + 1;
        END IF;
      EXCEPTION
        WHEN OTHER THEN
          err := SQLERRM;
          IF (CONTAINS(err, 'Unsupported feature')) THEN
            lvl := 'INFO';
          ELSE
            failures := failures + 1;
            IF (wkind = 'REVOKE') THEN
              status := 'UNSAFE';
              lvl := 'ERROR';
            ELSE
              IF (status = 'OK') THEN status := 'WARN'; END IF;
              lvl := 'WARN';
              skip_target := wtarget;
            END IF;
          END IF;
          INSERT INTO LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_LOG VALUES (CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), :lvl, :err, :stmt);
      END;
    END FOR;
  END FOR;

  DELETE FROM LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_DECISIONS WHERE run_id = :run_id;
  msg := 'status=' || status || ' granted=' || granted || ' revoked=' || revoked
         || ' failures=' || failures || ' warnings=' || warnings
         || ' ms=' || DATEDIFF('millisecond', started, CURRENT_TIMESTAMP());
  INSERT INTO LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_LOG VALUES (CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), 'INFO', :msg, NULL);
  RETURN OBJECT_CONSTRUCT('status', status, 'granted', granted, 'revoked', revoked,
                          'failures', failures, 'warnings', warnings, 'modes', modes, 'run_id', run_id,
                          'elapsed_ms', DATEDIFF('millisecond', started, CURRENT_TIMESTAMP()));
EXCEPTION
  WHEN OTHER THEN
    err := SQLERRM;
    INSERT INTO LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_LOG VALUES (CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), 'ERROR', :err, :stmt);
    DELETE FROM LD_AI_TEST_GRANTS_GOV.AI_GRANTS.AI_GRANT_DECISIONS WHERE run_id = :run_id;
    RETURN OBJECT_CONSTRUCT('status', 'UNSAFE', 'error', err, 'stmt', stmt, 'run_id', run_id);
END;
$$;