/**
 * A field's editable properties as the field window holds them, and the
 * change to send when it saves.
 */
import { type LiveSourceFieldChange } from '@lightdash/common';
import { type Field } from './model';
import { type FieldDraft } from './useSemanticStudio';

export const toFieldDraft = (field: Field): FieldDraft => ({
    label: field.label,
    description: field.description,
    aiHint: field.aiHint,
    group: field.group.trim(),
    inUse: field.inUse,
});

export const isSameDraft = (next: FieldDraft, saved: FieldDraft): boolean =>
    next.label === saved.label &&
    next.description === saved.description &&
    next.aiHint === saved.aiHint &&
    next.group.trim() === saved.group &&
    next.inUse === saved.inUse;

/**
 * Only what changed. An emptied label or group goes back to the
 * integration's.
 */
export const toFieldChange = (
    name: string,
    draft: FieldDraft,
    saved: FieldDraft,
): LiveSourceFieldChange => ({
    name,
    ...(draft.label !== saved.label
        ? { label: draft.label.trim() || null }
        : {}),
    ...(draft.description !== saved.description
        ? { description: draft.description }
        : {}),
    ...(draft.aiHint !== saved.aiHint ? { aiHint: draft.aiHint || null } : {}),
    ...(draft.group.trim() !== saved.group
        ? { group: draft.group.trim() || null }
        : {}),
    ...(draft.inUse !== saved.inUse ? { inUse: draft.inUse } : {}),
});
