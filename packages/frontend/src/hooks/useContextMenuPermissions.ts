import { subject } from '@casl/ability';
import { useMemo } from 'react';
import { useAbilityContext } from '../providers/Ability/useAbilityContext';
import { useProject } from './useProject';
import { useProjectUuid } from './useProjectUuid';
import { useAccount } from './user/useAccount';

type UseContextMenuPermissionsParams = {
    /**
     * Optional override for organizationUuid. If not provided, will be derived from project or account.
     */
    organizationUuid?: string;
    /**
     * Optional override for projectUuid. If not provided, will be fetched from URL params or embed context.
     */
    projectUuid?: string;
    /**
     * Whether the component is in minimal mode (e.g., browserless/screenshot mode).
     */
    minimal?: boolean;
};

type UseContextMenuPermissionsReturn = {
    shouldShowMenu: boolean;
    canViewUnderlyingData: boolean;
    canViewExplore: boolean;
    canDrillInto: boolean;
    isMinimal: boolean;
};

/**
 * Centralized hook for context menu permissions and visibility logic.
 * Provides standardized permission checks across all chart components.
 *
 * Automatically fetches projectUuid, organizationUuid, and account data.
 * You can optionally override organizationUuid and projectUuid for specific contexts
 * (e.g., when checking permissions for a specific chart's project).
 */
export const useContextMenuPermissions = ({
    organizationUuid: overrideOrganizationUuid,
    projectUuid: overrideProjectUuid,
    minimal = false,
}: UseContextMenuPermissionsParams = {}): UseContextMenuPermissionsReturn => {
    const { data: account } = useAccount();
    const ability = useAbilityContext();
    const projectUuidFromContext = useProjectUuid();
    const { data: project } = useProject(
        overrideProjectUuid || projectUuidFromContext,
    );

    // Determine the actual organizationUuid and projectUuid to use
    const projectUuid = overrideProjectUuid || project?.projectUuid;
    const organizationUuid =
        overrideOrganizationUuid ||
        project?.organizationUuid ||
        account?.organization?.organizationUuid;

    const shouldShowMenu = useMemo(() => {
        // Show menu if account exists OR in minimal mode
        return !!(account || minimal);
    }, [account, minimal]);

    const canViewUnderlyingData = useMemo(() => {
        if (!organizationUuid || !projectUuid) {
            return false;
        }
        return ability.can(
            'view',
            subject('UnderlyingData', {
                organizationUuid,
                projectUuid,
            }),
        );
    }, [ability, organizationUuid, projectUuid]);

    const canViewExplore = useMemo(() => {
        if (!organizationUuid || !projectUuid) {
            return false;
        }
        return ability.can(
            'view',
            subject('Explore', {
                organizationUuid,
                projectUuid,
            }),
        );
    }, [ability, organizationUuid, projectUuid]);

    const canDrillInto = useMemo(() => {
        if (!organizationUuid || !projectUuid) {
            return false;
        }
        return ability.can(
            'manage',
            subject('Explore', {
                organizationUuid,
                projectUuid,
            }),
        );
    }, [ability, organizationUuid, projectUuid]);

    const result = useMemo(() => {
        return {
            shouldShowMenu,
            canViewUnderlyingData,
            canViewExplore,
            canDrillInto,
            isMinimal: minimal,
        };
    }, [
        shouldShowMenu,
        canViewUnderlyingData,
        canViewExplore,
        canDrillInto,
        minimal,
    ]);

    return result;
};
