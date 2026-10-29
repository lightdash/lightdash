import {
    AbortMultipartUploadCommand,
    CreateMultipartUploadCommand,
    type S3,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

/** Cancel SDK requests, then await the uploader's actual settlement.
 * Upload.abort()/its abortController race done() against cancellation, which can
 * return while requests still run. Passing the signal to each send avoids that.
 */
export const uploadUsageParquet = async (
    options: ConstructorParameters<typeof Upload>[0] & { client: S3 },
    signal?: AbortSignal,
): Promise<void> => {
    signal?.throwIfAborted();
    let uploadId: string | undefined;
    const client = signal
        ? new Proxy(options.client, {
              get(target, property, receiver) {
                  if (property === 'send') {
                      return async (command: Parameters<S3['send']>[0]) => {
                          const result = await target.send(command, {
                              // Cleanup is allowed after cancellation; it cannot
                              // publish an object and must not leave multipart data.
                              abortSignal:
                                  command instanceof AbortMultipartUploadCommand
                                      ? AbortSignal.timeout(10_000)
                                      : signal,
                              ...(command instanceof AbortMultipartUploadCommand
                                  ? { requestTimeout: 10_000 }
                                  : {}),
                          });
                          if (command instanceof CreateMultipartUploadCommand) {
                              uploadId = (result as { UploadId?: string })
                                  .UploadId;
                          }
                          return result;
                      };
                  }
                  return Reflect.get(target, property, receiver);
              },
          })
        : options.client;
    try {
        await new Upload({ ...options, client }).done();
        signal?.throwIfAborted();
    } catch (error) {
        // lib-storage does not clean up a canceled CompleteMultipartUpload call.
        // Aborting an already completed/aborted upload is harmless; keep the
        // original failure if cleanup itself fails.
        if (signal?.aborted && uploadId) {
            await options.client
                .send(
                    new AbortMultipartUploadCommand({
                        Bucket: options.params.Bucket,
                        Key: options.params.Key,
                        UploadId: uploadId,
                    }),
                    {
                        requestTimeout: 10_000,
                        abortSignal: AbortSignal.timeout(10_000),
                    },
                )
                .catch(() => undefined);
        }
        throw error;
    }
};
