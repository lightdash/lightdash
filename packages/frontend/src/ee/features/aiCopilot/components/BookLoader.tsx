import { Box, type BoxProps } from '@mantine-8/core';
import styles from './AiAgentKnowledgeFilesSection.module.css';

export const BookLoader = (props: BoxProps) => (
    <Box role="status" aria-label="Loading" className={styles.book} {...props}>
        <div className={styles.bookShadow} />
        <div className={styles.bookPg} />
        <div className={`${styles.bookPg} ${styles.bookPg2}`} />
        <div className={`${styles.bookPg} ${styles.bookPg3}`} />
        <div className={`${styles.bookPg} ${styles.bookPg4}`} />
        <div className={`${styles.bookPg} ${styles.bookPg5}`} />
    </Box>
);
