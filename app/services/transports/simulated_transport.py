import asyncio, math
from app.services.protocol import xor_checksum
class SimulatedTransport:
    def __init__(self, scenario='clean_water', checksum=False): self.scenario=scenario; self.checksum=checksum; self.queue=asyncio.Queue(); self.running=False; self.task=None
    async def open(self):
        if self.scenario!='no_hello_on_boot': await self.emit('HELLO,simulator,1,1')
    async def emit(self,payload): await self.queue.put(payload+('*'+xor_checksum(payload) if self.checksum else '')+'\n')
    async def write(self,line):
        cmd=line.strip()
        if cmd=='HELLO?': await self.open()
        elif cmd.startswith('START,'):
            await self.emit('ACK,START'); await self.emit('S,SENSING'); self.running=True
            self.task=asyncio.create_task(self.readings())
        elif cmd=='STOP': self.running=False; await self.emit('ACK,STOP'); await self.emit('S,IDLE')
        elif cmd=='PING': await self.emit('PONG')
        elif cmd.startswith('FILTER_START'): await self.emit('ACK,FILTER_START'); await self.emit('S,FILTERING')
        elif cmd=='FILTER_STOP': await self.emit('ACK,FILTER_STOP'); await self.emit('S,FILTER_DONE')
    async def readings(self):
        i=0
        while self.running:
            i+=1; ph,tds,ntu,temp=7.1,220,0.5,23
            if self.scenario=='high_tds_mine_water': tds=2400
            if self.scenario=='high_turbidity_after_rain': ntu=8
            if self.scenario=='acidic_mine_drainage': ph=5.5
            if self.scenario=='alkaline_water': ph=9
            if self.scenario=='stuck_sensor': pass
            if self.scenario=='sensor_dropout': ph=math.nan
            await self.emit(f'R,{i},{ph},{tds},{ntu},{temp}'); await asyncio.sleep(.05)
            if self.scenario=='device_silent' and i>=3: self.running=False
    async def read(self): return await self.queue.get()
    async def close(self): self.running=False; self.task.cancel() if self.task else None
