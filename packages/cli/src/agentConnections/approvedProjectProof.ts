import { validate as isUuid } from 'uuid';
import type { AgentConnectionSlot } from './schema';

export type ApprovedProjectProof = { projectUuid: string; slug: string | null };
export const parseApprovedProjectProof = (
    value: unknown,
): ApprovedProjectProof[] | null => {
    if (value === undefined) return null;
    if (!Array.isArray(value) || value.length > 500)
        throw new Error('Invalid approved projects.');
    const projects = value.map((item: unknown) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item))
            throw new Error('Invalid approved projects.');
        const entry = item as Record<string, unknown>;
        if (
            typeof entry.project_uuid !== 'string' ||
            !isUuid(entry.project_uuid) ||
            (entry.slug !== null &&
                (typeof entry.slug !== 'string' ||
                    entry.slug.length < 1 ||
                    entry.slug.length > 255 ||
                    /[\s/\\\u0000-\u001f\u007f?#]/.test(entry.slug)))
        )
            throw new Error('Invalid approved projects.');
        return {
            projectUuid: entry.project_uuid,
            slug: entry.slug as string | null,
        };
    });
    const slugs = projects.flatMap((project) =>
        project.slug === null ? [] : [project.slug],
    );
    if (
        new Set(projects.map((project) => project.projectUuid)).size !==
            projects.length ||
        new Set(slugs).size !== slugs.length
    )
        throw new Error('Invalid approved projects.');
    return projects;
};
export const matchesApprovedProjectProof = (
    projects: AgentConnectionSlot['lastReported']['approvedProjects'],
    proof: ApprovedProjectProof[] | null,
    requested: string[] | null,
): boolean => {
    if (
        proof !== null &&
        (proof.length !== projects.length ||
            proof.some(
                (entry) =>
                    !projects.some(
                        (project) => project.projectUuid === entry.projectUuid,
                    ),
            ))
    )
        return false;
    if (requested === null) return true;
    const matches = projects.map((project) =>
        requested.includes(project.projectUuid)
            ? project.projectUuid
            : proof?.find(
                  (entry) =>
                      entry.projectUuid === project.projectUuid &&
                      entry.slug !== null &&
                      !isUuid(entry.slug),
              )?.slug,
    );
    return (
        matches.every(
            (match) => typeof match === 'string' && requested.includes(match),
        ) && new Set(matches).size === matches.length
    );
};
