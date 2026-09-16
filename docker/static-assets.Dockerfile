ARG RELEASE_IMAGE=scratch
FROM ${RELEASE_IMAGE} AS release

FROM scratch
# Copy the published bytes, including Sentry debug IDs, without rebuilding them.
COPY --from=release /usr/app/packages/frontend/build/assets/ /assets/
