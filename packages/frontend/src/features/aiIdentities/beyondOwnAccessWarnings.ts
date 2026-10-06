import { type AiIdentityBeyondOwnAccessWarning } from '@lightdash/common';

export const beyondOwnAccessMessages = (
    warnings: AiIdentityBeyondOwnAccessWarning[],
) => {
    const groups = new Map<
        string,
        {
            roleName: string;
            schema: string;
            groupName: string;
            people: Set<string>;
        }
    >();
    warnings.forEach((warning) => {
        warning.schemas.forEach((schema) => {
            const groupName = warning.groupName ?? 'this group';
            const key = JSON.stringify([warning.roleName, schema, groupName]);
            const group = groups.get(key) ?? {
                roleName: warning.roleName,
                schema,
                groupName,
                people: new Set<string>(),
            };
            group.people.add(warning.userUuid);
            groups.set(key, group);
        });
    });
    return [...groups.values()].map(
        ({ roleName, schema, groupName, people }) =>
            `Warning: ${roleName} can read ${schema}. ${people.size} ${people.size === 1 ? 'person' : 'people'} in ${groupName} cannot read ${schema} with their own Snowflake login. Their AI can see more data than they can.`,
    );
};
