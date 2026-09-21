from functools import lru_cache
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    environment: str = 'development'
    app_url: str = 'http://localhost:3000'
    database_url: str = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
    supabase_url: str = 'http://127.0.0.1:54321'
    supabase_anon_key: str = ''
    supabase_service_role_key: str = ''
    auth_jwks_url: str = 'http://127.0.0.1:54321/auth/v1/.well-known/jwks.json'
    auth_issuer: str = 'http://127.0.0.1:54321/auth/v1'
    auth_audience: str = 'authenticated'
    storage_bucket: str = 'evidence-private'
    intake_org_id: str = '01995d20-0000-7000-8000-000000000001'
    example_mode: bool = True
    ai_api_key: str = ''
    ai_model: str = ''
    ai_base_url: str = 'https://api.openai.com/v1'
    export_signing_key_id: str = ''
    export_signing_private_key: str = ''
    fhir_canonical_base: str = 'https://upstream.example/fhir'
    log_level: str = 'INFO'

    @model_validator(mode='after')
    def production(self):
        if self.environment == 'production':
            if self.example_mode or not self.app_url.startswith('https://') or 'postgres:postgres@' in self.database_url:
                raise ValueError('Production requires HTTPS, unique credentials and EXAMPLE_MODE=false')
            if not self.supabase_anon_key or self.supabase_url.startswith('http:'):
                raise ValueError('Production Supabase configuration is required')
        return self


@lru_cache
def settings():
    return Settings()
