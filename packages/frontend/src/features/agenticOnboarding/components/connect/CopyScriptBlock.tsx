import { ActionIcon, Code, CopyButton, Group, Tooltip } from '@mantine-8/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import styles from './CopyScriptBlock.module.css';

type CopyScriptBlockProps = {
    script: string;
    'aria-label'?: string;
};

const CopyScriptBlock: FC<CopyScriptBlockProps> = ({
    script,
    'aria-label': ariaLabel,
}) => (
    <Group gap="xs" align="flex-start" wrap="nowrap" className={styles.wrapper}>
        <Code block className={styles.code} aria-label={ariaLabel}>
            {script}
        </Code>
        <CopyButton value={script}>
            {({ copied, copy }) => (
                <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow>
                    <ActionIcon
                        variant="subtle"
                        color={copied ? 'green' : 'gray'}
                        onClick={copy}
                        aria-label="Copy script"
                    >
                        <MantineIcon icon={copied ? IconCheck : IconCopy} />
                    </ActionIcon>
                </Tooltip>
            )}
        </CopyButton>
    </Group>
);

export default CopyScriptBlock;
