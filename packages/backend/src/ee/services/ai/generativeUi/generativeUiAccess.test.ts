import { ForbiddenError } from '@lightdash/common';
import { assertGenerativeUiAvailable } from './generativeUiAccess';

const checkers = (copilot: boolean, generativeUi: boolean) => ({
    isCopilotEnabled: vi.fn(async () => copilot),
    isGenerativeUiEnabled: vi.fn(async () => generativeUi),
});

describe('assertGenerativeUiAvailable', () => {
    it('rejects when Copilot is off, without checking the flag', async () => {
        const access = checkers(false, true);

        await expect(assertGenerativeUiAvailable(access)).rejects.toEqual(
            new ForbiddenError('Copilot is not enabled'),
        );
        expect(access.isGenerativeUiEnabled).not.toHaveBeenCalled();
    });

    it('rejects when the generative UI flag is off', async () => {
        await expect(
            assertGenerativeUiAvailable(checkers(true, false)),
        ).rejects.toEqual(new ForbiddenError('Generative UI is not enabled'));
    });

    it('allows the request when both are on', async () => {
        await expect(
            assertGenerativeUiAvailable(checkers(true, true)),
        ).resolves.toBeUndefined();
    });
});
