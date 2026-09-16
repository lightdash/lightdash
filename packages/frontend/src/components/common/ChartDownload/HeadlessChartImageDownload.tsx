import { isApiError, type ApiExportChartImageRequest } from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { lightdashApiStream } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import MantineIcon from '../MantineIcon';

type Props = {
    chartUuid: string;
    projectUuid: string;
    dashboardContext?: ApiExportChartImageRequest;
};

/** Downloads a saved custom chart through the server-side headless renderer. */
const HeadlessChartImageDownload: FC<Props> = ({
    chartUuid,
    projectUuid,
    dashboardContext,
}) => {
    const [isExporting, setIsExporting] = useState(false);
    const { showToastApiError, showToastError } = useToaster();

    const handleDownload = async () => {
        setIsExporting(true);
        try {
            const image = await lightdashApiStream({
                url: `/saved/${chartUuid}/export-image?projectUuid=${projectUuid}`,
                method: 'POST',
                body: dashboardContext
                    ? JSON.stringify(dashboardContext)
                    : undefined,
            });
            const objectUrl = URL.createObjectURL(await image.blob());
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = 'chart.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(objectUrl);
        } catch (error) {
            if (isApiError(error)) {
                showToastApiError({
                    title: 'Unable to export chart image',
                    apiError: error.error,
                });
            } else {
                showToastError({
                    title: 'Unable to export chart image',
                    subtitle:
                        error instanceof Error
                            ? error.message
                            : 'Please try again.',
                });
            }
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Button
            leftSection={<MantineIcon icon={IconDownload} />}
            loading={isExporting}
            onClick={handleDownload}
            variant="light"
            fullWidth
        >
            Download image
        </Button>
    );
};

export default HeadlessChartImageDownload;
