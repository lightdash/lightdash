import { subject } from '@casl/ability';
import { ProjectType } from '@lightdash/common';
import { useMemo } from 'react';
import { useProjects } from '../../hooks/useProjects';
import useApp from '../../providers/App/useApp';
import { useLearnAvailability } from './availability';
import {
    buildLearnCatalogue,
    isComplete,
    isStarted,
    upNextFor,
    type LearnModule,
} from './catalogue';
import { useLearnProgress } from './progress';
import { useLearnAccess } from './useLearnAccess';

/**
 * The modules this instance can run: a walkthrough clicks the real product,
 * so a module whose feature the instance hides is left out. The library and
 * the homepage's Learn block read the same list.
 */
export const useLearnCatalogue = () => {
    const { isOpen, isSettled } = useLearnAvailability();
    const catalogue = useMemo(
        () => buildLearnCatalogue().filter(isOpen),
        [isOpen],
    );
    return { catalogue, isSettled };
};

export type LearnUpNextState = {
    /** The viewer holds `view:Learn`. */
    canViewLearn: boolean;
    /** The organization's training project; undefined until Learn is enabled. */
    trainingProjectUuid: string | undefined;
    /** What the library's Up next card shows; undefined once all is done. */
    upNext:
        | {
              module: LearnModule;
              source: 'recommended' | 'resume';
              started: boolean;
          }
        | undefined;
    /** Every walkthrough this instance runs, in the library's order. */
    walkthroughs: LearnModule[];
    /** Scopes the learner has finished and started, as the library reads them. */
    completed: string[];
    started: string[];
    doneCount: number;
    total: number;
    /** Every input has answered, so the state above is final. */
    isSettled: boolean;
};

/**
 * The learner's next module and progress, outside the library, worked out
 * exactly as the library does (`upNextFor` over the same catalogue, access
 * and progress), so the homepage never recommends something the library
 * would not. Nothing is requested for a user who cannot see Learn.
 */
export const useLearnUpNext = (): LearnUpNextState => {
    const { user } = useApp();
    const canViewLearn =
        user.data?.ability.can(
            'view',
            subject('Learn', { organizationUuid: user.data.organizationUuid }),
        ) === true;
    const { data: projects } = useProjects();
    const trainingProjectUuid = projects?.find(
        (project) => project.type === ProjectType.TRAINING,
    )?.projectUuid;
    const { catalogue, isSettled: isCatalogueSettled } = useLearnCatalogue();
    const {
        completed,
        started,
        lastStarted,
        isSettled: isProgressSettled,
    } = useLearnProgress();
    const { held, isSettled: isAccessSettled } = useLearnAccess({
        enabled: canViewLearn,
    });

    return useMemo(() => {
        const available = catalogue.filter((module) => module.available);
        const next = upNextFor(held, available, completed, lastStarted);
        return {
            canViewLearn,
            trainingProjectUuid,
            upNext: next && {
                ...next,
                started: isStarted(started, next.module),
            },
            walkthroughs: available,
            completed,
            started,
            doneCount: available.filter((module) =>
                isComplete(completed, module),
            ).length,
            total: available.length,
            isSettled:
                !canViewLearn ||
                (!!projects &&
                    isCatalogueSettled &&
                    isProgressSettled &&
                    isAccessSettled),
        };
    }, [
        canViewLearn,
        trainingProjectUuid,
        projects,
        catalogue,
        held,
        completed,
        started,
        lastStarted,
        isCatalogueSettled,
        isProgressSettled,
        isAccessSettled,
    ]);
};
