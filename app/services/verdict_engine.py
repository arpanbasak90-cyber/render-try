from app.core.constants import THRESHOLDS, THRESHOLDS_VERSION
CAVEAT='These sensors cannot detect fluoride, arsenic, iron, nitrate or bacteria. A field-kit or lab test is recommended.'
MESSAGES={'SAFE':{'en':'Water appears safe on the measured parameters.','hi':'मापे गए मापदंडों के अनुसार पानी सुरक्षित प्रतीत होता है।','bn':'পরিমাপ করা মানদণ্ড অনুযায়ী জল নিরাপদ বলে মনে হচ্ছে।'},'TREAT_FIRST':{'en':'Water needs treatment or checking before drinking. Filter it and boil if unsure.','hi':'पीने से पहले पानी का उपचार या जांच जरूरी है। छानें और संदेह हो तो उबालें।','bn':'পান করার আগে জল পরিশোধন বা পরীক্ষা প্রয়োজন। ছেঁকে নিন এবং সন্দেহ হলে ফুটিয়ে নিন।'},'UNSAFE':{'en':'Do not drink this water. Use a safe alternative source.','hi':'यह पानी न पिएं। सुरक्षित वैकल्पिक स्रोत का उपयोग करें।','bn':'এই জল পান করবেন না। নিরাপদ বিকল্প উৎস ব্যবহার করুন।'},'UNKNOWN':{'en':'Not enough valid data to judge this water.','hi':'पानी का आकलन करने के लिए पर्याप्त वैध डेटा नहीं है।','bn':'জল মূল্যায়নের জন্য পর্যাপ্ত বৈধ তথ্য নেই।'}}
def band(v, t, key):
    if v is None:return None
    if key=='ph': return 'OK' if t['ok_min']<=v<=t['ok_max'] else 'BAD'
    if key in ('tds','turbidity'):
        if v<=t['ok_max']: return 'OK'
        if v<=t['warn_max']: return 'WARN'
        return 'BAD'
    if key in ('fluoride','arsenic','iron'):
        if v<=t['ok_max']: return 'OK'
        if v<=t['warn_max']: return 'WARN'
        return 'BAD'
    return 'BAD' if v>t['bad_above'] else 'OK'
def evaluate(values, field_tests=None, stability_achieved=True, flags=None, regional_concerns=None):
    flags=list(flags or []); reasons=[]; states=[]
    for k,v in values.items():
        if k in THRESHOLDS:
            b=band(v,THRESHOLDS[k],k); states.append(b) if b else None
    for ft in field_tests or []:
        b=band(ft.get('value'),THRESHOLDS.get(ft.get('parameter'),{}),ft.get('parameter')) if ft.get('parameter')!='bacteria' else ('BAD' if ft.get('bacteria_present') else 'OK')
        states.append(b); reasons.append(f"Field test: {ft.get('parameter')}")
    state='UNKNOWN' if not states else 'UNSAFE' if 'BAD' in states else 'TREAT_FIRST' if 'WARN' in states else 'SAFE'
    confidence='HIGH' if stability_achieved and not flags and field_tests else 'MEDIUM' if state=='SAFE' else 'LOW'
    if state=='SAFE': reasons.append(CAVEAT); confidence='MEDIUM' if confidence=='HIGH' else confidence
    concerns=set(regional_concerns or [])
    if concerns & {'fluoride','arsenic','iron','uranium_metals'} and not field_tests: confidence='LOW'; reasons.append('A recommended field or lab test is needed for the regional concern.')
    if not stability_achieved: flags.append('unstable'); confidence='LOW'
    return {'state':state,'confidence':confidence,'reasons':reasons,'messages':MESSAGES[state],'actions':{},'thresholds_version':THRESHOLDS_VERSION,'flags':flags}
