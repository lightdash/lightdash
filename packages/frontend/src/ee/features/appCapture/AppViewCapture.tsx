import { forwardRef, useCallback, useMemo, useRef } from 'react';
import { buildAppCapturePrompt } from '../../../features/apps/utils/appViewCapture';
import { captureTranscriber } from '../../../features/apps/utils/transcribeCapture';
import useToaster from '../../../hooks/toaster/useToaster';
import useApp from '../../../providers/App/useApp';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import {
    CaptureHost,
    type CaptureHostHandle,
    type CaptureResult,
    type CaptureSurface,
} from '../capture';
import { useSendCaptureToAgent } from '../dashboardCapture/useSendCaptureToAgent';

type Props = {
    projectUuid: string;
    appName: string;
    agentUuid: string;
    /** The app's frame: the part of the page that can be drawn on. */
    getRegion: () => DOMRect;
    onRecordingChange: (isRecording: boolean) => void;
};

/** Voice Design on a published app: the recording becomes one agent thread. */
const AppViewCapture = forwardRef<CaptureHostHandle, Props>(
    (
        { projectUuid, appName, agentUuid, getRegion, onRecordingChange },
        ref,
    ) => {
        const { showToastInfo, showToastError } = useToaster();
        const sendToAgent = useSendCaptureToAgent(projectUuid);

        const handleCapture = useCallback(
            async (result: CaptureResult) => {
                showToastInfo({ title: 'Sending your questions to the agent' });
                try {
                    await sendToAgent({
                        agentUuid,
                        prompt: buildAppCapturePrompt({
                            appName,
                            summary: result.summary,
                            hasImages: false,
                        }),
                        context: [],
                    });
                } catch {
                    showToastError({
                        title: 'Could not send your questions to the agent',
                    });
                }
            },
            [agentUuid, appName, sendToAgent, showToastError, showToastInfo],
        );
        const handleCaptureRef = useRef(handleCapture);
        handleCaptureRef.current = handleCapture;
        const getRegionRef = useRef(getRegion);
        getRegionRef.current = getRegion;

        const { health } = useApp();
        const lightdashApi = useLightdashApi();
        const voiceTranscriptionAvailable =
            health.data?.ai.voiceTranscriptionAvailable;
        const surface = useMemo<CaptureSurface>(
            () => ({
                getRegion: () => getRegionRef.current(),
                // The agent gets text only for now, so no screenshots are
                // taken and the browser never asks to share the tab.
                captureImages: false,
                resolveTarget: null,
                transcribe: captureTranscriber(
                    lightdashApi,
                    projectUuid,
                    voiceTranscriptionAvailable,
                ),
                onCapture: (result) => void handleCaptureRef.current(result),
            }),
            [lightdashApi, projectUuid, voiceTranscriptionAvailable],
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
