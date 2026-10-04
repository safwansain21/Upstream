# Hugging Face Space (Docker SDK, free CPU basic): web app, API and worker in one container. docs/hosting.md
# Builds whatever is on main of the public GitHub repo; "Factory rebuild" in the Space redeploys.
FROM python:3.12-slim-bookworm
COPY --from=node:24-bookworm-slim /usr/local/bin /usr/local/bin
COPY --from=node:24-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@11.19.0 && useradd -m -u 1000 user
USER user
WORKDIR /home/user
# Re-clone when main moves (the ref file changes), otherwise reuse the build cache.
ADD --chown=user https://api.github.com/repos/safwansain21/Upstream/git/refs/heads/main /tmp/main.json
RUN git clone --depth 1 https://github.com/safwansain21/Upstream app
WORKDIR /home/user/app
RUN pip install --no-cache-dir --user -r requirements.lock
# Public values only: Space "Variables" arrive as build args and are inlined into the browser build.
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ARG INTAKE_ORG_ID=01995d20-0000-7000-8000-000000000001
ARG MAP_STYLE_URL=https://tiles.openfreemap.org/styles/dark
RUN pnpm install --frozen-lockfile --filter @upstream/web && pnpm --filter @upstream/web build
ENV PATH=/home/user/.local/bin:$PATH PYTHONUNBUFFERED=1 NODE_ENV=production PORT=7860
EXPOSE 7860
CMD ["sh", "deploy/start.sh"]
