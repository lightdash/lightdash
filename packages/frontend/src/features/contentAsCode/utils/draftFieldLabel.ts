import i18n from '../../../i18n/i18n';

const humanize = (field: string) =>
    field.charAt(0).toUpperCase() +
    field
        .slice(1)
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase();

// Known as-code fields are translated; unknown ones fall back to a humanized key
export const draftFieldLabel = (field: string, inline = false) => {
    const key = `draftFields.${inline ? 'inline' : 'label'}.${field}`;
    if (i18n.exists(key, { ns: 'contentAsCode' })) {
        return i18n.t(key, { ns: 'contentAsCode' });
    }
    return inline ? humanize(field).toLowerCase() : humanize(field);
};
