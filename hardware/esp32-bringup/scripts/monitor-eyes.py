#!/usr/bin/env python3
"""Passive native USB monitor; deliberately never changes serial DTR/RTS."""
import os,select,sys,time,pathlib,errno
port=sys.argv[1] if len(sys.argv)>1 else '/dev/cu.usbmodem21201'
seconds=float(sys.argv[2]) if len(sys.argv)>2 else 650
output=pathlib.Path(sys.argv[3] if len(sys.argv)>3 else 'hardware/esp32-bringup/logs/eyes-boot-soak.log')
end=time.monotonic()+seconds
fd=None
with output.open('ab',buffering=0) as log:
 while time.monotonic()<end:
  if fd is None:
   try:fd=os.open(port,os.O_RDONLY|os.O_NONBLOCK|os.O_NOCTTY)
   except OSError:time.sleep(.2);continue
  try:
   ready,_,_=select.select([fd],[],[],.25)
   if ready:
    data=os.read(fd,65536)
    if data:log.write(data)
    else:os.close(fd);fd=None;time.sleep(.05)
  except OSError as e:
   if e.errno not in (errno.EAGAIN,errno.EWOULDBLOCK):os.close(fd);fd=None
if fd is not None:os.close(fd)
print(f'Passive capture complete: {output}')
