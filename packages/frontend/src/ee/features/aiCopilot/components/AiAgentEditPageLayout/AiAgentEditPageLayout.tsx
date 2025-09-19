import { Box, Container } from '@mantine-8/core';
import { useElementSize, useHeadroom } from '@mantine-8/hooks';
import {
    forwardRef,
    useCallback,
    useState,
    type FC,
    type PropsWithChildren,
} from 'react';
import { NAVBAR_HEIGHT } from '../../../../../components/common/Page/constants';
import styles from './AiAgentEditPageLayout.module.css';

const AiAgentHeader = forwardRef<HTMLDivElement, PropsWithChildren>(
    ({ children }, ref) => {
        const [fixed, setFixed] = useState(true);
        const handleFix = useCallback(() => setFixed(true), []);
        const handlePin = useCallback(() => setFixed(false), []);

        const pinned = useHeadroom({
            fixedAt: 10,
            onFix: handleFix,
            onPin: handlePin,
        });

        return (
            <Box
                ref={ref}
                className={styles.aiAgentEditPageLayoutHeader}
                data-pinned={pinned}
                data-fixed={fixed}
                style={{ top: NAVBAR_HEIGHT }}
            >
                <Container py="sm" maw="75%">
                    {children}
                </Container>
            </Box>
        );
    },
);

type Props = {
    children: React.ReactNode;
    header?: React.ReactNode;
};
export const AiAgentEditPageLayout: FC<Props> = ({ header, children }) => {
    const headerElement = useElementSize();

    return (
        <Container pb="xxl" maw="75%">
            {header && (
                <AiAgentHeader ref={headerElement.ref}>{header}</AiAgentHeader>
            )}
            <Box mt={header ? headerElement.height : 0}>{children}</Box>
        </Container>
    );
};
