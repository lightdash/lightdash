import { CloseButton, Text } from '@mantine/core';
import { IconColumns, IconTable } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { type StudioChatRef } from '../../../../../features/semanticStudio/studioChatRefs';
import classes from './SemanticStudioAgent.module.css';

/** What the next message is about, dragged in or added from a field. */
export const StudioChatRefChips: FC<{
    refs: StudioChatRef[];
    onRemove: (ref: StudioChatRef) => void;
}> = ({ refs, onRemove }) =>
    refs.length === 0 ? null : (
        <div
            className={classes.refChips}
            aria-label="Added to the next message"
        >
            {refs.map((ref) => {
                const name = ref.fieldLabel ?? ref.modelLabel;
                return (
                    <span
                        key={`${ref.modelName}:${ref.fieldName ?? ''}`}
                        className={classes.refChip}
                    >
                        <MantineIcon
                            icon={ref.fieldName ? IconColumns : IconTable}
                            size={12}
                        />
                        {ref.fieldLabel ? (
                            <Text component="span" className={classes.refModel}>
                                {ref.modelLabel}
                            </Text>
                        ) : null}
                        <Text component="span" className={classes.refName}>
                            {name}
                        </Text>
                        <CloseButton
                            size="xs"
                            aria-label={`Remove ${name}`}
                            onClick={() => onRemove(ref)}
                        />
                    </span>
                );
            })}
        </div>
    );
