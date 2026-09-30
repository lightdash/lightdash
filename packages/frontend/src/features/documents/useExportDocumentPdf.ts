import {
    formatDate,
    type ApiError,
    type ApiJobScheduledResponse,
    type Document,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../api';
import useToaster from '../../hooks/toaster/useToaster';
import { pollJobStatus } from '../scheduler/hooks/useScheduler';

const TOAST_KEY = 'document_pdf_export_toast';

type DocumentPdfExportDetails = {
    url?: string;
    numFailures?: number;
};

const downloadFile = (url: string, fileName: string) => {
    const link = window.document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    window.document.body.appendChild(link);
    link.click();
    link.remove();
};

/** Queues a PDF of the Document, waits for the job, then downloads the file. */
export const useExportDocumentPdf = () => {
    const {
        showToastInfo,
        showToastSuccess,
        showToastWarning,
        showToastError,
        showToastApiError,
    } = useToaster();
    return useMutation<ApiJobScheduledResponse['results'], ApiError, Document>(
        (document) =>
            lightdashApi<ApiJobScheduledResponse['results']>({
                url: `/projects/${document.projectUuid}/documents/${document.documentUuid}/exports/pdf`,
                method: 'POST',
                body: undefined,
            }),
        {
            mutationKey: ['export_document_pdf'],
            onMutate: (document) => {
                showToastInfo({
                    key: TOAST_KEY,
                    title: `${document.name} is being exported. This might take a few seconds.`,
                    autoClose: false,
                    loading: true,
                });
            },
            onSuccess: (job, document) => {
                pollJobStatus(job.jobId, document.projectUuid)
                    .then((rawDetails) => {
                        const details =
                            rawDetails as DocumentPdfExportDetails | null;
                        if (!details?.url) {
                            showToastError({
                                key: TOAST_KEY,
                                title: `Missing file url for ${document.name}`,
                                subtitle: 'Something went wrong',
                            });
                            return;
                        }
                        downloadFile(
                            details.url,
                            `${document.name}-${formatDate(Date.now())}.pdf`,
                        );
                        const numFailures = Number(details.numFailures ?? 0);
                        if (numFailures > 0) {
                            showToastWarning({
                                key: TOAST_KEY,
                                title: `${document.name} was exported with ${numFailures} failed chart(s).`,
                                subtitle:
                                    'Charts that could not load show an error in the PDF.',
                            });
                        } else {
                            showToastSuccess({
                                key: TOAST_KEY,
                                title: `Success! ${document.name} was exported.`,
                            });
                        }
                    })
                    .catch((error: Error) => {
                        showToastError({
                            key: TOAST_KEY,
                            title: `Failed to export ${document.name}`,
                            subtitle: error.message,
                        });
                    });
            },
            onError: ({ error }, document) => {
                showToastApiError({
                    key: TOAST_KEY,
                    title: `Failed to export ${document.name}`,
                    apiError: error,
                });
            },
        },
    );
};
