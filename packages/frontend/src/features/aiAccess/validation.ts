import { type UpsertAiAccessPolicy } from '@lightdash/common';
type Mappings = UpsertAiAccessPolicy['groupMappings'];
export const hasDuplicateRefs = (rows: Mappings) =>
    rows.some(
        (row, index) =>
            row.ref.trim() &&
            rows.some(
                (other, otherIndex) =>
                    otherIndex !== index && other.ref.trim() === row.ref.trim(),
            ),
    );
