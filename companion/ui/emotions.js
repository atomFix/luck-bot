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
  window.RoundEyesEmotionUI={format,badge,show,hide,has:key=>byKey.has(key)};
})();
