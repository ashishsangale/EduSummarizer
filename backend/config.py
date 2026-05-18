from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


_ENV_FILE = Path(__file__).resolve().parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    app_name: str = "EduSummarizer API"
    app_env: str = "dev"
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db_name: str = "edusummarize"
    mongo_collection_name: str = "edusummarize"

    upload_dir: str = "data/uploads"
    retrieval_dir: str = "data/retrieval"

    whisper_model_size: str = "base"
    whisper_compute_type: str = "int8"

    cerebras_api_key: str = ""
    cerebras_base_url: str = "https://api.cerebras.ai/v1"
    cerebras_chat_model: str = "gpt-oss-120b"
    cerebras_max_completion_tokens: int = 32768
    cerebras_reasoning_effort: str = "medium"

    embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"


settings = Settings()
