def linear_two_point(v1, y1, v2, y2, volts):
    if v2 == v1: raise ValueError('calibration points must have distinct volts')
    slope=(y2-y1)/(v2-v1); return slope*volts+(y1-slope*v1)
def polynomial(coefficients, volts):
    result=0.0
    for coefficient in coefficients: result=result*volts+coefficient
    return result
def convert_raw(raw, profile):
    out={'ph':None,'tds_mgl':None,'turbidity_ntu':None,'temp_c':raw.get('temp_c')}; flags=[]
    for sensor,key in [('ph','v_ph'),('tds','v_tds'),('turbidity','v_turb')]:
        v=raw.get(key); cfg=(profile or {}).get(sensor)
        if v is None or cfg is None: flags.append('uncalibrated'); continue
        out[{'ph':'ph','tds':'tds_mgl','turbidity':'turbidity_ntu'}[sensor]]=linear_two_point(*cfg['points'][0],*cfg['points'][1],v) if sensor=='ph' else polynomial(cfg['coefficients'],v)
    if profile and profile.get('tds',{}).get('temperature_coefficient') is not None and out['tds_mgl'] is not None:
        out['tds_mgl'] *= 1 + profile['tds']['temperature_coefficient']*(raw.get('temp_c',25)-25)
    return out,sorted(set(flags))
