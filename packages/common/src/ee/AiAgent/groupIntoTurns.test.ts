import { groupIntoTurns, type TurnGroupingMessage } from './groupIntoTurns';

type Message = TurnGroupingMessage & { uuid: string };

const message = (
    uuid: string,
    role: Message['role'],
    hidden = false,
): Message => ({ uuid, role, metadata: { hidden } });

describe('groupIntoTurns', () => {
    it('attaches steers and omits hidden assistant turns', () => {
        const firstUser = message('first-user', 'user');
        const firstAssistant = message('first-assistant', 'assistant');
        const firstSteer = message('first-steer', 'user');
        const secondSteer = message('second-steer', 'user');
        const hiddenUser = message('hidden-user', 'user', true);
        const hiddenAssistant = message('hidden-assistant', 'assistant', true);
        const secondUser = message('second-user', 'user');
        const secondAssistant = message('second-assistant', 'assistant');

        expect(
            groupIntoTurns([
                firstUser,
                firstAssistant,
                firstSteer,
                secondSteer,
                hiddenUser,
                hiddenAssistant,
                secondUser,
                secondAssistant,
            ]),
        ).toEqual([
            {
                userMessage: firstUser,
                assistantMessage: firstAssistant,
                steerMessages: [firstSteer, secondSteer],
            },
            {
                userMessage: secondUser,
                assistantMessage: secondAssistant,
                steerMessages: [],
            },
        ]);
    });

    it('keeps a visible assistant reply when its user message is hidden', () => {
        const hiddenUser = message('hidden-user', 'user', true);
        const assistant = message('assistant', 'assistant');

        expect(groupIntoTurns([hiddenUser, assistant])).toEqual([
            {
                userMessage: hiddenUser,
                assistantMessage: assistant,
                steerMessages: [],
            },
        ]);
    });

    it('attaches trailing user messages to the active turn', () => {
        const firstUser = message('first-user', 'user');
        const activeAssistant = message('active-assistant', 'assistant');
        const activeSteer = message('active-steer', 'user');

        expect(
            groupIntoTurns([firstUser, activeAssistant, activeSteer]),
        ).toEqual([
            {
                userMessage: firstUser,
                assistantMessage: activeAssistant,
                steerMessages: [activeSteer],
            },
        ]);
    });

    it('preserves initial user messages before the answered turn', () => {
        const contextMessage = message('context', 'user');
        const userMessage = message('user', 'user');
        const assistantMessage = message('assistant', 'assistant');

        expect(
            groupIntoTurns([contextMessage, userMessage, assistantMessage]),
        ).toEqual([
            {
                userMessage: contextMessage,
                assistantMessage: null,
                steerMessages: [],
            },
            {
                userMessage,
                assistantMessage,
                steerMessages: [],
            },
        ]);
    });

    it('ignores assistant messages without a preceding user message', () => {
        expect(groupIntoTurns([message('assistant', 'assistant')])).toEqual([]);
    });
});
