import { ParameterError } from '../types/errors';
import {
    aiIdentitySnowflakeIdentifier,
    aiIdentitySnowflakeString,
} from './aiIdentitySnowflakeSql';

export const AI_IDENTITY_GOVERNANCE_DATABASE = 'LIGHTDASH_GOVERNANCE';
export const AI_IDENTITY_GOVERNANCE_SCHEMA = 'AI_GRANTS';
export const AI_IDENTITY_GRANTOR_ROLE = 'LIGHTDASH_AI_GRANTOR';

export const globToAiIdentityRegex = (pattern: string): string =>
    `^${[...pattern]
        .map((character) => {
            if (character === '*') return '.*';
            if (character === '?') return '.';
            return character.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
        })
        .join('')}$`;

export const buildAiIdentityAutomaticSyncSetupSql = ({
    managedScope,
    managedRules = [],
    provisionerRole,
    warehouse,
    grantorRole = AI_IDENTITY_GRANTOR_ROLE,
    governanceDatabase = AI_IDENTITY_GOVERNANCE_DATABASE,
    governanceSchema = AI_IDENTITY_GOVERNANCE_SCHEMA,
    schedule = '10 MINUTES',
}: {
    managedScope: readonly { roleName: string; database: string }[];
    managedRules?: readonly {
        roleName: string;
        database: string;
        excludePatterns: readonly string[];
    }[];
    provisionerRole: string;
    warehouse: string;
    grantorRole?: string;
    governanceDatabase?: string;
    governanceSchema?: string;
    schedule?: string;
}): string => {
    const grantor = aiIdentitySnowflakeIdentifier(grantorRole).toUpperCase();
    const provisioner = aiIdentitySnowflakeIdentifier(provisionerRole);
    const provisionerWarehouse = aiIdentitySnowflakeIdentifier(warehouse);
    const database = aiIdentitySnowflakeIdentifier(governanceDatabase);
    const schema = aiIdentitySnowflakeIdentifier(governanceSchema);
    const namespace = `${database}.${schema}`;
    if (!/^\d+ (MINUTE|MINUTES|HOUR|HOURS)$/.test(schedule))
        throw new ParameterError('Invalid Snowflake task schedule.');
    const protectedRoles = new Set([
        'PUBLIC',
        'ACCOUNTADMIN',
        'SECURITYADMIN',
        'SYSADMIN',
        'USERADMIN',
        'ORGADMIN',
        'GLOBALORGADMIN',
        grantor.toUpperCase(),
        provisioner.toUpperCase(),
    ]);
    const scope = [
        ...new Map(
            managedScope.map((entry) => {
                const roleName = aiIdentitySnowflakeIdentifier(
                    entry.roleName,
                ).toUpperCase();
                const scopedDatabase = aiIdentitySnowflakeIdentifier(
                    entry.database,
                ).toUpperCase();
                if (protectedRoles.has(roleName))
                    throw new ParameterError(
                        'A system or administration role cannot be managed.',
                    );
                return [
                    `${roleName}.${scopedDatabase}`,
                    { roleName, database: scopedDatabase },
                ] as const;
            }),
        ).values(),
    ];

    const procedure =
        String.raw`CREATE OR REPLACE PROCEDURE __NAMESPACE__.SYNC_AI_GRANTS()
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
    FROM __NAMESPACE__.AI_GRANT_RULES r
    JOIN __NAMESPACE__.AI_GRANT_SCOPE s ON s.ai_role = r.ai_role AND s.database_name = r.database_name
    WHERE r.ai_role NOT IN ('PUBLIC', 'ACCOUNTADMIN', 'SECURITYADMIN', 'SYSADMIN', 'USERADMIN', 'ORGADMIN')
    ORDER BY r.database_name;
  role_cur CURSOR FOR
    SELECT DISTINCT ai_role FROM __NAMESPACE__.AI_GRANT_SCOPE
    WHERE ai_role NOT IN ('PUBLIC', 'ACCOUNTADMIN', 'SECURITYADMIN', 'SYSADMIN', 'USERADMIN', 'ORGADMIN');
BEGIN
  INSERT INTO __NAMESPACE__.AI_GRANT_LOG
    SELECT CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), 'WARN',
           'rule ignored: outside admin scope: ' || r.ai_role || ' on ' || r.database_name, NULL
    FROM __NAMESPACE__.AI_GRANT_RULES r
    LEFT JOIN __NAMESPACE__.AI_GRANT_SCOPE s ON s.ai_role = r.ai_role AND s.database_name = r.database_name
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
        AND "grantee_name" <> :ai
        AND "grantee_name" <> __GRANTOR__
        AND "grantee_name" NOT IN (SELECT ai_role FROM __NAMESPACE__.AI_GRANT_SCOPE);
    eff_mode := IFF(n > 0 OR fmode = 'DATABASE', 'DATABASE', 'SCHEMA');
    IF (fmode = 'SCHEMA' AND n > 0) THEN
      msg := 'future_mode SCHEMA overridden to DATABASE: ' || n || ' database-level future grants exist in ' || db;
      INSERT INTO __NAMESPACE__.AI_GRANT_LOG VALUES (CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), 'INFO', :msg, NULL);
    END IF;
    modes := ARRAY_APPEND(modes, OBJECT_CONSTRUCT('database', db, 'future_mode', eff_mode, 'other_db_future_grants', n));

    stmt := 'SHOW SCHEMAS IN DATABASE ' || qdb || ' LIMIT 10000';
    EXECUTE IMMEDIATE :stmt;
    sq := LAST_QUERY_ID();
    BEGIN
      INSERT INTO __NAMESPACE__.AI_GRANT_DECISIONS (run_id, ai_role, database_name, schema_name, decision, fmode)
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
        INSERT INTO __NAMESPACE__.AI_GRANT_LOG VALUES (CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), 'ERROR', :msg, :pat);
        DELETE FROM __NAMESPACE__.AI_GRANT_DECISIONS WHERE run_id = :run_id AND ai_role = :ai AND database_name = :db;
        INSERT INTO __NAMESPACE__.AI_GRANT_DECISIONS (run_id, ai_role, database_name, schema_name, decision, fmode)
          SELECT :run_id, :ai, :db, "name", 'EXCLUDE', :eff_mode FROM TABLE(RESULT_SCAN(:sq));
    END;

    SELECT COUNT(DISTINCT ai_role || '.' || database_name || '.' || schema_name) INTO :n
    FROM __NAMESPACE__.AI_GRANT_DECISIONS WHERE run_id = :run_id;
    msg := 'progress=' || n;
    INSERT INTO __NAMESPACE__.AI_GRANT_LOG VALUES (CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), 'INFO', :msg, NULL);

    SELECT COUNT(*) INTO :n FROM TABLE(RESULT_SCAN(:pq)) p
      LEFT JOIN (
        SELECT database_name || '.' || schema_name AS disp
        FROM __NAMESPACE__.AI_GRANT_DECISIONS
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
      INSERT INTO __NAMESPACE__.AI_GRANT_LOG VALUES (CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), 'ERROR', :msg, NULL);
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
      INSERT INTO __NAMESPACE__.AI_GRANT_LOG VALUES (CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), 'ERROR', :msg, NULL);
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
        FROM __NAMESPACE__.AI_GRANT_DECISIONS WHERE run_id = :run_id AND ai_role = :ai
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
          INSERT INTO __NAMESPACE__.AI_GRANT_LOG VALUES (CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), :lvl, :err, :stmt);
      END;
    END FOR;
  END FOR;

  DELETE FROM __NAMESPACE__.AI_GRANT_DECISIONS WHERE run_id = :run_id;
  msg := 'status=' || status || ' granted=' || granted || ' revoked=' || revoked
         || ' failures=' || failures || ' warnings=' || warnings
         || ' ms=' || DATEDIFF('millisecond', started, CURRENT_TIMESTAMP());
  INSERT INTO __NAMESPACE__.AI_GRANT_LOG VALUES (CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), 'INFO', :msg, NULL);
  RETURN OBJECT_CONSTRUCT('status', status, 'granted', granted, 'revoked', revoked,
                          'failures', failures, 'warnings', warnings, 'modes', modes, 'run_id', run_id,
                          'elapsed_ms', DATEDIFF('millisecond', started, CURRENT_TIMESTAMP()));
EXCEPTION
  WHEN OTHER THEN
    err := SQLERRM;
    INSERT INTO __NAMESPACE__.AI_GRANT_LOG VALUES (CURRENT_TIMESTAMP(), :run_id, CURRENT_USER(), 'ERROR', :err, :stmt);
    DELETE FROM __NAMESPACE__.AI_GRANT_DECISIONS WHERE run_id = :run_id;
    RETURN OBJECT_CONSTRUCT('status', 'UNSAFE', 'error', err, 'stmt', stmt, 'run_id', run_id);
END;
$$;`
            .replaceAll('__NAMESPACE__', namespace)
            .replaceAll('__GRANTOR__', aiIdentitySnowflakeString(grantor));
    const exposureCheck =
        String.raw`CREATE OR REPLACE PROCEDURE __NAMESPACE__.AI_EXPOSURE_CHECK()
RETURNS VARIANT
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
  started TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP();
  stmt    STRING DEFAULT '';
  gq      STRING;
  ai      STRING;
  qrole   STRING;
  exposed ARRAY DEFAULT ARRAY_CONSTRUCT();
  found   ARRAY;
  role_cur CURSOR FOR
    SELECT DISTINCT ai_role FROM __NAMESPACE__.AI_GRANT_SCOPE
    WHERE ai_role NOT IN ('PUBLIC', 'ACCOUNTADMIN', 'SECURITYADMIN', 'SYSADMIN', 'USERADMIN', 'ORGADMIN');
BEGIN
  FOR ar IN role_cur DO
    ai := ar.ai_role;
    qrole := '"' || REPLACE(ai, '"', '""') || '"';
    stmt := 'SHOW GRANTS TO ROLE ' || qrole;
    EXECUTE IMMEDIATE :stmt;
    gq := LAST_QUERY_ID();
    SELECT ARRAY_AGG(DISTINCT x.item) INTO :found FROM (
      WITH
      g AS (
        SELECT DISTINCT "granted_on" AS gon, "name" AS nm FROM TABLE(RESULT_SCAN(:gq))
        WHERE "privilege" <> 'OWNERSHIP' AND "granted_on" IN ('SCHEMA', 'ROLE')
      ),
      p AS (
        SELECT nm,
               IFF(REGEXP_LIKE(nm, '[A-Z_][A-Z0-9_$]*[.][A-Z_][A-Z0-9_$]*'), SPLIT_PART(nm, '.', 1), NULL) AS db,
               IFF(REGEXP_LIKE(nm, '[A-Z_][A-Z0-9_$]*[.][A-Z_][A-Z0-9_$]*'), SPLIT_PART(nm, '.', 2), NULL) AS sch
        FROM g WHERE gon = 'SCHEMA'
      ),
      ev AS (
        SELECT p.nm,
               MAX(CASE WHEN (UPPER(r.mode) = 'EXCLUDE' AND NOT REGEXP_LIKE(p.sch, r.pattern_regex, 'i'))
                          OR (UPPER(r.mode) = 'INCLUDE' AND REGEXP_LIKE(p.sch, r.pattern_regex, 'i')) THEN 1 ELSE 0 END) AS allow_hit,
               MAX(CASE WHEN UPPER(r.mode) NOT IN ('EXCLUDE', 'INCLUDE')
                          OR (UPPER(r.mode) = 'EXCLUDE' AND REGEXP_LIKE(p.sch, r.pattern_regex, 'i')) THEN 1 ELSE 0 END) AS veto
        FROM p
        JOIN __NAMESPACE__.AI_GRANT_SCOPE s ON s.ai_role = :ai AND s.database_name = p.db
        JOIN __NAMESPACE__.AI_GRANT_RULES r ON r.ai_role = :ai AND r.database_name = p.db
        WHERE p.sch IS NOT NULL AND p.sch <> 'INFORMATION_SCHEMA'
        GROUP BY p.nm
      )
      SELECT 'SCHEMA ' || p.nm AS item FROM p
      LEFT JOIN ev ON ev.nm = p.nm
      WHERE ev.nm IS NULL OR ev.allow_hit = 0 OR ev.veto = 1
      UNION ALL
      SELECT 'ROLE ' || nm FROM g WHERE gon = 'ROLE'
    ) x;
    exposed := ARRAY_CAT(exposed, COALESCE(found, ARRAY_CONSTRUCT()));
  END FOR;
  RETURN OBJECT_CONSTRUCT('status', IFF(ARRAY_SIZE(exposed) = 0, 'OK', 'UNSAFE'), 'exposed', exposed,
                          'checked_at', CURRENT_TIMESTAMP(), 'elapsed_ms', DATEDIFF('millisecond', started, CURRENT_TIMESTAMP()));
EXCEPTION
  WHEN OTHER THEN
    RETURN OBJECT_CONSTRUCT('status', 'UNSAFE', 'error', SQLERRM, 'stmt', stmt);
END;
$$;`.replaceAll('__NAMESPACE__', namespace);
    const viewWarnings =
        String.raw`CREATE OR REPLACE PROCEDURE __NAMESPACE__.VIEW_DEPENDENCY_WARNINGS()
RETURNS VARIANT
LANGUAGE JAVASCRIPT
EXECUTE AS OWNER
AS
$$
var namespace = '__NAMESPACE__';
var warnings = [];
function query(sql) { return snowflake.createStatement({sqlText: sql}).execute(); }
function quote(value) { return '"' + value.replace(/"/g, '""') + '"'; }
function literal(value) { return "'" + value.replace(/'/g, "''") + "'"; }
function plain(value) { return typeof value === 'string' && /^[A-Z_][A-Z0-9_$]*$/.test(value); }
var scope = query('SELECT DISTINCT AI_ROLE, DATABASE_NAME FROM ' + namespace + '.AI_GRANT_SCOPE');
while (scope.next()) {
    var role = String(scope.getColumnValue(1));
    var database = String(scope.getColumnValue(2));
    if (!plain(role) || !plain(database)) continue;
    var allowed = {};
    var grants = query('SHOW GRANTS TO ROLE ' + quote(role));
    while (grants.next()) {
        if (grants.getColumnValue('granted_on') === 'SCHEMA' && grants.getColumnValue('privilege') === 'USAGE') {
            var schema = String(grants.getColumnValue('name'));
            if (schema.indexOf(database + '.') === 0) allowed[schema] = true;
        }
    }
    Object.keys(allowed).forEach(function(schema) {
        try {
            var names = schema.split('.');
            if (names.length !== 2 || !plain(names[1])) return;
            query('GRANT SELECT ON ALL VIEWS IN SCHEMA ' + quote(names[0]) + '.' + quote(names[1]) + ' TO ROLE ' + quote('__GRANTOR__'));
            var views = query('SHOW VIEWS IN SCHEMA ' + quote(names[0]) + '.' + quote(names[1]));
            while (views.next()) {
                var viewName = String(views.getColumnValue('name'));
                if (!plain(viewName)) continue;
                try {
                    var refs = query('SELECT REFERENCED_DATABASE_NAME, REFERENCED_SCHEMA_NAME FROM TABLE(GET_OBJECT_REFERENCES(DATABASE_NAME => ' + literal(names[0]) + ', SCHEMA_NAME => ' + literal(names[1]) + ', OBJECT_NAME => ' + literal(viewName) + '))');
                    while (refs.next()) {
                        var target = String(refs.getColumnValue(1)) + '.' + String(refs.getColumnValue(2));
                        if (!allowed[target]) warnings.push({code: 'view_dependency', message: 'Allowed view ' + schema + '.' + viewName + ' references an excluded schema.', roleName: role, database: names[0], schema: names[1]});
                    }
                } catch (error) {
                    warnings.push({code: 'view_dependency', message: 'View dependencies could not be checked for ' + schema + '.' + viewName + ': ' + String(error), roleName: role, database: names[0], schema: names[1]});
                }
            }
        } catch (error) {
            warnings.push({code: 'view_dependency', message: 'View dependencies could not be checked for ' + schema + ': ' + String(error), roleName: role, database: names[0], schema: names[1]});
        }
    });
}
return warnings;
$$;`
            .replaceAll('__NAMESPACE__', namespace)
            .replaceAll('__GRANTOR__', grantor);
    return [
        'USE ROLE ACCOUNTADMIN;',
        `CREATE ROLE IF NOT EXISTS ${grantor};`,
        `GRANT ROLE ${grantor} TO ROLE SECURITYADMIN;`,
        `GRANT MANAGE GRANTS ON ACCOUNT TO ROLE ${grantor};`,
        `GRANT EXECUTE TASK ON ACCOUNT TO ROLE ${grantor};`,
        `GRANT EXECUTE MANAGED TASK ON ACCOUNT TO ROLE ${grantor};`,
        `CREATE DATABASE IF NOT EXISTS ${database};`,
        `GRANT OWNERSHIP ON DATABASE ${database} TO ROLE ${grantor} COPY CURRENT GRANTS;`,
        `USE ROLE ${grantor};`,
        `CREATE SCHEMA IF NOT EXISTS ${namespace} WITH MANAGED ACCESS;`,
        `CREATE TABLE IF NOT EXISTS ${namespace}.AI_GRANT_RULES (DATABASE_NAME STRING NOT NULL, AI_ROLE STRING NOT NULL, MODE STRING NOT NULL, PATTERN_REGEX STRING NOT NULL, FUTURE_MODE STRING NOT NULL);`,
        `CREATE TABLE IF NOT EXISTS ${namespace}.AI_GRANT_SCOPE (AI_ROLE STRING NOT NULL, DATABASE_NAME STRING NOT NULL);`,
        `CREATE TABLE IF NOT EXISTS ${namespace}.AI_GRANT_LOG (RUN_AT TIMESTAMP_LTZ, RUN_ID STRING, INVOKED_BY STRING, LEVEL STRING, MESSAGE STRING, STATEMENT STRING);`,
        `CREATE TABLE IF NOT EXISTS ${namespace}.AI_GRANT_DECISIONS (RUN_ID STRING, AI_ROLE STRING, DATABASE_NAME STRING, SCHEMA_NAME STRING, DECISION STRING, FMODE STRING);`,
        'BEGIN TRANSACTION;',
        `DELETE FROM ${namespace}.AI_GRANT_SCOPE;`,
        `DELETE FROM ${namespace}.AI_GRANT_RULES;`,
        ...scope.map(
            ({ roleName, database: scopedDatabase }) =>
                `INSERT INTO ${namespace}.AI_GRANT_SCOPE (AI_ROLE, DATABASE_NAME) VALUES (${aiIdentitySnowflakeString(roleName)}, ${aiIdentitySnowflakeString(scopedDatabase)});`,
        ),
        ...managedRules.flatMap(
            ({ roleName, database: scopedDatabase, excludePatterns }) =>
                (excludePatterns.length > 0 ? excludePatterns : ['']).map(
                    (pattern) =>
                        `INSERT INTO ${namespace}.AI_GRANT_RULES (DATABASE_NAME, AI_ROLE, MODE, PATTERN_REGEX, FUTURE_MODE) VALUES (${aiIdentitySnowflakeString(aiIdentitySnowflakeIdentifier(scopedDatabase).toUpperCase())}, ${aiIdentitySnowflakeString(aiIdentitySnowflakeIdentifier(roleName).toUpperCase())}, 'EXCLUDE', ${aiIdentitySnowflakeString(pattern === '' ? '^$' : globToAiIdentityRegex(pattern))}, 'SCHEMA');`,
                ),
        ),
        'COMMIT;',
        ...[...new Set(scope.map((entry) => entry.database))].flatMap(
            (scopedDatabase) => [
                `USE ROLE ACCOUNTADMIN;`,
                `GRANT USAGE ON DATABASE ${scopedDatabase} TO ROLE ${grantor};`,
                `GRANT USAGE ON ALL SCHEMAS IN DATABASE ${scopedDatabase} TO ROLE ${grantor};`,
                `GRANT USAGE ON FUTURE SCHEMAS IN DATABASE ${scopedDatabase} TO ROLE ${grantor};`,
                `REVOKE SELECT ON FUTURE VIEWS IN DATABASE ${scopedDatabase} FROM ROLE ${grantor};`,
                `USE ROLE ${grantor};`,
            ],
        ),
        procedure,
        exposureCheck,
        viewWarnings,
        `CREATE OR REPLACE TASK ${namespace}.SYNC_AI_GRANTS_TASK SCHEDULE = '${schedule}' USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL' STATEMENT_TIMEOUT_IN_SECONDS = 3600 USER_TASK_TIMEOUT_MS = 3600000 AS CALL ${namespace}.SYNC_AI_GRANTS();`,
        `ALTER TASK ${namespace}.SYNC_AI_GRANTS_TASK RESUME;`,
        `GRANT USAGE ON DATABASE ${database} TO ROLE ${provisioner};`,
        `GRANT USAGE ON SCHEMA ${namespace} TO ROLE ${provisioner};`,
        `GRANT USAGE ON WAREHOUSE ${provisionerWarehouse} TO ROLE ${provisioner};`,
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${namespace}.AI_GRANT_RULES TO ROLE ${provisioner};`,
        `GRANT SELECT ON TABLE ${namespace}.AI_GRANT_SCOPE TO ROLE ${provisioner};`,
        `GRANT SELECT ON TABLE ${namespace}.AI_GRANT_LOG TO ROLE ${provisioner};`,
        `GRANT USAGE ON PROCEDURE ${namespace}.SYNC_AI_GRANTS() TO ROLE ${provisioner};`,
        `GRANT USAGE ON PROCEDURE ${namespace}.AI_EXPOSURE_CHECK() TO ROLE ${provisioner};`,
        `GRANT USAGE ON PROCEDURE ${namespace}.VIEW_DEPENDENCY_WARNINGS() TO ROLE ${provisioner};`,
        `EXECUTE TASK ${namespace}.SYNC_AI_GRANTS_TASK;`,
    ].join('\n');
};
