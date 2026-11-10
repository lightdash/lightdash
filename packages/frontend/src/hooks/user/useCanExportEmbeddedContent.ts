import { subject } from '@casl/ability';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import { useAccount } from './useAccount';

const EMBED_EXPORT_SUBJECTS = ['SavedChart', 'Dashboard'] as const;

// Embed tokens grant export on their own content type (chart or dashboard).
export const useCanExportEmbeddedContent = (
    type: 'csv' | 'images',
): boolean => {
    const { data: account } = useAccount();
    const ability = useAbilityContext();

    if (account?.isJwtUser() !== true) return false;

    const { organizationUuid } = account.organization;
    return EMBED_EXPORT_SUBJECTS.some((subjectType) =>
        ability.can('export', subject(subjectType, { organizationUuid, type })),
    );
};
