/**
 * The Error object is returned from the api any time there is an error.
 * The message contains
 */
export type ApiErrorPayload = {
    status: 'error';
    error: {
        /**
         * HTTP status code
         * @format integer
         */
        statusCode: number;
        /**
         * Unique name for the type of error
         */
        name: string;
        /**
         * A friendly message summarising the error
         */
        message?: string;
        /**
         * Optional data containing details of the error
         */
        data?: any;
    };
};
