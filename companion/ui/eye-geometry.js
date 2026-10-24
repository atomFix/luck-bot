// Original pill geometry and spherical facing; parameters are exported from firmware.
(() => {
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  const directions=[
    {key:'auto',label:'默认姿态',x:0,y:0},{key:'left',label:'左看',x:-1,y:0},{key:'right',label:'右看',x:1,y:0},
    {key:'up',label:'抬头',x:0,y:-1},{key:'down',label:'低头',x:0,y:1},
    {key:'upper_left',label:'左上',x:-1,y:-1},{key:'upper_right',label:'右上',x:1,y:-1},
    {key:'lower_left',label:'左下',x:-1,y:1},{key:'lower_right',label:'右下',x:1,y:1},
  ];
  function facingLabel(pose){
    const f=pose.facing,h=f.yaw<-.1?'左':f.yaw>.1?'右':'',v=f.pitch<-.09?'下':f.pitch>.09?'上':'';
    return (h+v||'正面')+(Math.abs(f.roll)>.08?' · 轻歪头':'');
  }
  function gestureValue(gesture,age,duration){
    if(!gesture||gesture==='none'||duration<2800||age>=duration)return 0;
    const u=(age/duration-.08)/.72;if(u<=0||u>=1)return 0;
    const ease=x=>{x=clamp(x,0,1);return x*x*x*(x*(x*6-15)+10);};
    return Math.sin(4*Math.PI*u)*(1-.2*u)*ease(u/.12)*ease((1-u)/.18);
  }
  function project(pose,step={},elapsed=0,moving=false){
    const sphereRadius=pose.radius??104,extent=pose.extent??77,giant=clamp((extent-77)/40,0,1),yawLimit=.65-.49*giant,pitchLimit=.38-.26*giant;
    const gesturing=step.gesture&&step.gesture!=='none',nod=step.gesture==='nod';
    const f=gesturing?{yaw:0,pitch:0,roll:0}:pose.facing,scale=step.scale??1,rate=step.blink??1;
    const gesture=moving?gestureValue(step.gesture,elapsed,step.duration_ms)*(1-.7*giant):0;
    const yaw=clamp((Math.abs(step.look_x||0)>.001?step.look_x*.55:f.yaw)+(moving&&!gesturing?.035*Math.sin(elapsed*.0008+pose.id*.7):0)+(!nod?.38*gesture:0),-yawLimit,yawLimit);
    const pitch=clamp((Math.abs(step.look_y||0)>.001?-step.look_y*.36:f.pitch)+(moving&&!gesturing?.02*Math.sin(elapsed*.0006):0)+(nod?-.25*gesture:0),-pitchLimit,pitchLimit),roll=clamp(f.roll+(!nod?-.035*gesture:0),-.3,.3);
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
    let blink=1;
    const blinkAge=step.blink_once&&elapsed<240?elapsed:rate>0&&elapsed>=3500?(elapsed-3500)%(4500/rate):-1;
    if(moving&&blinkAge>=0&&blinkAge<240)blink=blinkAge<70?1-blinkAge/70:Math.min(1,(blinkAge-70)/170);
    let maxY=1;
    const result=pose.params.map(([cx,cyEye,width,height,angle,power])=>{
      const elastic=gesture*gesture;width*=scale*(1+.025*elastic);height=Math.max(5,height*scale*blink*(1-.045*elastic));
      const radius=Math.min(width,height)/2,spanX=Math.max(0,(width-height)/2),spanY=Math.max(0,(height-width)/2),capsule=clamp((power-2)/2,0,1),points=[];
      for(let i=0;i<48;i++){
        const theta=i*Math.PI*2/48,co=Math.cos(theta),si=Math.sin(theta);
        const x=co*width/2*(1-capsule)+(co*radius+(i<12||i>=36?spanX:-spanX))*capsule;
        const y=si*height/2*(1-capsule)+(si*radius+(i<24?spanY:-spanY))*capsule;
        const shake=moving?(step.shake||0):0;
        let px=(cx+shake*3.2*Math.sin(elapsed*.045)+x*Math.cos(angle)-y*Math.sin(angle)-120)/sphereRadius;
        let py=(cyEye+shake*2.3*Math.sin(elapsed*.057)+x*Math.sin(angle)+y*Math.cos(angle)-120)/sphereRadius;
        const length=Math.hypot(px,py);if(length>.94){px*=.94/length;py*=.94/length;}
        const z=Math.sqrt(Math.max(0,1-px*px-py*py)),tx=px*cy+z*sy,tz=z*cy-px*sy,ty=py*cp-tz*sp;
        const outX=(tx*cr-ty*sr)*sphereRadius,outY=(tx*sr+ty*cr)*sphereRadius;
        points.push(120+outX,120+outY);maxY=Math.max(maxY,Math.abs(outY));
      }
      return points;
    });
    const fit=Math.min(1,extent/maxY);
    return fit<1?result.map(points=>points.map(v=>120+(v-120)*fit)):result;
  }
  window.RoundEyesGeometry={project,directions,facingLabel,gestureValue};
})();
