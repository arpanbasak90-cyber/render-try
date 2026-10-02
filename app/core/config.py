from functools import lru_cache
from typing import Literal
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    app_env: str = 'development'; log_level: str = 'INFO'; cors_origins: str = '*'; demo_mode: bool = False; auth_enabled: bool = False
    jwt_secret: str | None = None; access_token_minutes: int = 30; refresh_token_days: int = 7; google_client_id: str | None = None
    db_mode: Literal['memory', 'mongo', 'postgres', 'sqlite'] = 'memory'
    mongodb_uri: str | None = None
    mongodb_db_name: str = 'jalraksha'
    mongodb_connect_timeout_ms: int = 1000
    database_url: str | None = None
    postgres_uri: str | None = None
    device_transport: Literal['simulator','serial'] = 'simulator'; serial_port: str = ''; serial_baud: int = 9600; serial_boot_delay_s: float = 2.0; serial_require_checksum: bool = False; raw_log_buffer_lines: int = 500; ack_timeout_s: float = 3; device_silence_timeout_s: float = 10; device_id: str = 'UNO-001'
    reading_mode: Literal['converted','raw_volts'] = 'converted'; adc_reference_volts: float = 5.0
    sample_interval_ms: int = 1000; min_valid_readings: int = 20; stability_window: int = 10; max_sensing_duration_s: int = 120; stuck_readings: int = 12; noisy_std_limit: float = 0.0
    filter_mode: Literal['timed','device_reported'] = 'timed'; filter_duration_s: float | None = None; post_filter_verify: bool = False; purifier_capabilities: str = 'none'; tds_sensor_max_mgl: float | None = None
    simulator_default_scenario: str = 'clean_water'
    @field_validator('filter_duration_s', 'tds_sensor_max_mgl', mode='before')
    @classmethod
    def blank_optional_number(cls, v):
        return None if v == '' else v
    @field_validator('jwt_secret')
    @classmethod
    def secret_required(cls, v, info):
        if info.data.get('auth_enabled') and not v: raise ValueError('JWT_SECRET is required when AUTH_ENABLED=true')
        return v
    def capabilities(self): return [] if self.purifier_capabilities in ('', 'none') else [x.strip() for x in self.purifier_capabilities.split(',') if x.strip()]
def get_settings(): return Settings()

