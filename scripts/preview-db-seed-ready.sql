SELECT
    to_regclass('jaffle.orders') IS NOT NULL
    AND EXISTS (
        SELECT 1
        FROM emails
        WHERE email = 'demo@lightdash.com'
    )
    AND EXISTS (
        SELECT 1
        FROM catalog_search cs
        JOIN catalog_search_tags cst USING (catalog_search_uuid)
        JOIN tags t USING (tag_uuid)
        WHERE cs.project_uuid = '3675b69e-8324-4110-bdca-059031aa8da3'
          AND t.yaml_reference IS NOT NULL
    ) AS seeded;
