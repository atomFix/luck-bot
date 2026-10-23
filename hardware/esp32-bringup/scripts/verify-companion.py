#!/usr/bin/env python3
"""Report recorded acceptance without converting pending hardware checks into passes."""
import json,pathlib,hashlib
root=pathlib.Path(__file__).resolve().parents[3]
report=json.loads((root/'companion/verification.json').read_text())
for name,item in report['checks'].items():
 assert item['status'] in ('passed','failed','pending','partial','passed-with-documented-limits')
 print(f"{name}: {item['status']}")
image=root/'hardware/esp32-bringup/firmware/xiaozhi-1.9.4-s3-companion.bin'
if image.exists():print('firmware sha256:',hashlib.sha256(image.read_bytes()).hexdigest())
print('Overall:',report['overall'])
