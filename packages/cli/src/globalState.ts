import ora from 'ora';

class GlobalState {
    private activeSpinner: ora.Ora | undefined;

    getActiveSpinner() {
        return this.activeSpinner;
    }

    setActiveSpinner(value: ora.Ora | undefined) {
        this.activeSpinner = value;
    }
}

export default new GlobalState();
