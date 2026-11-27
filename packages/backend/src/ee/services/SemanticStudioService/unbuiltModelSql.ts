import {
    isExploreError,
    type DbtManifest,
    type DbtNode,
    type Explore,
    type ExploreError,
} from '@lightdash/common';

/** Bounds how much SQL dbt renders for one branch compile. */
const MAX_RENDERED_MODELS = 25;

export type SqlModel = DbtNode & {
    raw_code?: string;
    relation_name?: string | null;
    fqn?: string[];
    depends_on?: { nodes?: string[] };
};

const isSqlModel = (node: DbtNode | undefined): node is SqlModel =>
    node?.resource_type === 'model';

/** The models whose SQL a branch changes or adds, and every model built from them: the warehouse has none of them as the branch defines it. */
export const findUnbuiltModels = (
    live: DbtManifest,
    branch: DbtManifest,
): Set<string> => {
    const models = Object.values(branch.nodes).filter(isSqlModel);
    const unbuilt = new Set(
        models
            .filter((model) => {
                const before = live.nodes[model.unique_id];
                return (
                    !isSqlModel(before) || before.raw_code !== model.raw_code
                );
            })
            .map(({ unique_id }) => unique_id),
    );
    const children = new Map<string, string[]>();
    models.forEach((model) =>
        model.depends_on?.nodes?.forEach((parent) =>
            children.set(parent, [
                ...(children.get(parent) ?? []),
                model.unique_id,
            ]),
        ),
    );
    const queue = [...unbuilt];
    while (queue.length > 0) {
        (children.get(queue.pop() ?? '') ?? []).forEach((child) => {
            if (unbuilt.has(child)) return;
            unbuilt.add(child);
            queue.push(child);
        });
    }
    return unbuilt;
};

/** A model and the unbuilt models it is built from, each after the ones it reads. */
const orderUnbuiltLineage = (
    branch: DbtManifest,
    unbuilt: Set<string>,
    modelId: string,
): SqlModel[] => {
    const ordered: SqlModel[] = [];
    const seen = new Set<string>();
    const visit = (id: string) => {
        const model = branch.nodes[id];
        if (seen.has(id) || !unbuilt.has(id) || !isSqlModel(model)) return;
        seen.add(id);
        model.depends_on?.nodes?.forEach(visit);
        ordered.push(model);
    };
    visit(modelId);
    return ordered;
};

const cteName = (model: SqlModel) =>
    `__draft__${model.unique_id.replace(/[^A-Za-z0-9_]/g, '_')}`;

/** A query that reads a model as the branch defines it, with every unbuilt model it reads rendered in place of its table; null when one has no SQL to render. */
export const renderDraftSqlFrom = (
    lineage: SqlModel[],
    compiledSql: Map<string, string>,
): string | null => {
    // An ephemeral model has no table: dbt already renders it inside the models that read it.
    const tables = lineage.filter(
        (model) => model.config?.materialized !== 'ephemeral',
    );
    const target = lineage.at(-1);
    if (!target || !tables.includes(target)) return null;
    const ctes: string[] = [];
    for (const model of tables) {
        const sql = compiledSql.get(model.unique_id);
        if (!sql || !model.relation_name) return null;
        const body = tables.reduce(
            (rendered, other) =>
                other === model || !other.relation_name
                    ? rendered
                    : rendered.replaceAll(other.relation_name, cteName(other)),
            sql.replace(/;\s*$/, ''),
        );
        ctes.push(`${cteName(model)} AS (\n${body}\n)`);
    }
    return `(\nWITH ${ctes.join(',\n')}\nSELECT * FROM ${cteName(target)}\n)`;
};

const DRAFT_SQL_FROM = '(\nWITH __draft__';

/** An explore compiled elsewhere from the same branch, reading the unbuilt models the branch's own compile renders from that SQL too. */
export const withDraftSqlFrom = (
    explore: Explore | ExploreError,
    draft: Explore | ExploreError | undefined,
): Explore | ExploreError => {
    if (isExploreError(explore) || !draft || isExploreError(draft)) {
        return explore;
    }
    const rendered = Object.entries(explore.tables).flatMap(([name, table]) => {
        const sqlTable = draft.tables[name]?.sqlTable;
        return sqlTable?.startsWith(DRAFT_SQL_FROM)
            ? [[name, { ...table, sqlTable }] as const]
            : [];
    });
    return rendered.length === 0
        ? explore
        : {
              ...explore,
              tables: { ...explore.tables, ...Object.fromEntries(rendered) },
          };
};

type BranchCompile = {
    explores: (Explore | ExploreError)[];
    /** What dbt parsed from the branch; null when the branch was not compiled with dbt here. */
    manifest: DbtManifest | null;
    /** The SQL dbt renders for the models these selectors pick, by unique id. */
    compileModelSql: (selectors: string[]) => Promise<Map<string, string>>;
};

/**
 * Has a branch's explores read each model whose SQL the branch changes from that
 * SQL, since its table is only rebuilt after the branch merges. Explores of
 * models that cannot be rendered are left reading the table.
 */
// A rendered model is computed in full on every query; building it into a scratch schema would be cheaper for heavy models.
export const readUnbuiltModelsFromSql = async (
    live: DbtManifest,
    { explores, manifest, compileModelSql }: BranchCompile,
): Promise<{ explores: (Explore | ExploreError)[]; rendered: number }> => {
    const untouched = { explores, rendered: 0 };
    if (manifest === null) return untouched;
    const unbuilt = findUnbuiltModels(live, manifest);
    if (unbuilt.size === 0) return untouched;
    const sqlTables = new Set(
        explores.flatMap((explore) =>
            isExploreError(explore)
                ? []
                : Object.values(explore.tables).map(({ sqlTable }) => sqlTable),
        ),
    );
    const lineages = [...unbuilt].flatMap((id) => {
        const model = manifest.nodes[id];
        return isSqlModel(model) &&
            model.relation_name &&
            sqlTables.has(model.relation_name)
            ? [
                  {
                      sqlTable: model.relation_name,
                      lineage: orderUnbuiltLineage(manifest, unbuilt, id),
                  },
              ]
            : [];
    });
    const selectors = [
        ...new Set(
            lineages.flatMap(({ lineage }) =>
                lineage.flatMap(({ fqn }) => (fqn ? [fqn.join('.')] : [])),
            ),
        ),
    ];
    if (selectors.length === 0 || selectors.length > MAX_RENDERED_MODELS) {
        return untouched;
    }
    const compiledSql = await compileModelSql(selectors);
    const sqlFrom = new Map(
        lineages.flatMap(({ sqlTable, lineage }): [string, string][] => {
            const rendered = renderDraftSqlFrom(lineage, compiledSql);
            return rendered === null ? [] : [[sqlTable, rendered]];
        }),
    );
    if (sqlFrom.size === 0) return untouched;
    return {
        rendered: sqlFrom.size,
        explores: explores.map((explore) =>
            isExploreError(explore)
                ? explore
                : {
                      ...explore,
                      tables: Object.fromEntries(
                          Object.entries(explore.tables).map(
                              ([name, table]) => [
                                  name,
                                  {
                                      ...table,
                                      sqlTable:
                                          sqlFrom.get(table.sqlTable) ??
                                          table.sqlTable,
                                  },
                              ],
                          ),
                      ),
                  },
        ),
    };
};
