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
import { lightdashApi } from '../../api';

type SupportDrawerContentProps = {
    // Add props here
};

const SupportDrawerContent: FC<SupportDrawerContentProps> = () => {
    const [includeImage, setIncludeImage] = useState(true);
    const [moreDetails, setMoreDetails] = useState('');
    const [allowAccess, setAllowAccess] = useState(true);

    const [screenshot, setScreenshot] = useState<string | null>(null);

    useEffect(() => {
        const element = document.querySelector('#root');
        console.log('screenshot element', element);
        if (element)
            void html2canvas(element as HTMLElement).then((canvas) => {
                const base64 = canvas.toDataURL('image/png');
                setScreenshot(base64);
            });
    }, []);

    const handleShare = useCallback(async () => {
        await lightdashApi<null>({
            url: `/slack/share-support`,
            method: 'POST',
            body: JSON.stringify({
                image: screenshot,
            }),
        });
    }, [screenshot]);

    return (
        <Stack spacing="xs">
            <Text>Share details about your issue with Lightdash support.</Text>
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
                Do you have and other details you'd like to share? For example:
                What were you trying to do when the error occurred? Has this
                error happened before? Is anyone else in your team experiencing
                the same error?
            </Text>
            <Textarea
                placeholder="Enter more details"
                value={moreDetails}
                onChange={(event) => setMoreDetails(event.target.value)}
                minRows={4}
            />
            <Checkbox
                label="Allow Lightdash support to investigate on your instance"
                checked={allowAccess}
                onChange={(event) => setAllowAccess(event.target.checked)}
                mt="xs"
            />
            <Text size="xs" color="dimmed">
                By ticking this box, you agree to enable Lightdash Support
                access to your organization for 12 hours.
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
