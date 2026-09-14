import { OrganizationProject, ParameterError } from '@lightdash/common';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { lightdashApi } from './dbt/apiClient';

// Same shape check the backend uses to tell uuids from slugs
const isUuid = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
    );

/**
 * Resolves the value of a `--project` flag to a project UUID.
 * Accepts a UUID (returned as-is) or a project slug as shown in app URLs.
 */
export const resolveProjectFlag = async (value: string): Promise<string> => {
    if (isUuid(value)) {
        return value;
    }

    const projects = await lightdashApi<OrganizationProject[]>({
        method: 'GET',
        url: `/api/v1/org/projects`,
        body: undefined,
    });

    const matches = projects.filter((project) => project.slug === value);

    if (matches.length === 1) {
        GlobalState.debug(
            `> Resolved project slug "${value}" to ${matches[0].projectUuid}`,
        );
        return matches[0].projectUuid;
    }

    if (matches.length > 1) {
        throw new ParameterError(
            `Project slug "${value}" matches more than one project. Use the project UUID instead:\n${matches
                .map((project) => `  ${project.name}: ${project.projectUuid}`)
                .join('\n')}`,
        );
    }

    throw new ParameterError(
        `No project found with UUID or slug "${value}". Run ${styles.bold(
            'lightdash config list-projects',
        )} to see the projects you have access to.`,
    );
};
