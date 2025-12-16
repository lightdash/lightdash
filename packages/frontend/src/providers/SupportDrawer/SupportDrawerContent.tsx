import { type AnyType } from '@lightdash/common';
import {
    Button,
    Checkbox,
    Image,
    Loader,
    Paper,
    Stack,
    Text,
    Textarea,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconIdOff } from '@tabler/icons-react';
import html2canvas from 'html2canvas-pro';
import { useCallback, useEffect, useState, type FC } from 'react';
import { lightdashApi, networkHistory } from '../../api';
import MantineIcon from '../../components/common/MantineIcon';
import useToaster from '../../hooks/toaster/useToaster';

type SupportDrawerContentProps = {
    // Add props here
};

const MAX_LOG_LENGTH = 10;
let logHistory: AnyType[] = [];

/** This method will capture all the logs, and store it on memory
 * they will be shared when the user clicks on the share button
 * We only store the last 50 logs
 */
(function () {
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    function storeAndLog(type: AnyType, args: AnyType) {
        const message = {
            type,
            args: JSON.stringify(args).substring(0, 500),
            timestamp: new Date().toISOString(),
        };
        logHistory.push(message);
        if (logHistory.length > MAX_LOG_LENGTH) logHistory.shift(); // keep last 50
    }

    console.error = function (...args) {
        storeAndLog('error', args);
        originalError.apply(console, args);
    };

    console.warn = function (...args) {
        storeAndLog('warn', args);
        originalWarn.apply(console, args);
    };

    console.info = function (...args) {
        storeAndLog('info', args);
        originalInfo.apply(console, args);
    };
})();

const SupportDrawerContent: FC<SupportDrawerContentProps> = () => {
    const [includeImage, setIncludeImage] = useState(true);
    const [moreDetails, setMoreDetails] = useState('');
    const [allowAccess, setAllowAccess] = useState(true);

    const [screenshot, setScreenshot] = useState<string | null>(null);
    const [screenshotError, setScreenshotError] = useState(false);
    const { showToastSuccess } = useToaster();
    useEffect(() => {
        const element = document.querySelector('body');
        if (element) {
            void html2canvas(element as HTMLElement)
                .then((canvas) => {
                    const base64 = canvas.toDataURL('image/png');
                    setScreenshot(base64);
                })
                .catch((error) => {
                    console.error(
                        'Failed to capture screenshot:',
                        error.message,
                    );
                    setScreenshotError(true);
                    setScreenshot(null);
                });
        }
    }, []);

    const handleShare = useCallback(async () => {
        const body = JSON.stringify({
            image: includeImage ? screenshot : undefined,
            logs: JSON.stringify(logHistory).substring(0, 5000),
            network: JSON.stringify(networkHistory).substring(0, 5000), //Limit to 5000 chars to avoid "Payload too large"
            canImpersonate: allowAccess,
            description: moreDetails.substring(0, 5000),
        });
        void lightdashApi<null>({
            url: `/support/share`,
            method: 'POST',
            body,
        }).then(() => {
            showToastSuccess({
                title: 'Success',
                subtitle: 'Support request sent successfully',
            });
        });
        modals.closeAll();
    }, [includeImage, screenshot, allowAccess, moreDetails, showToastSuccess]);

    return (
        <Stack spacing="xs">
            <Checkbox
                label="Include this image"
                checked={screenshotError ? false : includeImage}
                onChange={(event) => setIncludeImage(event.target.checked)}
                mt="xs"
                disabled={screenshotError}
            />

            {screenshot ? (
                <Image
                    height={200}
                    src={screenshot}
                    alt="Screenshot"
                    fit="contain"
                />
            ) : (
                <Paper p="lg" withBorder h={200}>
                    <Stack
                        h="100%"
                        align="center"
                        justify="center"
                        spacing="xs"
                    >
                        {screenshotError ? (
                            <>
                                <MantineIcon icon={IconIdOff} color="ldGray" />
                                <Text color="dimmed" ta="center">
                                    Screenshot could not be captured. You can
                                    still submit your report with the details
                                    below
                                </Text>
                            </>
                        ) : (
                            <Loader height={200} w="100%" variant="dots" />
                        )}
                    </Stack>
                </Paper>
            )}
            <Text mt="sm">
                Do you have and other details you'd like to share?
            </Text>
            <Textarea
                placeholder="Enter more details"
                value={moreDetails}
                onChange={(event) => setMoreDetails(event.target.value)}
                minRows={4}
            />
            <Checkbox
                label="Allow Lightdash support access to your instance"
                checked={allowAccess}
                onChange={(event) => setAllowAccess(event.target.checked)}
                mt="xs"
            />
            <Text size="xs" color="dimmed">
                By ticking this box, you agree to give Lightdash Support access
                to your organization for 12 hours to investigate this issue.
            </Text>

            <Text size="xs" color="dimmed">
                We will also share your Lightdash logs and your recent network
                requests to help us investigate this issue.
            </Text>
            <Button
                mt="xs"
                style={{ alignSelf: 'flex-end' }}
                onClick={handleShare}
            >
                Share
            </Button>
        </Stack>
    );
};

export default SupportDrawerContent;
