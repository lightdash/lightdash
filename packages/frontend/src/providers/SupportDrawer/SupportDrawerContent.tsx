import { type AnyType } from '@lightdash/common';
import {
    Button,
    Center,
    Checkbox,
    Image,
    Loader,
    Stack,
    Text,
    Textarea,
} from '@mantine/core';
import html2canvas from 'html2canvas';
import { useCallback, useEffect, useState, type FC } from 'react';
import { lightdashApi, networkHistory } from '../../api';

type SupportDrawerContentProps = {
    // Add props here
};

let logHistory: AnyType[] = [];

/** This method will capture all the logs, and store it on memory
 * they will be shared when the user clicks on the share button
 * We only store the last 50 logs
 */
(function () {
    // const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    function storeAndLog(type: AnyType, args: AnyType) {
        const message = { type, args, timestamp: new Date().toISOString() };
        logHistory.push(message);
        if (logHistory.length > 50) logHistory.shift(); // keep last 50
    }
    /*
  console.log = function(...args) {
    storeAndLog('log', args);
    originalLog.apply(console, args);
  };
*/
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

    useEffect(() => {
        const element = document.querySelector('body');
        console.log('screenshot element', element);
        if (element)
            void html2canvas(element as HTMLElement).then((canvas) => {
                const base64 = canvas.toDataURL('image/png');
                setScreenshot(base64);
            });
    }, []);

    const handleShare = useCallback(async () => {
        //  console.debug('returned logs', logHistory);
        // console.debug('returned networkHistory', networkHistory);

        const body = JSON.stringify({
            image: includeImage ? screenshot : undefined,
            logs: JSON.stringify(logHistory),
            network: JSON.stringify(networkHistory),
            canImpersonate: allowAccess,
            description: moreDetails,
        });
        await lightdashApi<null>({
            url: `/slack/share-support`,
            method: 'POST',
            body,
        });
    }, [screenshot, includeImage, moreDetails, allowAccess]);

    return (
        <Stack spacing="xs">
            <Checkbox
                label="Include this image"
                checked={includeImage}
                onChange={(event) => setIncludeImage(event.target.checked)}
                mt="xs"
            />
            {screenshot ? (
                <Image
                    height={200}
                    src={screenshot}
                    alt="Screenshot"
                    fit="contain"
                />
            ) : (
                <Center>
                    <Loader height={200} w="100%" variant="dots" />
                </Center>
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
