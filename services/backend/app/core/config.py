from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "local"
    aws_region: str = "us-east-1"
    dynamodb_table_name: str = "fleet-dev-operational"
    cognito_user_pool_id: str = ""
    cognito_region: str = "us-east-1"
    cors_origins: str = "http://localhost:5173"
    skip_jwt_verify: bool = False
    send_invite_email: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
