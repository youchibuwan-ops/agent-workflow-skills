# Optional strong-isolation recipe. Build and record the resulting image ID once.
# Both arms must use that SAME image, not independently resolved image tags.
FROM node:22.22.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git python3 poppler-utils fonts-noto-cjk ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @openai/codex@0.155.1
COPY evals/codex/run.py evals/codex/record_rpc.py evals/codex/protocol.json evals/codex/payloads.json /opt/experiment/
COPY evals/codex/tasks/ /opt/experiment/tasks/
COPY evals/codex/v2/protocol.json evals/codex/v2/payloads.json /opt/experiment/v2/
COPY evals/codex/v3/protocol.json evals/codex/v3/payloads.json /opt/experiment/v3/
WORKDIR /work
ENTRYPOINT ["python3", "/opt/experiment/run.py"]
