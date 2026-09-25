import { Text } from '@mantine/core';

/** The name with the typed query in full text colour and the rest dimmed. */
export const SkillMenuName = ({
    name,
    query,
}: {
    name: string;
    query: string;
}) => {
    const needle = query.trim().toLowerCase();
    const at = needle.length > 0 ? name.indexOf(needle) : -1;
    if (at === -1) {
        return <>/{name}</>;
    }
    return (
        <>
            <Text span inherit c="dimmed">
                /{name.slice(0, at)}
            </Text>
            {name.slice(at, at + needle.length)}
            <Text span inherit c="dimmed">
                {name.slice(at + needle.length)}
            </Text>
        </>
    );
};
