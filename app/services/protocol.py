from dataclasses import dataclass
import math
@dataclass
class ParsedLine:
    kind: str; fields: list[str]; raw: str; valid: bool=True
class ProtocolParser:
    def __init__(self, require_checksum=False): self.require_checksum=require_checksum; self.bad_checksum=0; self.unknown_lines=0
    def parse(self,line):
        if isinstance(line,bytes): line=line.decode('ascii','replace')
        line=line.rstrip('\r\n')
        if len(line)>120: return None
        if line.startswith('#') or not line: return None
        payload=line; checksum=None
        if '*' in line:
            payload, hx=line.rsplit('*',1)
            if len(hx)!=2:
                self.bad_checksum+=1; return None
            try: checksum=int(hx,16)
            except ValueError: self.bad_checksum+=1; return None
            actual=0
            for b in payload.encode('ascii','replace'): actual ^= b
            if actual != checksum: self.bad_checksum+=1; return None
        elif self.require_checksum: self.bad_checksum+=1; return None
        fields=payload.split(','); kind=fields[0]
        if kind not in {'HELLO','R','RR','S','P','ACK','NAK','PONG','ERR'}: self.unknown_lines+=1; return None
        return ParsedLine(kind,fields[1:],line)
def xor_checksum(payload):
    value=0
    for b in payload.encode('ascii'): value ^= b
    return f'{value:02X}'
