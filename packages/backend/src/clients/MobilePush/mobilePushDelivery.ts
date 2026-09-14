export type MobilePushDeliveryResult =
    | { status: 'sent' }
    | { status: 'invalid_token'; reason: string | undefined }
    | { status: 'retryable'; reason: string | undefined }
    | { status: 'failed'; reason: string | undefined };
