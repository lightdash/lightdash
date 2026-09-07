import { useParams } from 'react-router';
import { validate as isUuidString } from 'uuid';
import useEmbed from '../ee/providers/Embed/useEmbed';
import { useOptionalProjectRoute } from './useProjectRoute';
import { useProjects } from './useProjects';

/**
 * We have a couple ways to derive the projectUuid:
 * - From the URL when logging in via the Lightdash app UI
 * - From the embed context when logging in via the Lightdash SDK or embed URL
 *
 * We prioritize the URL over the embed context to facilitate the most use-cases.
 *
 * In-app links use the project slug, so the URL segment is only a uuid when
 * ProjectRoute has resolved it. Components mounted outside ProjectRoute (the
 * AI launcher, full-page AI routes) resolve a slug here the same way.
 */
export function useProjectUuid() {
    const projectRoute = useOptionalProjectRoute();
    const { projectUuid: projectIdentifierFromParams } = useParams<{
        projectUuid: string;
    }>();
    const { projectUuid: embedProjectUuid } = useEmbed();

    const isParamSlug =
        !projectRoute &&
        !!projectIdentifierFromParams &&
        !isUuidString(projectIdentifierFromParams);
    const { data: projects } = useProjects({ enabled: isParamSlug });
    const projectUuidFromParams = isParamSlug
        ? projects?.find(
              (project) => project.slug === projectIdentifierFromParams,
          )?.projectUuid
        : projectIdentifierFromParams;

    return (
        projectRoute?.projectUuid || projectUuidFromParams || embedProjectUuid
    );
}
