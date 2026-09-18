# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f similarityServer/Dockerfile .
# One image, several entrypoints (docker-compose.yml overrides the command):
#   default CMD                                 -> FastAPI search server + MCP (long-running)
#   python -m similarityServer.main             -> CLI catalog importer (job)
#   python -m similarityServer.download_dataset -> Kaggle dataset refresh (job)

# ---- builder: compiles hnswlib and resolves wheels; only /venv and /opt/hf ship
FROM python:3.12-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*
RUN python -m venv /venv
ENV PATH="/venv/bin:$PATH"
# CPU-only torch (the default PyPI wheel drags in ~2GB of CUDA libs the server never uses).
RUN pip install torch==2.14.0 --index-url https://download.pytorch.org/whl/cpu
COPY similarityServer/requirements.txt similarityServer/constraints.txt /tmp/
RUN pip install -r /tmp/requirements.txt -c /tmp/constraints.txt

# Bake the default embedding model into the image: no network needed at startup
# and startup time is not dominated by a first-run download. Overriding
# SIMILARITY_MODEL_NAME at runtime works but downloads the model on first start.
ARG SIMILARITY_MODEL_NAME=paraphrase-multilingual-MiniLM-L12-v2
ENV HF_HOME=/opt/hf
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${SIMILARITY_MODEL_NAME}')"

# ---- runtime
FROM python:3.12-slim
RUN useradd --system --create-home --uid 10001 app \
 && mkdir -p /data && chown app:app /data
COPY --from=builder /venv /venv
COPY --from=builder --chown=app:app /opt/hf /opt/hf
ENV PATH="/venv/bin:$PATH" \
    HF_HOME=/opt/hf \
    PYTHONUNBUFFERED=1 \
    SIMILARITY_EMBEDDINGS_PATH=/data/embeddings.npz
WORKDIR /app
COPY similarityServer similarityServer
USER app
# Persistent HNSW index + embeddings (embeddings.npz / embeddings.hnsw)
VOLUME ["/data"]
EXPOSE 8001
CMD ["python", "-m", "similarityServer.app"]
