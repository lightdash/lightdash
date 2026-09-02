import { FeatureFlags, type DataAppTemplateSummary } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import { useOrgDataAppTemplates } from './useOrgDataAppTemplates';

const NO_TEMPLATES: DataAppTemplateSummary[] = [];

/**
 * Whether the builder offers the template gallery, and what it holds. Three
 * conditions, all required: the templates feature flag, the user's
 * create:DataAppFromTemplate grant, and the organization actually having
 * uploaded templates. `isLoading` covers the flag and (when applicable)
 * the template list, so callers can gate their first paint on both.
 */
export const useTemplateGallery = () => {
    const flag = useServerFeatureFlag(FeatureFlags.EnableDataAppTemplates);
    const { user } = useApp();
    const canBuildFromTemplate =
        user.data?.ability.can('create', 'DataAppFromTemplate') ?? false;
    const enabled = flag.data?.enabled === true && canBuildFromTemplate;
    const templates = useOrgDataAppTemplates(enabled);
    // react-query v4 reports a disabled query as loading; only a query that
    // is actually fetching for the first time should hold the paint.
    const isLoading = flag.isLoading || (enabled && templates.isInitialLoading);
    return {
        isLoading,
        enabled,
        templates: enabled ? (templates.data ?? NO_TEMPLATES) : NO_TEMPLATES,
    };
};
