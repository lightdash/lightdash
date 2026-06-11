import type { Change, ChangesetWithChanges } from '@lightdash/common';

const describeChange = (change: Change): string => {
    const target = `${change.entityType} \`${change.entityName}\` on model \`${change.entityTableName}\``;
    switch (change.type) {
        case 'create': {
            const { value } = change.payload;
            return `Add a new ${value.type} metric \`${value.name}\` (label: "${value.label}") to model \`${value.table}\` with SQL: ${value.sql}`;
        }
        case 'update': {
            const patches = change.payload.patches
                .map(
                    (patch) =>
                        `set \`${patch.path}\` to ${JSON.stringify(patch.value)}`,
                )
                .join(', ');
            return `Update ${target}: ${patches}`;
        }
        case 'delete':
            return `Delete ${target}`;
        default:
            return `Apply change to ${target}`;
    }
};

/** Turn a changeset's structured changes into a prompt for the writeback agent. */
export const buildChangesetWritebackPrompt = (
    changeset: ChangesetWithChanges,
): string => {
    const instructions = changeset.changes
        .map((change, index) => `${index + 1}. ${describeChange(change)}`)
        .join('\n');
    return [
        `Apply the following ${changeset.changes.length} semantic-layer change(s) from the Lightdash changeset "${changeset.name}" to the dbt project, then open a single pull request with all of them.`,
        '',
        instructions,
        '',
        'Make only the changes listed above. Preserve existing formatting and unrelated content.',
    ].join('\n');
};
