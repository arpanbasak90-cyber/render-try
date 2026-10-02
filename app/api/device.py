import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.auth import current_user
from app.core.config import get_settings
from app.services.protocol import ProtocolParser
from app.services.stability import final_values, valid_reading
from app.services.transports.serial_transport import SerialTransport
from app.services.transports.simulated_transport import SimulatedTransport
from app.services.verdict_engine import evaluate

router = APIRouter(prefix='/api/v1', tags=['devices'])


class AnalysisStart(BaseModel):
    state_code: str = Field(min_length=2, max_length=8)
    state_name: str = Field(min_length=1, max_length=120)
    district_name: str = Field(min_length=1, max_length=120)
    source_type: str = Field(default='other', max_length=40)


class DeviceManager:
    def __init__(self, database):
        self.database = database
        self.settings = get_settings()
        self.transport = None
        self.reader_task: asyncio.Task | None = None
        self.last_line_at: datetime | None = None
        self.status = 'offline'
        self.hello: dict[str, Any] | None = None
        self.sessions: dict[str, dict[str, Any]] = {}

    def _make_transport(self):
        if self.settings.device_transport == 'serial':
            return SerialTransport(self.settings.serial_port, self.settings.serial_baud)
        return SimulatedTransport(self.settings.simulator_default_scenario, self.settings.serial_require_checksum)

    async def connect(self):
        if self.transport:
            return self.info()
        self.transport = self._make_transport()
        try:
            await self.transport.open()
            await self.transport.write('HELLO?')
            parser = ProtocolParser(self.settings.serial_require_checksum)
            deadline = asyncio.get_running_loop().time() + self.settings.ack_timeout_s
            while asyncio.get_running_loop().time() < deadline:
                line = await asyncio.wait_for(self.transport.read(), max(.05, deadline - asyncio.get_running_loop().time()))
                parsed = parser.parse(line)
                if parsed and parsed.kind == 'HELLO':
                    self.hello = {'device': parsed.fields[0] if parsed.fields else 'unknown', 'version': parsed.fields[1] if len(parsed.fields) > 1 else ''}
                    self.status = 'connected'
                    self.reader_task = asyncio.create_task(self._drain_unsolicited())
                    return self.info()
            raise RuntimeError('device did not send HELLO before timeout')
        except Exception:
            await self.disconnect()
            raise

    async def _drain_unsolicited(self):
        # Lines are consumed by an active analysis; this task only keeps connection metadata alive.
        return

    async def disconnect(self):
        if self.reader_task:
            self.reader_task.cancel()
            self.reader_task = None
        if self.transport:
            await self.transport.close()
        self.transport = None
        self.status = 'offline'
        self.hello = None

    def info(self):
        return {'id': self.settings.device_id, 'transport': self.settings.device_transport, 'status': self.status, 'port': self.settings.serial_port if self.settings.device_transport == 'serial' else None, 'baud': self.settings.serial_baud, 'hello': self.hello, 'last_seen': self.last_line_at.isoformat() if self.last_line_at else None}

    async def start(self, payload: AnalysisStart, user: dict[str, Any]):
        if not self.transport:
            await self.connect()
        session_id = str(uuid.uuid4())
        session = {'id': session_id, 'status': 'SENSING', 'created_at': datetime.now(timezone.utc).isoformat(), 'user_sub': user.get('sub'), 'region': payload.model_dump(), 'readings': []}
        self.sessions[session_id] = session
        await self.transport.write(f'START,{self.settings.sample_interval_ms}')
        return session

    async def read_one(self, session):
        parser = ProtocolParser(self.settings.serial_require_checksum)
        deadline = asyncio.get_running_loop().time() + self.settings.device_silence_timeout_s
        while asyncio.get_running_loop().time() < deadline:
            line = await asyncio.wait_for(self.transport.read(), self.settings.device_silence_timeout_s)
            self.last_line_at = datetime.now(timezone.utc)
            parsed = parser.parse(line)
            if not parsed or parsed.kind not in {'R', 'RR'}:
                continue
            if len(parsed.fields) < 5:
                continue
            try:
                reading = {'sequence': int(parsed.fields[0]), 'ph': float(parsed.fields[1]), 'tds_mgl': float(parsed.fields[2]), 'turbidity_ntu': float(parsed.fields[3]), 'temp_c': float(parsed.fields[4])}
            except ValueError:
                continue
            if valid_reading(reading):
                session['readings'].append(reading)
                return reading
        raise TimeoutError('No valid sensor reading received before the device silence timeout')

    async def stop(self, session_id: str):
        session = self.sessions.get(session_id)
        if not session:
            raise KeyError(session_id)
        if self.transport:
            await self.transport.write('STOP')
        readings = session['readings']
        values = final_values(readings)
        verdict = evaluate(values, stability_achieved=len(readings) >= self.settings.min_valid_readings)
        session.update({'status': 'MEASURED', 'final_values': values, 'verdict': verdict, 'completed_at': datetime.now(timezone.utc).isoformat()})
        doc = {'sample_id': f'LIVE-{session_id[:8].upper()}', 'measured_at': session['completed_at'], 'synthetic': False, 'region': session['region'], 'final_values': values, 'verdict': verdict, 'device_id': self.settings.device_id, 'operator_sub': session['user_sub']}
        if self.database.available:
            await self.database.db['samples'].insert_one(doc)
        return {k: v for k, v in session.items() if k != 'readings'} | {'reading_count': len(readings)}


_manager: DeviceManager | None = None

def configure_manager(database):
    global _manager
    _manager = DeviceManager(database)
    return _manager

def manager() -> DeviceManager:
    if not _manager:
        raise HTTPException(status_code=503, detail={'code': 'device_manager_unavailable', 'message': 'Device manager is not ready'})
    return _manager


def manager_info() -> dict[str, Any]:
    return _manager.info() if _manager else {'status': 'offline', 'transport': get_settings().device_transport}


@router.get('/devices')
async def device_info(user=Depends(current_user)):
    return manager().info()

@router.post('/devices/connect')
async def connect_device(user=Depends(current_user)):
    try:
        return await manager().connect()
    except Exception as exc:
        raise HTTPException(status_code=503, detail={'code': 'device_connect_failed', 'message': str(exc)}) from exc

@router.post('/devices/disconnect')
async def disconnect_device(user=Depends(current_user)):
    await manager().disconnect()
    return manager().info()

@router.post('/analysis/start')
async def start_analysis(payload: AnalysisStart, user=Depends(current_user)):
    try:
        return await manager().start(payload, user)
    except Exception as exc:
        raise HTTPException(status_code=503, detail={'code': 'analysis_start_failed', 'message': str(exc)}) from exc

@router.post('/analysis/{session_id}/reading')
async def read_analysis(session_id: str, user=Depends(current_user)):
    session = manager().sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail={'code': 'session_not_found', 'message': 'Analysis session not found'})
    try:
        return await manager().read_one(session)
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail={'code': 'sensor_timeout', 'message': str(exc)}) from exc

@router.post('/analysis/{session_id}/complete')
async def complete_analysis(session_id: str, user=Depends(current_user)):
    try:
        return await manager().stop(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={'code': 'session_not_found', 'message': 'Analysis session not found'}) from exc
