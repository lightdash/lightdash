import {
    ProjectType,
    type ApiError,
    type CreateTrainingPreviewResults,
} from '@lightdash/common';
import { Anchor, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    type FC,
    Fragment,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { GuidedTour, type TourPoint } from '../../components/common/GuidedTour';
import { useProject } from '../../hooks/useProject';
import { useOptionalProjectRoute } from '../../hooks/useProjectRoute';
import { useProjects } from '../../hooks/useProjects';
import { LearnDoneModal } from '../learn/LearnDoneModal';
import { readLearnOrigin } from '../learn/origin';
import { markScopeCompleted, markScopeStarted } from '../learn/progress';
import { SCOPE_TOURS } from './generated';
import {
    createTrainingPreview,
    deleteTrainingPreviews,
    tourUrlInCopy,
    LEAVING_COPY_STATE,
} from './trainingCopy';

const TOUR_PARAM = 'tour';

/**
 * The running tour, kept for the tab: some pages (Ask AI) live under another
 * layout, so the host remounts when the learner clicks into them, and a
 * reload would otherwise lose the tour while the copy it runs in remains.
 */
const STORAGE_KEY = 'lightdash.scopeTour';
type StoredTour = {
    scope: string;
    projectUuid: string;
    stepIndex: number;
    /** Where to go when the tour ends; the library if it started there. */
    returnTo?: ReturnTo;
    /** Where the ring collapsed to on the click that reached this step. */
    beacon?: TourPoint | null;
};
const readStoredTour = (): StoredTour | null => {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as StoredTour) : null;
    } catch {
        return null;
    }
};
const writeStoredTour = (tour: StoredTour | null) => {
    try {
        if (tour) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tour));
        else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage unavailable: the tour still runs, it just will not survive
        // a remount.
    }
};

/**
 * Docs text keeps `**...**` around permission and control names (shown bold)
 * and `[text](url)` links to the docs site (opened in a new tab, so the
 * walkthrough keeps its place).
 */
const renderDocsText = (text: string) =>
    text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
        const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
        if (link) {
            return (
                <Anchor
                    key={index}
                    href={link[2]}
                    target="_blank"
                    rel="noreferrer"
                    fz="inherit"
                    c="indigo"
                >
                    {link[1]}
                </Anchor>
            );
        }
        return part.startsWith('**') && part.endsWith('**') ? (
            <Text key={index} component="span" fw={600} c="inherit">
                {part.slice(2, -2)}
            </Text>
        ) : (
            <Fragment key={index}>{part}</Fragment>
        );
    });
/** Present once the learner is inside their own copy of the training project. */
const COPY_PARAM = 'copy';
/** Where the learner came from (`learn`): where the tour sends them back. */
const FROM_PARAM = 'from';
type ReturnTo = 'home' | 'learn';

/**
 * Runs a generated scope walkthrough for the current project. Mounted once per
 * layout that project pages use (the project layout, the Ask AI layout) so the
 * tour survives the page changes the learner makes; the step reached is kept
 * in session storage across the remount between layouts and across a reload.
 * Start one with `?tour=<scope>` on any project route, e.g.
 * `/projects/<uuid>/home?tour=manage:PinnedItems`.
 *
 * Started on the shared training project, the tour first moves the learner
 * into a fresh personal copy of it, so every run begins from the seeded state
 * and never disturbs anyone else. The one navigation the tour ever performs.
 */
const ScopeTourHost: FC = () => {
    // Project routes may carry a slug rather than a uuid; the route context
    // has both resolved.
    const projectRoute = useOptionalProjectRoute();
    // Pages outside the project route (Ask AI) only carry the uuid in the URL.
    const { projectUuid: projectUuidParam } = useParams<{
        projectUuid: string;
    }>();
    const { data: projectFromParam } = useProject(projectUuidParam, {
        enabled: !projectRoute && !!projectUuidParam,
    });
    const projectUuid =
        projectRoute?.projectUuid ?? projectFromParam?.projectUuid;
    const project = projectRoute?.project ?? projectFromParam;
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [activeScope, setActiveScope] = useState<string | null>(null);
    const [reachedStep, setReachedStep] = useState(0);
    const [reachedBeacon, setReachedBeacon] = useState<TourPoint | null>(null);
    const [returnTo, setReturnTo] = useState<ReturnTo>('home');
    // A tour already under way in this project resumes where it was left,
    // once the host knows which project it is on. Read once per mount and
    // consumed on resume, so a tour that has just been closed is not picked
    // up again from the same reading.
    const storedRef = useRef<StoredTour | null | undefined>(undefined);
    if (storedRef.current === undefined) storedRef.current = readStoredTour();
    useEffect(() => {
        const stored = storedRef.current;
        if (activeScope || !projectUuid || !stored) return;
        if (stored.projectUuid !== projectUuid || !SCOPE_TOURS[stored.scope])
            return;
        storedRef.current = null;
        setReachedStep(stored.stepIndex);
        setReachedBeacon(stored.beacon ?? null);
        setReturnTo(stored.returnTo ?? 'home');
        setActiveScope(stored.scope);
    }, [activeScope, projectUuid]);

    const requested = searchParams.get(TOUR_PARAM);
    const requestedFrom: ReturnTo =
        searchParams.get(FROM_PARAM) === 'learn' ? 'learn' : 'home';
    // Tours run only in the training project or a learner's copy of it.
    // A tour link opened on any other project is redirected to the org's
    // training project, or ignored if there is none.
    const { data: projects } = useProjects({ enabled: requested !== null });
    const trainingProject = projects?.find(
        (candidate) => candidate.type === ProjectType.TRAINING,
    );
    const isTrainingCopy =
        project?.type === ProjectType.PREVIEW &&
        !!project.upstreamProjectUuid &&
        project.upstreamProjectUuid === trainingProject?.projectUuid;

    // Skipping a tour that ran in a personal copy removes the copy and
    // returns the learner to the shared training project: the library if
    // the tour started there, else the homepage. Got it keeps the copy and
    // opens the completion dialog in place; leaving it is what removes it.
    const { mutate: closeCopy } = useMutation<
        undefined,
        ApiError,
        { trainingProjectUuid: string }
    >(
        ({ trainingProjectUuid }) =>
            deleteTrainingPreviews(trainingProjectUuid),
        {
            onSettled: async () => {
                await Promise.all([
                    queryClient.invalidateQueries(['projects']),
                    queryClient.invalidateQueries(['user']),
                    queryClient.invalidateQueries(['account']),
                ]);
            },
        },
    );
    // Got it and Skip share handleClose. GuidedTour fires onFinish and then
    // onClose in the same click, so state set in onFinish would not be
    // visible yet; a ref carries the distinction across the two calls.
    const finishedRef = useRef(false);
    // The module whose completion dialog is open, over the page where Got
    // it was pressed. The copy stays until a choice is made.
    const [finishedScope, setFinishedScope] = useState<string | null>(null);
    const handleFinish = () => {
        if (activeScope) markScopeCompleted(activeScope);
        finishedRef.current = true;
    };
    const upstream =
        project?.type === ProjectType.PREVIEW
            ? (project.upstreamProjectUuid ?? null)
            : null;
    // Where the learner goes when the copy is put away: the project the
    // library was opened from (its library, or its home), if it is still
    // theirs, else the training project. The library renders on any
    // project route, so returning there keeps them in their own project.
    const origin = readLearnOrigin();
    const returnProject =
        origin &&
        projects?.some((candidate) => candidate.projectUuid === origin)
            ? origin
            : upstream;
    // Leave the copy before it is removed, and only remove it once the
    // learner's page has changed: the page being left is addressed by the
    // copy's slug, and it stays mounted until the next page has loaded. If
    // the project list refreshed first, that page would find its slug gone
    // and send the learner to the homepage, undoing the return.
    const leaveCopy = async (to: string, trainingProjectUuid: string) => {
        await navigate(to, { state: LEAVING_COPY_STATE });
        closeCopy({ trainingProjectUuid });
    };
    const handleClose = () => {
        // Capture before the state is cleared, and reset the ref so a later
        // Skip stays a Skip.
        const scope = activeScope;
        const finished = finishedRef.current;
        finishedRef.current = false;
        setActiveScope(null);
        storedRef.current = null;
        writeStoredTour(null);
        if (!upstream) return;
        if (finished && scope) {
            setFinishedScope(scope);
            return;
        }
        void leaveCopy(
            `/projects/${returnProject}/${returnTo === 'learn' ? 'learn' : 'home'}`,
            upstream,
        );
    };
    const handleBackToLibrary = () => {
        if (!upstream) return;
        setFinishedScope(null);
        void leaveCopy(`/projects/${returnProject}/learn`, upstream);
    };
    // One copy per tour start. `isLoading` is not set synchronously, and the
    // effect below re-runs as its inputs settle, so a ref does the gating; a
    // second request would delete the copy the learner is being sent to.
    const copyRequestedRef = useRef(false);
    const { mutate: startInFreshCopy, isLoading: openingCopy } = useMutation<
        CreateTrainingPreviewResults,
        ApiError,
        {
            trainingProjectUuid: string;
            scope: string;
            from: ReturnTo;
            /** Started from the completion dialog in a copy about to go. */
            leavingCopy?: boolean;
        }
    >(({ trainingProjectUuid }) => createTrainingPreview(trainingProjectUuid), {
        onError: () => {
            copyRequestedRef.current = false;
        },
        onSuccess: async (copy, { scope, from, leavingCopy }) => {
            const to = tourUrlInCopy(copy.projectUuid, scope, from);
            // The navbar resolves the active project from the cached project
            // list, and the trainee permissions on the new copy only exist
            // in a freshly built ability, so both are refreshed around the
            // move. From a copy, the move comes first: the page being left
            // is addressed by its slug, which the refreshed list no longer
            // has (see leaveCopy). Every org member can view any project of
            // the org, so the new copy opens on the old ability, and the
            // walkthrough waits for its controls while the ability catches
            // up.
            const refresh = () =>
                Promise.all([
                    queryClient.invalidateQueries(['projects']),
                    queryClient.invalidateQueries(['user']),
                    queryClient.invalidateQueries(['account']),
                ]);
            if (leavingCopy) {
                setFinishedScope(null);
                await navigate(to, { state: LEAVING_COPY_STATE });
                await refresh();
                return;
            }
            await refresh();
            void navigate(to);
        },
    });

    // Next makes the fresh copy from here and goes straight into it, so no
    // page shows on the way. Making it removes this copy on the server, so
    // nothing here has to be deleted first (and nothing can delete the copy
    // being made). The copy stays on screen, behind the dialog, until the
    // new one is ready.
    const handleNext = (nextScope: string) => {
        if (!upstream || openingCopy) return;
        markScopeStarted(nextScope);
        startInFreshCopy({
            trainingProjectUuid: upstream,
            scope: nextScope,
            from: 'learn',
            leavingCopy: true,
        });
    };

    useEffect(() => {
        if (!requested || !projectUuid || !SCOPE_TOURS[requested]) return;
        if (!project || !projects) return; // wait to learn where we are
        if (project.type !== ProjectType.TRAINING && !isTrainingCopy) {
            const next = new URLSearchParams(searchParams);
            next.delete(TOUR_PARAM);
            next.delete(COPY_PARAM);
            next.delete(FROM_PARAM);
            if (trainingProject) {
                void navigate(
                    `/projects/${trainingProject.projectUuid}/home?${TOUR_PARAM}=${encodeURIComponent(requested)}${requestedFrom === 'learn' ? `&${FROM_PARAM}=learn` : ''}`,
                );
            } else {
                setSearchParams(next, { replace: true });
            }
            return;
        }
        // A tour only ever runs in the learner's own copy; being on the
        // shared training project means one has to be made first. The
        // `copy` parameter is informational: a link cannot claim to be a
        // copy, since anything written on the shared project would be
        // cloned into every other learner's copy.
        if (project.type === ProjectType.TRAINING) {
            if (!copyRequestedRef.current) {
                copyRequestedRef.current = true;
                startInFreshCopy({
                    trainingProjectUuid: projectUuid,
                    scope: requested,
                    from: requestedFrom,
                });
            }
            return;
        }
        copyRequestedRef.current = false;
        setActiveScope(requested);
        setReachedStep(0);
        setReturnTo(requestedFrom);
        writeStoredTour({
            scope: requested,
            projectUuid,
            stepIndex: 0,
            returnTo: requestedFrom,
        });
        // Consume the parameters so a reload does not restart the tour.
        const next = new URLSearchParams(searchParams);
        next.delete(TOUR_PARAM);
        next.delete(COPY_PARAM);
        next.delete(FROM_PARAM);
        setSearchParams(next, { replace: true });
    }, [
        requested,
        project,
        projects,
        trainingProject,
        isTrainingCopy,
        projectUuid,
        startInFreshCopy,
        navigate,
        searchParams,
        requestedFrom,
        setSearchParams,
    ]);

    const steps = useMemo(() => {
        if (!activeScope || !projectUuid) return [];
        return SCOPE_TOURS[activeScope].steps.map((step) => ({
            ...step,
            body: renderDocsText(step.body),
            route: step.route?.replace(':projectUuid', projectUuid),
        }));
    }, [activeScope, projectUuid]);

    const handleStepChange = useCallback(
        (stepIndex: number, beacon: TourPoint | null) => {
            if (!activeScope || !projectUuid) return;
            writeStoredTour({
                scope: activeScope,
                projectUuid,
                stepIndex,
                beacon,
                returnTo,
            });
        },
        [activeScope, projectUuid, returnTo],
    );

    // Within a tour the host never navigates: every page change is the
    // learner's own click on a spotlighted control (see `via` on the steps).
    // Mounted only while a tour runs, so a resumed tour opens on the step it
    // had reached rather than on the first.
    if (finishedScope !== null && upstream) {
        return (
            <LearnDoneModal
                scope={finishedScope}
                opening={openingCopy}
                onBack={handleBackToLibrary}
                onNext={handleNext}
            />
        );
    }
    if (activeScope === null || steps.length === 0) return null;
    return (
        <GuidedTour
            steps={steps}
            opened
            onClose={handleClose}
            onFinish={handleFinish}
            onStepChange={handleStepChange}
            initialStepIndex={reachedStep}
            initialBeacon={reachedBeacon}
            // Steps change state (a pin, a saved chart); no going back.
            allowBack={false}
        />
    );
};

export default ScopeTourHost;
