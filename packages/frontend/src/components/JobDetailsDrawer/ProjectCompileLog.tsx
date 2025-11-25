import { Box, Button } from '@mantine-8/core';
import { IconExternalLink } from '@tabler/icons-react';
import { type FC } from 'react';
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
            title="Compilation log"
            rightAction={
                <Button
                    variant="subtle"
                    color="gray"
                    size="compact-xs"
                    rightSection={<MantineIcon icon={IconExternalLink} />}
                    component="a"
                    target="_blank"
                    href={`/generalSettings/${projectUuid}/compilationHistory`}
                >
                    See history
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
