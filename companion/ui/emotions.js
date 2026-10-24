(() => {
  const catalog=window.RoundEyesEmotionCatalog;
  const byKey=new Map(catalog.items.map(item=>[item.key,item]));
  const format=key=>byKey.has(key)?`${key} · ${byKey.get(key).zh}`:(key||'—');
  const ns='http://www.w3.org/2000/svg';
  let tooltip,anchor;
  function hide(){if(anchor)anchor.removeAttribute('aria-describedby');anchor=undefined;if(tooltip)tooltip.hidden=true;}
  function show(target){
    const item=byKey.get(target.dataset.emotionPreview);if(!item){hide();return;}
    if(!tooltip){tooltip=document.createElement('div');tooltip.id='emotion-tooltip';tooltip.className='emotion-tooltip';tooltip.setAttribute('role','tooltip');document.body.append(tooltip);}
    if(anchor!==target)hide();anchor=target;target.setAttribute('aria-describedby',tooltip.id);tooltip.replaceChildren();
    const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 240 240');svg.setAttribute('aria-label',format(item.key)+'眼型预览');svg.setAttribute('role','img');
    const face=document.createElementNS(ns,'circle');face.setAttribute('cx','120');face.setAttribute('cy','120');face.setAttribute('r','119');face.setAttribute('fill','#000');svg.append(face);
    for(const contour of item.poses[0].paths){const path=document.createElementNS(ns,'path');path.setAttribute('d',contour);path.setAttribute('fill','#fff');svg.append(path);}
    const title=document.createElement('strong');title.textContent=format(item.key);const caption=document.createElement('small');caption.textContent='固件同源代表眼型 · 设备含平滑过渡与眨眼';tooltip.append(svg,title,caption);tooltip.hidden=false;
    const r=target.getBoundingClientRect(),w=tooltip.offsetWidth,h=tooltip.offsetHeight;
    tooltip.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left+r.width/2-w/2))+'px';
    tooltip.style.top=(r.bottom+h+12<=innerHeight?r.bottom+8:Math.max(8,r.top-h-8))+'px';
  }
  function badge(key){
    if(!byKey.has(key)){const text=document.createElement('span');text.textContent=key||'—';return text;}
    const button=document.createElement('button');button.type='button';button.className='emotion-label';button.dataset.emotionPreview=key;button.textContent=format(key);button.setAttribute('aria-label',format(key)+'，查看眼型预览');return button;
  }
  const targetOf=event=>event.target instanceof Element?event.target.closest('[data-emotion-preview]'):null;
  document.addEventListener('pointerover',event=>{const target=targetOf(event);if(target&&target!==anchor)show(target);});
  document.addEventListener('pointerout',event=>{const target=targetOf(event);if(target&&!target.contains(event.relatedTarget))hide();});
  document.addEventListener('focusin',event=>{const target=targetOf(event);if(target)show(target);});
  document.addEventListener('focusout',event=>{if(targetOf(event))hide();});
  document.addEventListener('click',event=>{const target=targetOf(event);if(target&&target.tagName==='BUTTON'){event.stopPropagation();show(target);}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
  window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);window.addEventListener('roundeyes:page',hide);
  new MutationObserver(()=>{if(anchor&&!anchor.isConnected)hide();}).observe(document.documentElement,{childList:true,subtree:true});
  function animation(plan){
    const host=document.createElement('div');host.className='animation-preview';
    const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 240 240');svg.setAttribute('aria-label','组合动画编排预览');svg.setAttribute('role','img');svg.style.width='180px';
    const face=document.createElementNS(ns,'circle');for(const [k,v]of Object.entries({cx:120,cy:120,r:119,fill:'#000'}))face.setAttribute(k,v);svg.append(face);
    const paths=[0,1].map(()=>{const p=document.createElementNS(ns,'path');p.setAttribute('fill','#fff');svg.append(p);return p;});
    const readout=document.createElement('p'),button=document.createElement('button'),hint=document.createElement('small');button.textContent='预览动画';hint.textContent='编排示意 · 真实过渡与帧率以圆屏为准';host.append(svg,readout,button,hint);
    let running=false,start=0,points;
    const total=plan.steps.reduce((n,s)=>n+s.duration_ms,0);
    const draw=(elapsed,dt)=>{
      let age=elapsed,index=0;while(index+1<plan.steps.length&&age>=plan.steps[index].duration_ms){age-=plan.steps[index].duration_ms;index++;}
      const step=plan.steps[index],item=byKey.get(step.emotion);if(!item)return;
      const shape=item.poses[0].paths.map(d=>(d.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number));
      const amount=1-Math.exp(-dt/Math.max(40,step.transition_ms/4));if(!points)points=shape.map(p=>p.slice());
      const blinkTime=step.blink_once&&age<240?age:(step.blink>0?(elapsed%(4500/step.blink)):-1);
      const blink=blinkTime>=0&&blinkTime<240?(blinkTime<70?1-blinkTime/70:Math.min(1,(blinkTime-70)/170)):1;
      paths.forEach((path,e)=>{const target=shape[e],cx=e?156:84;const values=target.map((v,j)=>j%2?120+(v-120)*step.scale* Math.max(.08,blink)+(step.look_y||0)*10+step.shake*1.6*Math.sin(elapsed*.057):cx+(v-cx)*step.scale+(step.look_x||0)*12+step.shake*2.8*Math.sin(elapsed*.045));
        points[e]=points[e].map((v,j)=>v+(values[j]-v)*amount);path.setAttribute('d',points[e].map((v,j)=>(j%2?' ':j?'L':'M')+v.toFixed(2)).join('')+'Z');});
      readout.textContent=`第 ${index+1} / ${plan.steps.length} 步 · ${format(step.emotion)} · ${(elapsed/1000).toFixed(1)} / ${(total/1000).toFixed(1)} 秒`;
    };
    draw(0,1000);button.onclick=()=>{if(running){running=false;button.textContent='重新预览';return;}running=true;start=performance.now();points=undefined;let previous=start;button.textContent='停止预览';
      const tick=now=>{if(!running||!host.isConnected){running=false;return;}const elapsed=Math.min(total-1,now-start);draw(elapsed,Math.min(100,now-previous));previous=now;if(now-start>=total){running=false;button.textContent='重新预览';return;}requestAnimationFrame(tick);};requestAnimationFrame(tick);
    };return host;
  }
  window.RoundEyesEmotionUI={format,badge,show,hide,animation,has:key=>byKey.has(key)};
})();
