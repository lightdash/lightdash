import { PRIMARY_SOURCE_ID } from '../constants';
import { type MergeEditorSource } from '../context/context';

export type MergeSourceNames = {
    /** Editor handle to the name the source runs under and is saved as. */
    nameByHandle: Record<string, string>;
    /** The inverse, for results and errors that name a source. */
    handleByName: Record<string, string>;
};

/**
 * The names merged columns carry. The editor addresses sources by fixed
 * handles (`a`, `b`); the merge runs them under names people can read: the
 * chart's query by its explore, every other query by its explore too, or by
 * the name a saved chart fixed for it. A repeated explore gets a suffix.
 */
export const getMergeSourceNames = ({
    tableName,
    primarySourceName,
    additionalSources,
}: {
    tableName: string | undefined;
    /** The chart query's saved name, when a chart fixed it. */
    primarySourceName: string | null;
    additionalSources: MergeEditorSource[];
}): MergeSourceNames => {
    const primary = primarySourceName ?? tableName ?? PRIMARY_SOURCE_ID;
    const taken = new Set([
        primary,
        ...additionalSources.flatMap((source) =>
            source.name ? [source.name] : [],
        ),
    ]);
    const dedupe = (candidate: string) => {
        let name = candidate;
        let suffix = 2;
        while (taken.has(name)) {
            name = `${candidate}_${suffix}`;
            suffix += 1;
        }
        taken.add(name);
        return name;
    };
    const nameByHandle: Record<string, string> = {
        [PRIMARY_SOURCE_ID]: primary,
    };
    additionalSources.forEach((source) => {
        nameByHandle[source.id] =
            source.name ?? dedupe(source.exploreName ?? source.id);
    });
    return {
        nameByHandle,
        handleByName: Object.fromEntries(
            Object.entries(nameByHandle).map(([handle, name]) => [
                name,
                handle,
            ]),
        ),
    };
};
