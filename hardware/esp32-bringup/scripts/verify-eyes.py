#!/usr/bin/env python3
"""Collect local evidence; manual visual/speaker acceptance is intentionally never inferred."""
import hashlib,json,pathlib,re,datetime
root=pathlib.Path(__file__).resolve().parents[1]
def read(name):
 p=root/name
 return p.read_text(errors='replace') if p.exists() else ''
def result(status,evidence,**extra):return dict(status=status,evidence=evidence,**extra)
logname='logs/eyes-raster-boot-soak.log';log=read(logname)
lines=log.splitlines();rounds=0;pending=False;responded=False
for line in lines:
 if 'Application: >>' in line:pending=True;responded=False
 elif pending and 'Application: <<' in line:responded=True
 elif pending and responded and re.search(r'Application: STATE: (listening|idle)',line):rounds+=1;pending=False
fatal=bool(re.search(r'Guru Meditation|Backtrace:|Task watchdog|assert failed|Rebooting',log))
times=[int(t) for t in re.findall(r'\bI \((\d+)\)',log)]
span=(max(times)-min(times))/1000 if times else 0
stats=[]
for line in lines:
 if 'RoundEyes: frames=' not in line:continue
 row={}
 for key,value in re.findall(r'(update_fps|refresh_fps|refresh_max_us|update_avg_us|update_max_us|heap|min_heap)=([\d.]+)',line):row[key]=float(value) if '.' in value else int(value)
 if row:stats.append(row)
buildlogs=['logs/eyes-build-raster-final.log','logs/eyes-build-off-raster-final.log','logs/eyes-build-captions-raster-final.log']
buildok=all('Project build complete.' in read(p) and not re.search(r'FAILED:|error:|unexpected EOF',read(p)) for p in buildlogs)
binfile=root/'firmware/xiaozhi-1.9.4-s3-round-eyes.bin'
imageinfo=read('logs/eyes-image-info.log')
elf=re.search(r'ELF file SHA256: ([a-f0-9]+)',imageinfo)
bootok=all(k in log for k in ['gc9a01: LCD panel create success','MQTT: Connected to endpoint','Audio detection task started','RoundEyes: frames=']) and not fatal
host=read('logs/eyes-host-tests.log');hostok=host.count('PASS ')==6 and 'FAIL' not in host
manifest={
 'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'firmware':{'path':str(binfile.relative_to(root)),'bytes':binfile.stat().st_size,'sha256':hashlib.sha256(binfile.read_bytes()).hexdigest(),'elfSha256':elf.group(1) if elf else None,'applicationOffset':'0x700000','lvglTimerPeriodMs':30,'refreshTimerPeriodMs':10,'targetFps':25,'renderer':'contour-rgb565','canvasBytes':61440,'speechModelChanged':False,'partitionTableChanged':False},
 'hostTests':result('passed' if hostok else 'pending',['logs/eyes-host-tests.log']),
 'build':result('passed' if buildok else 'pending',buildlogs+['logs/eyes-image-info.log']),
 'flash':result('passed' if 'Hash of data verified.' in read('logs/eyes-flash-raster.log') else 'pending',['logs/eyes-flash-raster.log','logs/eyes-ota-selection.log']),
 'boot':result('passed' if bootok else ('failed' if fatal else 'pending'),[logname],note='GC9A01, retained Wi-Fi, MQTT and wake task observed; passive capture begins during early startup.'),
 'voice':result('passed' if rounds>=10 and not fatal else 'pending',[logname],completedRoundTrips=rounds,note='Round trip requires recognized input, assistant response, then listening/idle; acoustic speaker output is separate.'),
 'visual':result('pending',['../../output/xiaozhi-character-design/eyes-preview.png','../../output/xiaozhi-character-design/eyes-motion.mp4'],note='Desktop preview inspected; physical display confirmation, critical prompt layout and named moods still require operator feedback.'),
 'soak':result('failed' if fatal else ('passed' if span>=600 and len(stats)>=50 else 'pending'),[logname],observedSeconds=span,diagnosticSamples=len(stats),statistics=stats,note='LVGL refresh events measured; no optical panel measurement. Initial full refresh may be slower.'),
 'speaker':result('pending',[],note='MAX98357A assembled amplifier module not installed; audible output unverified.'),
 'criticalPrompts':result('pending',['tests/signals_test.cc'],note='Critical-state routing covered by host tests; physical disconnection/upgrade/long-text layout not manually exercised.'),
 'review':{'importantFindings':4,'importantFixed':4,'minor':'Separate asymmetric RMS attack/release filter deferred; critically damped eye-height parameters smooth the12% modulation.'},
 'previousRuns':[{'log':'logs/eyes-boot-soak.log','status':'failed','reason':'newlib-nano %llu formatting crash; baseline restored, format corrected and reflashed.'},{'log':'logs/eyes-final-boot-soak.log','status':'failed','scope':'Triangle renderer ran over10minutes and22voice rounds without panic, but operator photo failed visual acceptance: internal AA seams and16–17FPS.'},{'log':'logs/eyes-raster-40ms-smoke.log','status':'passed','scope':'Short native-raster smoke only,20.4–20.6refreshFPS; superseded cadence.'},{'log':'logs/eyes-raster-30ms-default-refresh-smoke.log','status':'passed','scope':'Short native-raster smoke only,21–23refreshFPS due to default33ms refresh deadline; superseded cadence.'}]
}
feedback=read('operator-feedback-eyes.json')
if feedback:
 manual=json.loads(feedback).get('visual',{})
 manifest['visual'].update(manual)
(root/'VERIFICATION-eyes.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:manifest[k]['status'] for k in ['hostTests','build','flash','boot','voice','visual','soak','speaker']},ensure_ascii=False))
print(f'Observed {span:.1f}s; completed round trips={rounds}; diagnostic samples={len(stats)}; fatal={fatal}')
