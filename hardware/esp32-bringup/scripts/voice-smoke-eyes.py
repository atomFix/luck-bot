#!/usr/bin/env python3
"""Bounded acoustic smoke test via the Mac's existing output; never changes volume/routes."""
import pathlib,re,subprocess,time,sys
log=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'hardware/esp32-bringup/logs/eyes-raster-boot-soak.log')
def text():return log.read_text(errors='replace') if log.exists() else ''
def state(s):
 found=re.findall(r'Application: STATE: (\w+)',s)
 return found[-1] if found else ''
def completed(s):
 pending=False;responded=False;count=0
 for line in s.splitlines():
  if 'Application: >>' in line:pending=True;responded=False
  elif pending and 'Application: <<' in line:responded=True
  elif pending and responded and re.search(r'Application: STATE: (idle|listening)',line):count+=1;pending=False
 return count

def wait(predicate,seconds):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  s=text()
  if re.search(r'Guru Meditation|Backtrace:',s):raise SystemExit('Stopped: device panic detected')
  if predicate(s):return
  time.sleep(.2)
 raise SystemExit('Stopped: acoustic input/reply timeout; no retries or volume changes')
def say(s):subprocess.run(['say','-v','Tingting','-r','165',s],check=True)
if state(text())!='listening':
 before=completed(text());say('你好小智')
 wait(lambda s:state(s)=='listening',20)
 # Wake phrase itself can become a greeting turn; wait for its reply to finish.
 time.sleep(2)
 if state(text())=='speaking':wait(lambda s:state(s)=='listening',20)
for i in range(1,11):
 if state(text())=='idle':
  say('你好小智');wait(lambda s:state(s)=='listening',20);time.sleep(2)
  if state(text())=='speaking':wait(lambda s:state(s)=='listening',20)
 wait(lambda s:state(s)=='listening',20)
 before=completed(text())
 say(f'请只回答一个数字，{i}加一等于几？')
 wait(lambda s:completed(s)>before,30)
 print(f'Acoustic round {i}/10 completed',flush=True)
 time.sleep(.6)
print('PASS10 acoustic input→cloud reply→listening cycles',flush=True)
