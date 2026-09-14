import { type ProjectHomepage } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import Page from '../../../components/common/Page/Page';
import ForbiddenPanel from '../../../components/ForbiddenPanel';
import PageSpinner from '../../../components/PageSpinner';
import { usePinnedItems } from '../../../hooks/pinning/usePinnedItems';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { CreateHomepageModal } from './CreateHomepageModal';
import { HomepageEditor } from './HomepageEditor';
import { useCanManageHomepage } from './hooks/useHomepageAbilities';
import { useKeySpaces } from './hooks/useKeySpaces';
import { useHomepageOpening } from './hooks/useOrgHomepageSettings';
import {
    useCreateHomepageWithDraft,
    useHomepageBuilderFlag,
    useHomepageForBuilder,
    useProjectHomepages,
} from './hooks/useProjectHomepage';
import { buildStarterHomepage } from './starterHomepage';

// Matches day-0's cap so the first draft is the page people were looking at.
const MAX_STARTER_SPACES = 4;

// When there's no homepage yet, skip any intermediate screen: create a
// default one and drop straight into the builder. Guarded so it fires once.
// The starter homepage mirrors day-0: the project's pins and the same key
// spaces day-0 leads its body with.
const useAutoCreateStarterHomepage = ({
    projectUuid,
    enabled,
    homepage,
    opening,
    onCreated,
}: {
    projectUuid: string | undefined;
    enabled: boolean;
    homepage: ReturnType<typeof useHomepageForBuilder>;
    opening: ReturnType<typeof useHomepageOpening>['opening'];
    onCreated: (created: ProjectHomepage) => void;
}) => {
    const { data: project } = useProject(projectUuid);
    const { data: pinnedItems } = usePinnedItems(
        projectUuid,
        project?.pinnedListUuid,
    );
    const { spaces: keySpaces } = useKeySpaces(projectUuid, MAX_STARTER_SPACES);
    const createFirstHomepage = useCreateHomepageWithDraft(projectUuid ?? '');
    const didAutoCreate = useRef(false);
    const shouldAutoCreate =
        enabled &&
        !!projectUuid &&
        homepage.isFetchedAfterMount &&
        !homepage.data;

    useEffect(() => {
        if (!shouldAutoCreate || didAutoCreate.current) return;
        didAutoCreate.current = true;
        createFirstHomepage.mutate(
            {
                name: 'Homepage',
                draftConfig: buildStarterHomepage(
                    opening,
                    (pinnedItems ?? []).map((item) => ({
                        contentType: item.type,
                        uuid: item.data.uuid,
                    })),
                    keySpaces.map((space) => space.uuid),
                ),
            },
            { onSuccess: onCreated },
        );
    }, [
        shouldAutoCreate,
        createFirstHomepage,
        onCreated,
        opening,
        pinnedItems,
        keySpaces,
    ]);
};

// ts-unused-exports:disable-next-line
export const HomepageBuilderPage: FC = () => {
    const projectUuid = useProjectUuid();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [editorEpoch, setEditorEpoch] = useState(0);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(
        searchParams.get('create') === '1',
    );
    const selectedHomepageUuid = searchParams.get('homepage') ?? undefined;
    const { isEnabled: isFlagEnabled, isLoading: isFlagLoading } =
        useHomepageBuilderFlag();
    const { opening, isLoading: isAiStateLoading } =
        useHomepageOpening(projectUuid);
    const canManage = useCanManageHomepage(projectUuid);
    const homepage = useHomepageForBuilder(projectUuid, {
        enabled: isFlagEnabled,
        homepageUuid: selectedHomepageUuid,
    });
    const homepages = useProjectHomepages(projectUuid, {
        enabled: isFlagEnabled,
    });
    const homepageList = homepages.data ?? [];

    const openHomepage = useCallback(
        (created: ProjectHomepage) => {
            setIsCreateModalOpen(false);
            setSearchParams({ homepage: created.homepageUuid });
        },
        [setSearchParams],
    );

    // Never auto-create while we're navigating away after deleting the last
    // homepage.
    const isLeaving = useRef(false);
    useAutoCreateStarterHomepage({
        projectUuid,
        enabled:
            isFlagEnabled &&
            !isAiStateLoading &&
            canManage &&
            !isLeaving.current,
        homepage,
        opening,
        onCreated: openHomepage,
    });

    if (isFlagLoading || isAiStateLoading) {
        return <PageSpinner />;
    }

    // Wait for a fresh fetch: the editor snapshots the draft on mount, so
    // seeding it from a stale cache would autosave old state over the server
    if (isFlagEnabled && !homepage.isFetchedAfterMount) {
        return <PageSpinner />;
    }

    if (!isFlagEnabled || !canManage || !projectUuid) {
        return <ForbiddenPanel />;
    }

    const closeCreateModal = () => {
        setIsCreateModalOpen(false);
        if (searchParams.get('create')) {
            const next = new URLSearchParams(searchParams);
            next.delete('create');
            setSearchParams(next, { replace: true });
        }
    };

    // No homepage yet: the auto-create effect is handling it — show a spinner
    // until it opens the new homepage.
    if (!homepage.data) {
        return <PageSpinner />;
    }

    const currentHomepageUuid = homepage.data.homepageUuid;

    return (
        <Page noContentPadding>
            <HomepageEditor
                key={`${currentHomepageUuid}-${editorEpoch}`}
                homepage={homepage.data}
                projectUuid={projectUuid}
                homepages={homepageList}
                onSwitchHomepage={(homepageUuid) =>
                    setSearchParams({ homepage: homepageUuid })
                }
                onCreateNew={() => setIsCreateModalOpen(true)}
                onDeleted={() => {
                    const remaining = homepageList.filter(
                        (h) => h.homepageUuid !== currentHomepageUuid,
                    );
                    if (remaining.length > 0) {
                        setSearchParams({
                            homepage: remaining[0].homepageUuid,
                        });
                    } else {
                        // Deleted the last one — leave the builder for /home.
                        isLeaving.current = true;
                        void navigate(`/projects/${projectUuid}/home`);
                    }
                }}
                onReload={async () => {
                    await queryClient.refetchQueries([
                        'project_homepage',
                        projectUuid,
                        'builder',
                    ]);
                    setEditorEpoch((epoch) => epoch + 1);
                }}
            />
            <CreateHomepageModal
                opened={isCreateModalOpen}
                onClose={closeCreateModal}
                projectUuid={projectUuid}
                homepages={homepageList}
                onCreated={openHomepage}
            />
        </Page>
    );
};
