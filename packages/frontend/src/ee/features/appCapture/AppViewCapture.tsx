import {
    forwardRef,
    useCallback,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
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
import FollowUpMicButton from '../dashboardCapture/FollowUpMicButton';
import { useSendCaptureToAgent } from '../dashboardCapture/useSendCaptureToAgent';

type Props = {
    projectUuid: string;
    /** The app to attach to the message, or null to send text only. */
    attachedAppUuid: string | null;
    appName: string;
    /** The app's frame: the part of the page that can be drawn on. */
    getRegion: () => DOMRect;
    onRecordingChange: (isRecording: boolean) => void;
};

/** Voice Design on a published app: the recording becomes one agent thread. */
const AppViewCapture = forwardRef<CaptureHostHandle, Props>(
    (
        { projectUuid, attachedAppUuid, appName, getRegion, onRecordingChange },
        ref,
    ) => {
        const { showToastInfo, showToastError } = useToaster();
        const { send: sendToAgent } = useSendCaptureToAgent(projectUuid);
        const hostRef = useRef<CaptureHostHandle>(null);
        // Whether the recording was started from the open conversation's mic.
        const followUpRef = useRef(false);
        const [isRecording, setIsRecording] = useState(false);
        // The page's own mic and hotkey always start a new conversation.
        useImperativeHandle(
            ref,
            () => ({
                start: () => {
                    followUpRef.current = false;
                    hostRef.current?.start();
                },
                toggle: () => {
                    followUpRef.current = false;
                    hostRef.current?.toggle();
                },
            }),
            [],
        );

        const handleCapture = useCallback(
            async (result: CaptureResult) => {
                const followUp = followUpRef.current;
                followUpRef.current = false;
                showToastInfo({ title: 'Sending your questions to the agent' });
                try {
                    await sendToAgent({
                        followUp,
                        buildPrompt: (hasImages) =>
                            buildAppCapturePrompt({
                                appName,
                                summary: result.summary,
                                hasImages,
                            }),
                        images: result.images,
                        context: attachedAppUuid
                            ? [{ type: 'data_app', appUuid: attachedAppUuid }]
                            : [],
                    });
                } catch {
                    showToastError({
                        title: 'Could not send your questions to the agent',
                    });
                }
            },
            [
                appName,
                attachedAppUuid,
                sendToAgent,
                showToastError,
                showToastInfo,
            ],
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

        const handleRecordingChange = useCallback(
            (recording: boolean) => {
                setIsRecording(recording);
                onRecordingChange(recording);
            },
            [onRecordingChange],
        );

        return (
            <>
                <CaptureHost
                    ref={hostRef}
                    surface={surface}
                    onRecordingChange={handleRecordingChange}
                />
                <FollowUpMicButton
                    hidden={isRecording}
                    onClick={() => {
                        followUpRef.current = true;
                        hostRef.current?.start();
                    }}
                />
            </>
        );
    },
);

export default AppViewCapture;
