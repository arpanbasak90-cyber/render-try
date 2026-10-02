from app.services.protocol import ProtocolParser,xor_checksum
from app.services.verdict_engine import evaluate
from app.services.stability import stability_status

def test_protocol_checksum_and_unknown():
    p=ProtocolParser(); line='PONG*'+xor_checksum('PONG'); assert p.parse(line).kind=='PONG'; assert p.parse('PONG*00') is None; assert p.bad_checksum==1

def test_verdict_boundaries_and_caveat():
    r=evaluate({'ph':7,'tds_mgl':500,'turbidity_ntu':1,'temp_c':20}); assert r['state']=='SAFE'; assert any('cannot detect' in x for x in r['reasons'])
    assert evaluate({'ph':6,'tds_mgl':1,'turbidity_ntu':1,'temp_c':20})['state']=='UNSAFE'

def test_stability():
    rs=[{'ph':7,'tds_mgl':100,'turbidity_ntu':.5,'temp_c':20} for _ in range(10)]
    assert stability_status(rs)[0]
