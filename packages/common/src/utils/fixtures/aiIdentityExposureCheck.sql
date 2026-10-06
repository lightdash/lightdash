CREATE OR REPLACE PROCEDURE LIGHTDASH_GOVERNANCE.AI_GRANTS.AI_EXPOSURE_CHECK()
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
    SELECT DISTINCT ai_role FROM LIGHTDASH_GOVERNANCE.AI_GRANTS.AI_GRANT_SCOPE
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
        JOIN LIGHTDASH_GOVERNANCE.AI_GRANTS.AI_GRANT_SCOPE s ON s.ai_role = :ai AND s.database_name = p.db
        JOIN LIGHTDASH_GOVERNANCE.AI_GRANTS.AI_GRANT_RULES r ON r.ai_role = :ai AND r.database_name = p.db
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
$$;
