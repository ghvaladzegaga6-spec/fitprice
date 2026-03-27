FROM python:3.12-slim

WORKDIR /app

# Security: non-root user
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

# Install deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Fix permissions
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--no-access-log"]
