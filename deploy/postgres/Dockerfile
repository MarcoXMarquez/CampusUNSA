# syntax=docker/dockerfile:1
FROM postgres:16-alpine AS vector-build
ADD --checksum=sha256:cac0b10c360f05b2d521200105ba3697e773d4cd3731f5a915a7e37ebe0bea85 https://codeload.github.com/pgvector/pgvector/tar.gz/refs/tags/v0.8.7 /tmp/pgvector.tar.gz
RUN apk add --no-cache build-base \
    && mkdir -p /tmp/pgvector \
    && tar xzf /tmp/pgvector.tar.gz -C /tmp/pgvector --strip-components=1 \
    && make -C /tmp/pgvector -j2 OPTFLAGS="" with_llvm=no \
    && make -C /tmp/pgvector DESTDIR=/extension with_llvm=no install

FROM postgres:16-alpine
COPY --from=vector-build /extension/usr/local/lib/postgresql/vector.so /usr/local/lib/postgresql/vector.so
COPY --from=vector-build /extension/usr/local/share/postgresql/extension/vector* /usr/local/share/postgresql/extension/
