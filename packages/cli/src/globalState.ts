import ora from 'ora';
import * as styles from './styles';

type RememberPromptAnswer = {
    useFallbackDbtVersion?: boolean;
};

class GlobalState {
    private verbose: boolean = false;

    private activeSpinner: ora.Ora | undefined;

    private savedPromptAnswers: RememberPromptAnswer;

    constructor() {
        this.savedPromptAnswers = {};
    }

    getActiveSpinner() {
        return this.activeSpinner;
    }

    startSpinner(options?: ora.Options | string): ora.Ora {
        this.activeSpinner = ora(options);
        this.activeSpinner.start();
        return this.activeSpinner;
    }

    log(message: unknown, ...optionalParams: unknown[]) {
        const spinner = this.getActiveSpinner();
        const shouldRestartSpinner = spinner?.isSpinning;
        spinner?.stop();
        console.error(message, ...optionalParams);
        if (shouldRestartSpinner) {
            spinner?.start();
        }
    }

    setVerbose(verbose: boolean) {
        this.verbose = verbose;
    }

    getSavedPromptAnswer<T extends keyof RememberPromptAnswer>(
        prompt: T,
    ): RememberPromptAnswer[T] | undefined {
        return this.savedPromptAnswers[prompt];
    }

    savePromptAnswer<T extends keyof RememberPromptAnswer>(
        prompt: T,
        value: RememberPromptAnswer[T],
    ) {
        this.savedPromptAnswers[prompt] = value;
    }

    debug(message: string) {
        if (this.verbose) {
            this.log(styles.debug(message));
        }
    }
}

export default new GlobalState();
