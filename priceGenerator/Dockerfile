# Build from the repo root: docker build -f priceGenerator/Dockerfile .
# Batch job — runs one sync and exits. No CMD loop, no cron/scheduler baked in
# (spec, "Empaquetado como imagen Docker"): orchestration is out of scope here.
FROM python:3.12-slim

WORKDIR /app

COPY priceGenerator/requirements.txt priceGenerator/requirements.txt
RUN pip install --no-cache-dir -r priceGenerator/requirements.txt

COPY priceGenerator priceGenerator

CMD ["python", "-m", "priceGenerator.main"]
