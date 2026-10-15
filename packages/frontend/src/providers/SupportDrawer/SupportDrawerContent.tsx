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
import { useTranslation } from 'react-i18next';
import { lightdashApi, networkHistory } from '../../api';
import MantineIcon from '../../components/common/MantineIcon';
import useToaster from '../../hooks/toaster/useToaster';
import classes from './SupportDrawerContent.module.css';

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
    const { t } = useTranslation('app');
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
                title: t('supportDrawer.success'),
                subtitle: t('supportDrawer.sent'),
            });
        });
        modals.closeAll();
    }, [
        includeImage,
        screenshot,
        allowAccess,
        moreDetails,
        showToastSuccess,
        t,
    ]);

    return (
        <Stack gap="xs">
            <Checkbox
                label={t('supportDrawer.includeImage')}
                checked={screenshotError ? false : includeImage}
                onChange={(event) => setIncludeImage(event.target.checked)}
                mt="xs"
                disabled={screenshotError}
            />

            {screenshot ? (
                <Image
                    height={200}
                    src={screenshot}
                    alt={t('supportDrawer.screenshot')}
                    fit="contain"
                />
            ) : (
                <Paper p="lg" h={200}>
                    <Stack h="100%" align="center" justify="center" gap="xs">
                        {screenshotError ? (
                            <>
                                <MantineIcon icon={IconIdOff} color="ldGray" />
                                <Text c="dimmed" ta="center">
                                    {t('supportDrawer.screenshotFailed')}
                                </Text>
                            </>
                        ) : (
                            <Loader height={200} w="100%" type="dots" />
                        )}
                    </Stack>
                </Paper>
            )}
            <Text mt="sm">{t('supportDrawer.moreDetails')}</Text>
            <Textarea
                placeholder={t('supportDrawer.moreDetailsPlaceholder')}
                value={moreDetails}
                onChange={(event) => setMoreDetails(event.target.value)}
                minRows={4}
            />
            <Checkbox
                label={t('supportDrawer.allowAccess')}
                checked={allowAccess}
                onChange={(event) => setAllowAccess(event.target.checked)}
                mt="xs"
            />
            <Text size="xs" c="dimmed">
                {t('supportDrawer.accessAgreement')}
            </Text>

            <Text size="xs" c="dimmed">
                {t('supportDrawer.logsNote')}
            </Text>
            <Button
                mt="xs"
                className={classes.submitButton}
                onClick={handleShare}
            >
                {t('supportDrawer.share')}
            </Button>
        </Stack>
    );
};

export default SupportDrawerContent;
