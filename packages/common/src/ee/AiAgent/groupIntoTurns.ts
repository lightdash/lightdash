import assertUnreachable from '../../utils/assertUnreachable';

export type TurnGroupingMessage = {
    role: 'user' | 'assistant' | 'compaction';
    metadata: { hidden: boolean };
};

type UserMessage<T extends TurnGroupingMessage> = T & { role: 'user' };
type AssistantMessage<T extends TurnGroupingMessage> = T & {
    role: 'assistant';
};

const isUserMessage = <T extends TurnGroupingMessage>(
    message: T,
): message is UserMessage<T> => message.role === 'user';

const isAssistantMessage = <T extends TurnGroupingMessage>(
    message: T,
): message is AssistantMessage<T> => message.role === 'assistant';

export type AiTurnGroup<T extends TurnGroupingMessage> = {
    userMessage: UserMessage<T>;
    assistantMessage: AssistantMessage<T> | null;
    steerMessages: UserMessage<T>[];
};

const appendPendingUserTurns = <T extends TurnGroupingMessage>(
    turns: AiTurnGroup<T>[],
    pendingUsers: UserMessage<T>[],
) => {
    pendingUsers.forEach((userMessage) => {
        turns.push({
            userMessage,
            assistantMessage: null,
            steerMessages: [],
        });
    });
};

export const groupIntoTurns = <T extends TurnGroupingMessage>(
    messages: T[],
): AiTurnGroup<T>[] => {
    const turns: AiTurnGroup<T>[] = [];
    let pendingUsers: UserMessage<T>[] = [];

    messages.forEach((message) => {
        switch (message.role) {
            case 'compaction':
                return;
            case 'user':
                if (isUserMessage(message)) pendingUsers.push(message);
                return;
            case 'assistant': {
                if (!isAssistantMessage(message)) return;
                // Earlier pending users are steers for the previous active turn.
                const userMessage = pendingUsers.pop();
                if (userMessage === undefined) return;
                const previousTurn = turns.at(-1);
                if (previousTurn !== undefined) {
                    previousTurn.steerMessages.push(...pendingUsers);
                } else {
                    appendPendingUserTurns(turns, pendingUsers);
                }
                turns.push({
                    userMessage,
                    assistantMessage: message,
                    steerMessages: [],
                });
                pendingUsers = [];
                return;
            }
            default:
                assertUnreachable(message.role, 'Unknown message role');
        }
    });

    const lastTurn = turns.at(-1);
    if (lastTurn !== undefined) {
        lastTurn.steerMessages.push(...pendingUsers);
    } else {
        appendPendingUserTurns(turns, pendingUsers);
    }

    return turns
        .filter((turn) =>
            turn.assistantMessage !== null
                ? !turn.assistantMessage.metadata.hidden
                : !turn.userMessage.metadata.hidden,
        )
        .map((turn) => ({
            ...turn,
            steerMessages: turn.steerMessages.filter(
                (steer) => !steer.metadata.hidden,
            ),
        }));
};
