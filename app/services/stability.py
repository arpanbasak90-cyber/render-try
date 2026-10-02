from statistics import median, pstdev
import math

def valid_reading(r):
    bounds={'ph':(0,14),'tds_mgl':(0,10000),'turbidity_ntu':(0,4000),'temp_c':(-5,80)}
    return all(v is not None and math.isfinite(v) and bounds[k][0] <= v <= bounds[k][1] for k,v in r.items() if k in bounds)
def stability_status(readings):
    if not readings: return False, []
    p=readings[-10:]
    def vals(k): return [x[k] for x in p if x.get(k) is not None and math.isfinite(x[k])]
    pv,tv,uv,cv=[vals(k) for k in ('ph','tds_mgl','turbidity_ntu','temp_c')]
    if min(map(len,(pv,tv,uv,cv)),default=0)==0:return False,[]
    return max(pv)-min(pv)<=.1 and (pstdev(tv)/median(tv)*100 if median(tv) else 0)<=3 and max(uv)-min(uv)<=max(.3,.05*sum(uv)/len(uv)) and max(cv)-min(cv)<=.3,p

def final_values(readings):
    out={}
    for k in ('ph','tds_mgl','turbidity_ntu','temp_c'):
        v=[x[k] for x in readings if x.get(k) is not None and math.isfinite(x[k])]
        out[k]=median(v) if len(v)*2>=len(readings) and v else None
    return out
