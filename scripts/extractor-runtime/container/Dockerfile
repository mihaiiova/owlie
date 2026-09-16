# Controlled runtime for the gated packaged extractor verification (`--real`).
# Provision Python + faster-whisper + ffmpeg + ffprobe + Node, pre-provision the
# `tiny` Whisper model at build time, then build and run the packed-artifact
# verification with HF_HUB_OFFLINE=1 so any accidental model download fails.
#
# This is a manual, opt-in check; it never runs in the default suite or CI.

FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Node 20 (matches .nvmrc; required to build and run the packed CLI).
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@11.16.0

# Pin the Hugging Face cache so the pre-provisioned model is found at runtime
# even though the verification runner redirects HOME/XDG_CACHE_HOME to isolated
# temp dirs (faster-whisper resolves HF_HOME before those).
ENV HF_HOME=/opt/hf

# Pre-provision the `tiny` model (a one-time download at image build time).
RUN pip install --no-cache-dir faster-whisper \
  && python -c "from faster_whisper import WhisperModel; WhisperModel('tiny')"

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile && pnpm build

# Prove local-only model loading: any download attempt fails closed.
ENV HF_HUB_OFFLINE=1

CMD ["node", "scripts/verify-extractor-runtime.mjs", "--real", "--model", "tiny"]
