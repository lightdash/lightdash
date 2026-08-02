export const omitProjectUuid = <T extends object>(
    row: T,
): Omit<T, 'project_uuid'> => {
    const { project_uuid: projectUuid, ...rest } = row as T & {
        project_uuid?: unknown;
    };
    void projectUuid;
    return rest;
};

export const replaceProjectUuid = <T extends object>(
    row: T,
    projectUuid: string,
): Omit<T, 'project_uuid'> & { project_uuid: string } => ({
    ...omitProjectUuid(row),
    project_uuid: projectUuid,
});
