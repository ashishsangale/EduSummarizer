from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

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
    cerebras_chat_model: str = "llama-3.1-8b"

    embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"


settings = Settings()
