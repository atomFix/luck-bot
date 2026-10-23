"""Render shared C++ model frames into a local demonstration video (requires Pillow/ffmpeg)."""
import json, pathlib, subprocess
from PIL import Image, ImageDraw
root=pathlib.Path(__file__).resolve().parents[1]
output=root.parents[1]/'output/xiaozhi-character-design/eyes-motion.mp4'
model=subprocess.Popen([str(root/'build-host/model_host')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
video=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pixel_format','rgb24','-video_size','480x480','-framerate','25','-i','-','-an','-c:v','libx264','-pix_fmt','yuv420p',str(output)],stdin=subprocess.PIPE)
steps={0:'behavior idle',50:'behavior waking',70:'behavior listening',120:'behavior waiting',165:'behavior speaking',170:'emotion happy',210:'behavior listening',230:'behavior waiting',250:'behavior speaking',260:'emotion confused',285:'behavior idle',310:'emotion sleepy',330:'behavior listening',350:'behavior waiting',375:'behavior listening',400:'behavior speaking',430:'behavior idle',450:'emotion neutral',470:'behavior reconnecting',495:'behavior idle'}
try:
 for i in range(500):
  if i in steps:model.stdin.write(steps[i]+'\n');model.stdin.flush()
  if 165<=i<210 or 250<=i<285:model.stdin.write('energy '+str((i%9)/8)+'\n');model.stdin.flush()
  f=json.loads(model.stdout.readline());im=Image.new('RGB',(960,960),'black');draw=ImageDraw.Draw(im)
  for eye in f['eyes']:draw.polygon([(x*4,y*4) for x,y in eye],fill='white')
  video.stdin.write(im.resize((480,480),Image.Resampling.LANCZOS).tobytes())
finally:
 model.terminate();video.stdin.close();video.wait()
print(output)
