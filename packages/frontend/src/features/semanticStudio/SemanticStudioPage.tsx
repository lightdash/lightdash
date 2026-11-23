/**
 * /projects/:projectUuid/semantic-layer/*, listed under Browse. Everyone in
 * the project opens it; what they see is what the backend returns for them,
 * and what they can change follows their role (see permissions.ts). The rest
 * of the path is the page you are on; see urls.ts.
 */
import { FeatureFlags } from '@lightdash/common';
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
import { usePrefetchStudioAgent } from '../../ee/features/aiCopilot/components/SemanticStudioAgent/useSemanticStudioChat';
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
    type StudioPermissions,
} from './permissions';
import { buildRealProject } from './realProject';
import { StudioPageSkeleton } from './StudioPageSkeleton';
import {
    getSemanticStudioSourceUrl,
    getSemanticStudioUrl,
    parseSemanticStudioPath,
    type StudioRoute,
} from './urls';
import {
    keepsSemanticLayerDraft,
    useSemanticLayerDraft,
    useSemanticLayerStatus,
} from './useSemanticLayerModel';
import {
    foldDraftExplores,
    usePublishedExplores,
    StudioCheckoutProvider,
    useStudioCheckoutState,
} from './useStudioCheckout';
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
    const liveSourcesFlag = useServerFeatureFlag(FeatureFlags.ApiQuerySources);
    const {
        data: project,
        isInitialLoading: isProjectLoading,
        error: projectError,
    } = useProject(projectUuid);
    // A draft kept in the app is laid over the published list, which is then the same on and off the draft.
    const status = useSemanticLayerStatus(projectUuid ?? '');
    const readsPublished = !!status?.enabled && keepsSemanticLayerDraft(status);
    const viewExplores = useExplores(projectUuid, true, false, {
        enabled: !!projectUuid && !readsPublished,
    });
    const publishedExplores = usePublishedExplores(projectUuid, readsPublished);
    const explores = {
        data: readsPublished
            ? (publishedExplores.data ?? viewExplores.data)
            : viewExplores.data,
        isInitialLoading:
            viewExplores.isInitialLoading ||
            (publishedExplores.isInitialLoading && !viewExplores.data),
        error: readsPublished ? publishedExplores.error : viewExplores.error,
    };
    const ability = user.data?.ability;
    const organizationUuid = user.data?.organizationUuid;
    const isLiveSourcesEnabled = !!liveSourcesFlag.data?.enabled;
    // A kind whose feature flag is off can't be added or managed, matching
    // project settings.
    const permissions = useMemo((): StudioPermissions | null => {
        if (!ability || !organizationUuid || !projectUuid) return null;
        const granted = getStudioPermissions(
            ability,
            organizationUuid,
            projectUuid,
        );
        return {
            ...granted,
            live: granted.live && isLiveSourcesEnabled,
        };
    }, [ability, organizationUuid, projectUuid, isLiveSourcesEnabled]);
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

    // Asked for now, so the change and its chat load alongside the explores and not after them.
    const checkout = useStudioCheckoutState(projectUuid ?? '');
    // A draft just read as empty has nothing to lay over the list, even while the checkout still holds it.
    // WorkbenchView's marks follow the checkout itself.
    const ownDraft = useSemanticLayerDraft(projectUuid ?? '', !!projectUuid);
    const isDraftGone =
        ownDraft.data?.changes.length === 0 && !ownDraft.isFetching;
    const listedDraft = isDraftGone ? null : (checkout.shown?.draft ?? null);
    usePrefetchStudioAgent(projectUuid);

    const realProject = useMemo(
        () =>
            project && explores.data
                ? buildRealProject({
                      project,
                      explores: foldDraftExplores(explores.data, listedDraft),
                      externalSources: externalSources.data ?? [],
                      liveConnections: liveConnections.data ?? [],
                  })
                : null,
        [
            project,
            explores.data,
            listedDraft,
            externalSources.data,
            liveConnections.data,
        ],
    );

    if (
        liveSourcesFlag.isInitialLoading ||
        isProjectLoading ||
        explores.isInitialLoading ||
        externalSources.isInitialLoading ||
        liveConnections.isInitialLoading
    ) {
        return (
            <Page title="Semantic Layer" withFullHeight noContentPadding>
                <StudioPageSkeleton />
            </Page>
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
            <StudioCheckoutProvider value={checkout}>
                <WorkbenchView
                    project={realProject}
                    permissions={permissions}
                    canOpenSettings={canOpenSettings}
                    route={route}
                    onNavigate={onNavigate}
                />
            </StudioCheckoutProvider>
        </Page>
    );
};

export default SemanticStudioPage;
