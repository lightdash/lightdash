import { subject } from '@casl/ability';
import { type ProjectHomepage } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import Page from '../../../components/common/Page/Page';
import ForbiddenPanel from '../../../components/ForbiddenPanel';
import PageSpinner from '../../../components/PageSpinner';
import { usePinnedItems } from '../../../hooks/pinning/usePinnedItems';
import { useProject } from '../../../hooks/useProject';
import useApp from '../../../providers/App/useApp';
import { CreateHomepageModal } from './CreateHomepageModal';
import { HomepageEditor } from './HomepageEditor';
import { useHomepageAiState } from './hooks/useHomepageAiState';
import { useKeySpaces } from './hooks/useKeySpaces';
import {
    useCreateHomepageWithDraft,
    useHomepageBuilderFlag,
    useHomepageForBuilder,
    useProjectHomepages,
} from './hooks/useProjectHomepage';
import { buildStarterHomepage } from './starterHomepage';

// Matches day-0's cap so the first draft is the page people were looking at.
const MAX_STARTER_SPACES = 4;

// ts-unused-exports:disable-next-line
export const HomepageBuilderPage: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [editorEpoch, setEditorEpoch] = useState(0);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(
        searchParams.get('create') === '1',
    );
    const selectedHomepageUuid = searchParams.get('homepage') ?? undefined;
    const { user } = useApp();
    const { isEnabled: isFlagEnabled, isLoading: isFlagLoading } =
        useHomepageBuilderFlag();
    const { canAskAi, isLoading: isAiStateLoading } =
        useHomepageAiState(projectUuid);
    // The starter homepage mirrors day-0: the project's pins and the same key
    // spaces day-0 leads its body with.
    const { data: project } = useProject(projectUuid);
    const { data: pinnedItems } = usePinnedItems(
        projectUuid,
        project?.pinnedListUuid,
    );
    const { spaces: keySpaces } = useKeySpaces(projectUuid, MAX_STARTER_SPACES);
    const homepage = useHomepageForBuilder(projectUuid, {
        enabled: isFlagEnabled,
        homepageUuid: selectedHomepageUuid,
    });
    const homepages = useProjectHomepages(projectUuid, {
        enabled: isFlagEnabled,
    });
    const createFirstHomepage = useCreateHomepageWithDraft(projectUuid ?? '');

    const canManage =
        user.data?.ability?.can(
            'manage',
            subject('ProjectHomepage', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        ) ?? false;

    const openHomepage = useCallback(
        (created: ProjectHomepage) => {
            setIsCreateModalOpen(false);
            setSearchParams({ homepage: created.homepageUuid });
        },
        [setSearchParams],
    );

    // When there's no homepage yet, skip any intermediate screen: create a
    // default one and drop straight into the builder. Guarded so it fires once
    // and never while we're navigating away after deleting the last homepage.
    const isLeaving = useRef(false);
    const didAutoCreate = useRef(false);
    const shouldAutoCreate =
        isFlagEnabled &&
        !isAiStateLoading &&
        canManage &&
        !!projectUuid &&
        homepage.isFetchedAfterMount &&
        !homepage.data &&
        !isLeaving.current;

    useEffect(() => {
        if (!shouldAutoCreate || didAutoCreate.current) return;
        didAutoCreate.current = true;
        createFirstHomepage.mutate(
            {
                name: 'Homepage',
                draftConfig: buildStarterHomepage(
                    canAskAi,
                    (pinnedItems ?? []).map((item) => ({
                        contentType: item.type,
                        uuid: item.data.uuid,
                    })),
                    keySpaces.map((space) => space.uuid),
                ),
            },
            { onSuccess: openHomepage },
        );
    }, [
        shouldAutoCreate,
        createFirstHomepage,
        openHomepage,
        canAskAi,
        pinnedItems,
        keySpaces,
    ]);

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
                homepages={homepages.data ?? []}
                onSwitchHomepage={(homepageUuid) =>
                    setSearchParams({ homepage: homepageUuid })
                }
                onCreateNew={() => setIsCreateModalOpen(true)}
                onDeleted={() => {
                    const remaining = (homepages.data ?? []).filter(
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
                homepages={homepages.data ?? []}
                onCreated={openHomepage}
            />
        </Page>
    );
};
