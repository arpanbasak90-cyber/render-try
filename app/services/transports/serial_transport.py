import asyncio
from contextlib import suppress

import serial


class SerialTransport:
    """Async adapter for the line-oriented ESP32/Arduino protocol."""

    def __init__(self, port: str, baud: int, timeout: float = 0.5):
        if not port:
            raise ValueError('SERIAL_PORT must be configured for serial transport')
        self.port = port
        self.baud = baud
        self.timeout = timeout
        self.serial = None
        self.queue: asyncio.Queue[str] = asyncio.Queue()
        self.reader_task: asyncio.Task | None = None

    async def open(self):
        self.serial = await asyncio.to_thread(serial.Serial, self.port, self.baud, timeout=self.timeout)
        self.reader_task = asyncio.create_task(self._read_loop())

    async def _read_loop(self):
        while self.serial and self.serial.is_open:
            try:
                line = await asyncio.to_thread(self.serial.readline)
                if line:
                    await self.queue.put(line.decode('ascii', 'replace'))
            except (OSError, serial.SerialException):
                break

    async def write(self, line: str):
        if not self.serial or not self.serial.is_open:
            raise RuntimeError('serial device is not connected')
        await asyncio.to_thread(self.serial.write, (line.rstrip('\n') + '\n').encode('ascii'))

    async def read(self):
        return await self.queue.get()

    async def close(self):
        if self.reader_task:
            self.reader_task.cancel()
            with suppress(asyncio.CancelledError):
                await self.reader_task
        if self.serial and self.serial.is_open:
            await asyncio.to_thread(self.serial.close)
        self.serial = None
