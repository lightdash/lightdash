import { Box, Button } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import ReactJson from 'react-json-view';
import { useProjectCompileLogByJob } from '../../hooks/useProjectCompileLogs';
import { useRjvTheme } from '../../hooks/useRjvTheme';
import MantineIcon from '../common/MantineIcon';
import { CollapsablePaper } from './../common/CollapsablePaper';

type ProjectCompileLogProps = {
    projectUuid: string;
    jobUuid: string;
};

const ProjectCompileLog: FC<ProjectCompileLogProps> = ({
    projectUuid,
    jobUuid,
}) => {
    const { t } = useTranslation('projectConnection');
    const { data: compileLog } = useProjectCompileLogByJob({
        projectUuid,
        jobUuid,
    });
    const theme = useRjvTheme();

    if (!compileLog) {
        return null;
    }

    return (
        <CollapsablePaper
            title={t('jobDetails.compilationLog')}
            rightAction={
                <Button
                    variant="subtle"
                    color="gray"
                    size="compact-xs"
                    rightSection={<MantineIcon icon={IconExternalLink} />}
                    component="a"
                    target="_blank"
                    href={`/generalSettings/projectManagement/${projectUuid}/compilationHistory`}
                >
                    {t('jobDetails.seeHistory')}
                </Button>
            }
        >
            <Box>
                <ReactJson
                    theme={theme}
                    style={{ fontSize: '12px' }}
                    src={compileLog}
                    enableClipboard={true}
                    displayDataTypes={false}
                    collapsed={2}
                />
            </Box>
        </CollapsablePaper>
    );
};

export default ProjectCompileLog;
