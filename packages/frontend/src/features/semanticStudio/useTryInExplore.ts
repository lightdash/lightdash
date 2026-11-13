import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useDevelopmentView } from './developmentView';

const PREVIEW_PROJECT = /\/projects\/([0-9a-f-]{36})/;

/** The project a pull request's preview link points at, or null without one. */
export const findPreviewProjectUuid = (
    previewUrl: string | null | undefined,
): string | null => PREVIEW_PROJECT.exec(previewUrl ?? '')?.[1] ?? null;

/** Switches the person's queries to their own changes and opens a changed model in Explore, in one step. */
export const useTryInExplore = (projectUuid: string) => {
    const [, setIsOnMyChanges] = useDevelopmentView();
    const navigate = useNavigate();
    return useCallback(
        (model: string, previewProjectUuid: string | null) => {
            setIsOnMyChanges(true, previewProjectUuid);
            void navigate(
                `/projects/${projectUuid}/tables/${encodeURIComponent(model)}`,
            );
        },
        [projectUuid, setIsOnMyChanges, navigate],
    );
};
