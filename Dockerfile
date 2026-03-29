# ── Stage 1: Build server & worker binaries ──
FROM rust:1.83-bookworm AS builder

WORKDIR /app

# Cache dependency build: copy manifests first
COPY Cargo.toml Cargo.lock ./
COPY crates/shared/Cargo.toml crates/shared/Cargo.toml
COPY crates/server/Cargo.toml crates/server/Cargo.toml
COPY crates/worker/Cargo.toml crates/worker/Cargo.toml

# Create stub lib/main files so cargo can resolve the dependency graph
RUN mkdir -p crates/shared/src crates/server/src crates/server/src/bin crates/worker/src \
    && echo "pub fn load_dotenv() {}" > crates/shared/src/lib.rs \
    && echo "fn main() {}" > crates/server/src/main.rs \
    && echo "fn main() {}" > crates/server/src/bin/seed_leagues.rs \
    && echo "fn main() {}" > crates/worker/src/main.rs

RUN cargo build --release --bin server --bin worker 2>&1 || true

# Copy real source and rebuild
COPY crates/ crates/
RUN touch crates/shared/src/lib.rs crates/server/src/main.rs crates/worker/src/main.rs \
    && cargo build --release --bin server --bin worker

# ── Stage 2: Minimal runtime image ──
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/server /usr/local/bin/server
COPY --from=builder /app/target/release/worker /usr/local/bin/worker

EXPOSE 8080

CMD ["server"]
