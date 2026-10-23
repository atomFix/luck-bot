#!/usr/bin/env python3
"""Validate two OTA selection records and print selected application offset."""
import pathlib,struct,sys,zlib
raw=pathlib.Path(sys.argv[1]).read_bytes()
if len(raw)!=8192:raise SystemExit('Expected exactly 8192 OTA bytes')
valid=[]
for off in (0,4096):
 seq,state,crc=struct.unpack_from('<I20xII',raw,off)
 if 0<seq<0xffffffff and state in (0,1,2,0xffffffff) and crc==zlib.crc32(raw[off:off+4],0xffffffff):valid.append(seq)
if not valid:raise SystemExit('No valid OTA record; refusing to guess')
seq=max(valid);slot=(seq-1)%2
print(f'OTA sequence={seq}; active slot=ota_{slot}; application offset=0x{0x100000+slot*0x600000:x}')
