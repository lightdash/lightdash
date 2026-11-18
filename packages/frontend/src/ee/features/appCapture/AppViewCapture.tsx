import { forwardRef, useCallback, useMemo, useRef } from 'react';
import { buildAppCapturePrompt } from '../../../features/apps/utils/appViewCapture';
import { captureTranscriber } from '../../../features/apps/utils/transcribeCapture';
import useToaster from '../../../hooks/toaster/useToaster';
import useApp from '../../../providers/App/useApp';
import { useLauncherDock } from '../aiCopilot/components/Launcher/useLauncherDock';
import { useCreateAgentThreadMutation } from '../aiCopilot/hooks/useProjectAiAgents';
import { store as aiAgentStore } from '../aiCopilot/store';
import { openPanel } from '../aiCopilot/store/aiAgentLauncherSlice';
import {
    CaptureHost,
    type CaptureHostHandle,
    type CaptureResult,
    type CaptureSurface,
} from '../capture';
import { imageToJpegBase64 } from '../dashboardCapture/routeRequest';
import { uploadCaptureImages } from '../dashboardCapture/uploadCaptureImages';

type Props = {
    projectUuid: string;
    appName: string;
    agentUuid: string;
    /** The app's frame: the part of the page that can be drawn on. */
    getRegion: () => DOMRect;
    onRecordingChange: (isRecording: boolean) => void;
};

/** Inline on a published app: the recording becomes one agent thread. */
const AppViewCapture = forwardRef<CaptureHostHandle, Props>(
    (
        { projectUuid, appName, agentUuid, getRegion, onRecordingChange },
        ref,
    ) => {
        const { showToastInfo, showToastError } = useToaster();
        const { addItem: addDockItem } = useLauncherDock(projectUuid);
        const { mutateAsync: createThread } = useCreateAgentThreadMutation(
            projectUuid,
            {
                skipNavigation: true,
                onCreated: (thread) => {
                    addDockItem({
                        threadId: thread.uuid,
                        agentUuid: thread.agentUuid,
                        title: thread.firstMessage.message,
                    });
                    aiAgentStore.dispatch(
                        openPanel({
                            threadId: thread.uuid,
                            agentUuid: thread.agentUuid,
                        }),
                    );
                },
            },
        );

        const handleCapture = useCallback(
            async (result: CaptureResult) => {
                showToastInfo({ title: 'Sending your questions to the agent' });
                try {
                    // No screenshots is fine: the questions still go as text.
                    const imageUuids = await Promise.all(
                        result.images.map(imageToJpegBase64),
                    )
                        .then(uploadCaptureImages)
                        .catch((): string[] => []);
                    await createThread({
                        agentUuid,
                        prompt: buildAppCapturePrompt({
                            appName,
                            summary: result.summary,
                            hasImages: imageUuids.length > 0,
                        }),
                        context: imageUuids.map((fileUuid) => ({
                            type: 'thread_image' as const,
                            fileUuid,
                        })),
                    });
                } catch {
                    showToastError({
                        title: 'Could not send your questions to the agent',
                    });
                }
            },
            [agentUuid, appName, createThread, showToastError, showToastInfo],
        );
        const handleCaptureRef = useRef(handleCapture);
        handleCaptureRef.current = handleCapture;
        const getRegionRef = useRef(getRegion);
        getRegionRef.current = getRegion;

        const { health } = useApp();
        const voiceTranscriptionAvailable =
            health.data?.ai.voiceTranscriptionAvailable;
        const surface = useMemo<CaptureSurface>(
            () => ({
                getRegion: () => getRegionRef.current(),
                captureImages: true,
                resolveTarget: null,
                transcribe: captureTranscriber(
                    projectUuid,
                    voiceTranscriptionAvailable,
                ),
                onCapture: (result) => void handleCaptureRef.current(result),
            }),
            [projectUuid, voiceTranscriptionAvailable],
        );

        return (
            <CaptureHost
                ref={ref}
                surface={surface}
                onRecordingChange={onRecordingChange}
            />
        );
    },
);

export default AppViewCapture;
