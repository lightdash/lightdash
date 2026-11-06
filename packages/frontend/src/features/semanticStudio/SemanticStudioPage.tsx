/**
 * /projects/:projectUuid/semantic-layer/*, listed under Browse. Everyone in
 * the project opens it; what they see is what the backend returns for them,
 * and what they can change follows their role (see permissions.ts). The rest
 * of the path is the page you are on; see urls.ts.
 */
import { FeatureFlags } from '@lightdash/common';
import { Center, Loader } from '@mantine/core';
import { useCallback, useMemo, type FC } from 'react';
import {
    Navigate,
    useLocation,
    useNavigate,
    useParams,
    useSearchParams,
} from 'react-router';
import ErrorState from '../../components/common/ErrorState';
import Page from '../../components/common/Page/Page';
import ForbiddenPanel from '../../components/ForbiddenPanel';
import { useExplores } from '../../hooks/useExplores';
import { useProject } from '../../hooks/useProject';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../providers/App/useApp';
import { useExternalConnections } from '../externalConnections/hooks/useExternalConnections';
import { useExternalSources } from '../externalSources/hooks/useExternalSources';
import {
    canListLiveSources,
    canOpenProjectSettings,
    canOpenSemanticStudio,
    getStudioPermissions,
} from './permissions';
import { buildRealProject } from './realProject';
import {
    getSemanticStudioSourceUrl,
    getSemanticStudioUrl,
    parseSemanticStudioPath,
    type StudioRoute,
} from './urls';
import { type StudioPermissions } from './useSemanticStudio';
import { useStudioWarehouses } from './warehouses';
import { WorkbenchView } from './WorkbenchView';

const SemanticStudioPage: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [searchParams] = useSearchParams();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const route = useMemo(() => parseSemanticStudioPath(pathname), [pathname]);
    const onNavigate = useCallback(
        (next: StudioRoute, options?: { replace?: boolean }) => {
            if (!projectUuid) return;
            void navigate(getSemanticStudioUrl(projectUuid, next), options);
        },
        [navigate, projectUuid],
    );
    const { user } = useApp();
    const externalSourcesFlag = useServerFeatureFlag(
        FeatureFlags.ExternalSources,
    );
    const liveSourcesFlag = useServerFeatureFlag(FeatureFlags.ApiQuerySources);
    const {
        data: project,
        isInitialLoading: isProjectLoading,
        error: projectError,
    } = useProject(projectUuid);
    const explores = useExplores(projectUuid, true);
    const ability = user.data?.ability;
    const organizationUuid = user.data?.organizationUuid;
    const isExternalSourcesEnabled = !!externalSourcesFlag.data?.enabled;
    const isLiveSourcesEnabled = !!liveSourcesFlag.data?.enabled;
    // A kind whose feature flag is off can't be added or managed, matching
    // the Explorer and project settings.
    const permissions = useMemo((): StudioPermissions | null => {
        if (!ability || !organizationUuid || !projectUuid) return null;
        const granted = getStudioPermissions(
            ability,
            organizationUuid,
            projectUuid,
        );
        return {
            ...granted,
            files: granted.files && isExternalSourcesEnabled,
            live: granted.live && isLiveSourcesEnabled,
        };
    }, [
        ability,
        organizationUuid,
        projectUuid,
        isExternalSourcesEnabled,
        isLiveSourcesEnabled,
    ]);
    const canOpen =
        !!ability &&
        !!organizationUuid &&
        !!projectUuid &&
        canOpenSemanticStudio(ability, organizationUuid, projectUuid);
    const canOpenSettings =
        !!ability &&
        !!organizationUuid &&
        !!projectUuid &&
        canOpenProjectSettings(ability, organizationUuid, projectUuid);
    // Names for the external and live explores, asked only of people the
    // backend answers; without them those explores still show, under their
    // own names.
    const externalSources = useExternalSources(
        permissions?.files ? projectUuid : undefined,
    );
    const liveConnections = useExternalConnections(
        isLiveSourcesEnabled &&
            ability &&
            organizationUuid &&
            projectUuid &&
            canListLiveSources(ability, organizationUuid, projectUuid)
            ? projectUuid
            : undefined,
    );

    // Several warehouses only with the multi-connection-projects flag.
    const warehouses = useStudioWarehouses(projectUuid);
    const warehouseConnections = warehouses.warehouses?.connections ?? null;

    const realProject = useMemo(
        () =>
            project && explores.data
                ? buildRealProject({
                      project,
                      explores: explores.data,
                      externalSources: externalSources.data ?? [],
                      liveConnections: liveConnections.data ?? [],
                      warehouseConnections,
                  })
                : null,
        [
            project,
            explores.data,
            externalSources.data,
            liveConnections.data,
            warehouseConnections,
        ],
    );

    if (
        externalSourcesFlag.isInitialLoading ||
        liveSourcesFlag.isInitialLoading ||
        isProjectLoading ||
        explores.isInitialLoading ||
        externalSources.isInitialLoading ||
        liveConnections.isInitialLoading ||
        warehouses.isInitialLoading
    ) {
        return (
            <Center h="100%">
                <Loader color="gray" />
            </Center>
        );
    }

    // Older links put the source in ?source=; move it into the path.
    const legacySourceId = searchParams.get('source');
    if (legacySourceId && projectUuid) {
        return (
            <Navigate
                replace
                to={getSemanticStudioSourceUrl(projectUuid, legacySourceId)}
            />
        );
    }

    if (!permissions || !canOpen) {
        return <ForbiddenPanel subject="Semantic Layer" />;
    }
    if (projectError) {
        return <ErrorState error={projectError.error} />;
    }
    if (explores.error) {
        return <ErrorState error={explores.error.error} />;
    }
    if (!realProject) {
        return <ForbiddenPanel subject="Semantic Layer" />;
    }

    return (
        <Page title="Semantic Layer" withFullHeight noContentPadding>
            <WorkbenchView
                project={realProject}
                permissions={permissions}
                canOpenSettings={canOpenSettings}
                route={route}
                onNavigate={onNavigate}
            />
        </Page>
    );
};

export default SemanticStudioPage;
