import {
    AiIdentityJobKind,
    AiIdentityJobStatus,
    type AiIdentityJob,
} from '@lightdash/common';
import { Anchor, List, Text } from '@mantine/core';
import { useEffect, useRef, type FC } from 'react';
import Callout from '../../components/common/Callout';

export const AiIdentityJobCallout: FC<{ job: AiIdentityJob | undefined }> = ({
    job,
}) => {
    const downloadedJob = useRef<string | null>(null);

    useEffect(() => {
        if (
            job?.status !== AiIdentityJobStatus.DONE ||
            !job.fileUrl ||
            downloadedJob.current === job.jobUuid
        ) {
            return;
        }
        downloadedJob.current = job.jobUuid;
        const link = document.createElement('a');
        link.href = job.fileUrl;
        link.download = '';
        link.click();
    }, [job]);

    if (!job) return null;
    if (job.status === AiIdentityJobStatus.FAILED) {
        return (
            <Callout variant="danger">{job.error ?? 'The job failed.'}</Callout>
        );
    }
    if (job.status === AiIdentityJobStatus.DONE) {
        return <CompletedJob job={job} />;
    }
    return job.total > 0 ? (
        <Callout variant="info">
            {job.kind === AiIdentityJobKind.PROVISION
                ? 'Provisioning'
                : job.kind === AiIdentityJobKind.EXPORT
                  ? 'Exporting'
                  : 'Checking'}{' '}
            {job.done} of {job.total}…
        </Callout>
    ) : job.kind === AiIdentityJobKind.PROVISION ? (
        <Callout variant="info">Provisioning is queued…</Callout>
    ) : null;
};

const CompletedJob: FC<{ job: AiIdentityJob }> = ({ job }) => {
    if (job.fileUrl && job.skipped?.length)
        return (
            <Callout variant="warning">
                <Text fz="sm">
                    Export ready.{' '}
                    <Anchor href={job.fileUrl}>Download file</Anchor>.{' '}
                    {job.skipped.length === 1
                        ? '1 person is not in the file:'
                        : `${job.skipped.length} people are not in the file:`}
                </Text>
                <List size="sm" mt={4}>
                    {job.skipped.map(({ email, reason }) => (
                        <List.Item key={email}>
                            {email}: {reason}
                        </List.Item>
                    ))}
                </List>
            </Callout>
        );
    if (job.kind === AiIdentityJobKind.PROVISION)
        return (
            <Callout variant="success">
                Provisioning complete. See the request log for each statement.
            </Callout>
        );
    return job.fileUrl ? (
        <Callout variant="success">
            Export ready. <Anchor href={job.fileUrl}>Download file</Anchor>
        </Callout>
    ) : null;
};
