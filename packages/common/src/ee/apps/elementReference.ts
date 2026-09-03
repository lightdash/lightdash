/**
 * An element reference picked with the element picker: one rendered element
 * of a data app, identified by tag, visible text, and build-time source
 * location (`path:line`, empty when unavailable).
 */
export type DataAppElementReference = {
    tag: string;
    text: string;
    loc: string;
};

/**
 * Bracket wire format the coding agent resolves, e.g.
 * `[h1 "FORMULA 1" @src/App.jsx:14]`, `[button "Send"]`, `[div @src/App.jsx:14]`, `[div]`.
 */
export const elementReferenceToWireString = ({
    tag,
    text,
    loc,
}: DataAppElementReference): string => {
    const head = text ? `${tag} "${text}"` : tag;
    return loc ? `[${head} @${loc}]` : `[${head}]`;
};

/** Identity of an element reference as prompt context: app, version, element. */
export const dataAppElementContextKey = ({
    appUuid,
    version,
    tag,
    text,
    loc,
}: DataAppElementReference & { appUuid: string; version: number }): string =>
    `data_app_element:${appUuid}:${version}:${elementReferenceToWireString({ tag, text, loc })}`;

/** Identity of a thread restore as prompt context: app and the new version. */
export const dataAppRestoreContextKey = ({
    appUuid,
    version,
}: {
    appUuid: string;
    version: number;
}): string => `data_app_restore:${appUuid}:${version}`;
/** Identity of a pinned data app as prompt context. */
export const dataAppContextKey = (appUuid: string): string =>
    `data_app:${appUuid}`;
