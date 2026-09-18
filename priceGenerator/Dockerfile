# Build from the repo root:  docker build -f priceGenerator/Dockerfile .
# Batch job — runs one sync and exits. No CMD loop, no cron/scheduler baked in
# (spec, "Empaquetado como imagen Docker"): orchestration is out of scope here.
# In docker-compose.yml it is the `seed-prices` job (profile `seed`).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN useradd --system --create-home --uid 10001 app
WORKDIR /app

COPY priceGenerator/requirements.txt priceGenerator/requirements.txt
RUN pip install -r priceGenerator/requirements.txt

COPY priceGenerator priceGenerator
USER app

CMD ["python", "-m", "priceGenerator.main"]
