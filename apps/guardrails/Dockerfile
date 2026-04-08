FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir "guardrails-ai>=0.10.0" fastapi uvicorn

# Install hub validators — requires a free token from https://guardrailsai.com/hub/keys
ARG GUARDRAILS_TOKEN
RUN printf 'n\nn\n' | guardrails configure --token=${GUARDRAILS_TOKEN}
RUN guardrails hub install hub://guardrails/detect_pii --quiet

COPY entrypoint.py .

EXPOSE 8000

CMD ["python", "entrypoint.py"]
