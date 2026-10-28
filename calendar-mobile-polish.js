(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  let eventDrag = null;
  let suppressCalendarClickUntil = 0;
  let dragTip = null;
  const HOLD_MS = 430;
  const MOVE_SLOP = 10;

  function cancelDrag(state, restore = true) {
    if (!state) return;
    clearTimeout(state.timer);
    state.el.classList.remove("ww-longpress-armed");
    if (restore) {
      state.el.style.transform = state.saved.transform;
      state.el.style.opacity = state.saved.opacity;
      state.el.style.zIndex = state.saved.zIndex;
      state.el.style.pointerEvents = state.saved.pointerEvents;
    }
    if (dragTip) dragTip.style.display = "none";
  }
  function getDragTip() {
    if (!dragTip) {
      dragTip = document.createElement("div");
      dragTip.className = "ww-drag-tip";
      document.body.appendChild(dragTip);
    }
    return dragTip;
  }
  function dateLabel(key) {
    const p = String(key || "").split("-").map(Number);
    if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return key || "";
    const d = new Date(p[0], p[1] - 1, p[2]);
    return new Intl.DateTimeFormat(document.documentElement.lang === "en" ? "en-US" : "ru-RU",
      { weekday: "short", day: "numeric", month: "short" }).format(d);
  }
  function dropColumn(x) {
    return $$(".wc").find(c => { const r = c.getBoundingClientRect(); return x >= r.left && x < r.right; }) || null;
  }
  document.addEventListener("pointerdown", e => {
    const card = e.target instanceof Element ? e.target.closest(".we") : null;
    if (!card || e.pointerType !== "touch" || e.button > 0 || e.isPrimary === false) return;
    const r = card.getBoundingClientRect();
    const s = eventDrag = {
      pointerId: e.pointerId, el: card, id: card.dataset.oe, oldDate: card.dataset.od,
      x: e.clientX, y: e.clientY, offsetY: e.clientY - r.top, armed: false, dragging: false,
      saved: { transform: card.style.transform, opacity: card.style.opacity, zIndex: card.style.zIndex, pointerEvents: card.style.pointerEvents },
      timer: null
    };
    // Stop the app's old immediate-drag handler for touch pointers.
    e.stopPropagation();
    s.timer = setTimeout(() => {
      if (eventDrag !== s) return;
      s.armed = true;
      card.classList.add("ww-longpress-armed");
      try { navigator.vibrate && navigator.vibrate(9); } catch (_) {}
      const root = $("#pg-cal");
      if (root) root.dispatchEvent(new Event("touchcancel", { bubbles: true }));
    }, HOLD_MS);
  }, true);

  document.addEventListener("pointermove", e => {
    const s = eventDrag;
    if (!s || e.pointerId !== s.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (!s.armed) {
      if (Math.hypot(dx, dy) > MOVE_SLOP) { cancelDrag(s); eventDrag = null; }
      return;
    }
    if (!s.dragging && Math.hypot(dx, dy) < 6) return;
    if (!s.dragging) {
      s.dragging = true;
      s.el.style.pointerEvents = "none"; s.el.style.zIndex = "40"; s.el.style.opacity = ".88";
    }
    s.el.style.transform = "translate3d(" + dx + "px," + dy + "px,0)";
    const c = dropColumn(e.clientX), tip = getDragTip();
    if (c) {
      const r = c.getBoundingClientRect(), hh = r.height / 24;
      let m = Math.round(((e.clientY - s.offsetY - r.top) / hh * 60) / 15) * 15;
      m = Math.max(0, Math.min(1425, m));
      const time = n => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
      tip.textContent = dateLabel(c.dataset.col) + " · " + time(m);
    } else tip.textContent = "Перемести на нужный день";
    tip.style.display = "block"; tip.style.left = (e.clientX + 14) + "px"; tip.style.top = (e.clientY + 14) + "px";
  }, true);

  function finishDrag(e, cancelled) {
    const s = eventDrag;
    if (!s || e.pointerId !== s.pointerId) return;
    clearTimeout(s.timer); e.stopPropagation(); eventDrag = null;
    s.el.classList.remove("ww-longpress-armed");
    if (dragTip) dragTip.style.display = "none";
    if (cancelled || !s.dragging) { cancelDrag(s); return; }

    e.preventDefault();
    suppressCalendarClickUntil = Date.now() + 700;
    const c = dropColumn(e.clientX);
    if (!c) { cancelDrag(s); if (typeof window.renderCal === "function") window.renderCal(); return; }
    const r = c.getBoundingClientRect(), hh = r.height / 24;
    let m = Math.round(((e.clientY - s.offsetY - r.top) / hh * 60) / 15) * 15;
    m = Math.max(0, Math.min(1425, m));
    // Keep recurring-event behavior in the app's existing move function.
    if (typeof window.moveEv === "function") window.moveEv(s.id, s.oldDate, c.dataset.col, m);
    else if (typeof window.renderCal === "function") window.renderCal();
  }
  document.addEventListener("pointerup", e => finishDrag(e, false), true);
  document.addEventListener("pointercancel", e => finishDrag(e, true), true);

  let draft = null, draftTimer = null;
  function clearDraft() {
    clearTimeout(draftTimer); draftTimer = null;
    if (draft) draft.remove();
    draft = null;
    document.body.classList.remove("ww-calendar-draft-active");
  }
  document.addEventListener("click", e => {
    if (Date.now() < suppressCalendarClickUntil && e.target instanceof Element && e.target.closest("#pg-cal")) {
      e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    const target = e.target instanceof Element ? e.target : null;
    if (!target || target.closest(".we")) return;
    const column = target.closest("#pg-cal .wc");
    if (!column) return;
    clearDraft();
    const r = column.getBoundingClientRect(), hh = r.height / 24;
    const hour = Math.max(0, Math.min(22, Math.floor((e.clientY - r.top) / hh)));
    const time = n => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
    draft = document.createElement("div");
    draft.className = "ww-event-outline";
    draft.setAttribute("aria-hidden", "true");
    draft.style.top = (hour * hh) + "px"; draft.style.height = hh + "px";
    const label = document.createElement("span");
    label.textContent = time(hour * 60) + "–" + time((hour + 1) * 60);
    draft.appendChild(label); column.appendChild(draft);
    document.body.classList.add("ww-calendar-draft-active");
    draftTimer = setTimeout(() => { if (!$("#ov")?.classList.contains("on")) clearDraft(); }, 1800);
  }, true);

  const overlay = $("#ov");
  if (overlay) new MutationObserver(() => {
    if (!overlay.classList.contains("on")) clearDraft();
  }).observe(overlay, { attributes: true, attributeFilter: ["class"] });

  // Render the neighbour offscreen, then let both pages track the user's finger.
  let swipe = null;
  const isEditable = el => !!(el && el.closest('input,textarea,select,[contenteditable="true"],a'));
  const blockedSwipeTarget = el => !!(el && el.closest('button,.we,.ci,.wh,[data-oe],[data-oh],.chk'));
  function pageRoot(target) {
    if (!(target instanceof Element)) return null;
    const root = target.closest("#pg-cal, #pg-tasks");
    return root && root.classList.contains("on") ? root : null;
  }
  function previewMarkup(root, kind, step) {
    const bridge = window.__wwMobileNavigationBridge;
    if (!bridge || typeof bridge.preview !== "function") return {can:false,html:""};
    const id=root.id, width=Math.max(1,root.getBoundingClientRect().width);
    const sandbox=document.createElement("div");
    sandbox.id=id;sandbox.className=root.className;
    const height=Math.max(1,root.getBoundingClientRect().height);
    sandbox.style.cssText="position:absolute!important;left:-100000px!important;top:0!important;width:"+width+"px!important;height:"+height+"px!important;min-height:0!important;max-width:none!important;box-sizing:border-box!important;visibility:hidden!important;pointer-events:none!important;overflow:hidden!important;z-index:-1!important";
    root.id=id+"-live";
    root.parentNode.insertBefore(sandbox,root);
    try { const result=bridge.preview(kind,step); return result&&result.can?result:{can:false,html:""}; }
    finally { sandbox.remove();root.id=id; }
  }
  function scrollAtEdge(root,dx) {
    if(root.id!=="pg-cal")return true;
    const viewport=root.querySelector(".wcard");
    if(!viewport)return true;
    const max=Math.max(0,viewport.scrollWidth-viewport.clientWidth);
    if(dx<0&&viewport.scrollLeft<max-2)return false;
    if(dx>0&&viewport.scrollLeft>2)return false;
    return true;
  }
  function restoreSwipeStage(s) {
    if(!s||!s.track||!s.track.isConnected)return;
    s.root.style.overflow=s.saved.overflow;s.root.style.position=s.saved.position;
    s.root.style.touchAction=s.saved.touchAction;s.root.style.minHeight=s.saved.minHeight;
    const nodes=Array.from(s.currentPanel.childNodes);
    s.track.remove();nodes.forEach(node=>s.root.appendChild(node));
  }
  function setTrackX(s,x,animate) {
    s.track.style.transition=animate?"transform 245ms cubic-bezier(.22,.8,.22,1)":"none";
    s.track.style.transform="translate3d("+x+"px,0,0)";s.position=x;
  }
  function makeSwipeStage(s,step) {
    if(s.stage)return true;
    const result=previewMarkup(s.root,s.kind,step);if(!result.can)return false;
    const width=Math.max(1,s.root.getBoundingClientRect().width),track=document.createElement("div");
    track.className="ww-swipe-track";track.style.width=(width*2)+"px";
    track.style.transform="translate3d("+(step>0?0:-width)+"px,0,0)";track.style.transition="none";
    const current=document.createElement("div"),preview=document.createElement("div");
    current.className="ww-swipe-panel ww-swipe-current";
    preview.className="ww-swipe-panel ww-swipe-preview";preview.innerHTML=result.html;
    s.saved={overflow:s.root.style.overflow,position:s.root.style.position,touchAction:s.root.style.touchAction,minHeight:s.root.style.minHeight};
    s.root.style.overflow="hidden";s.root.style.position="relative";s.root.style.touchAction="pan-y";s.root.style.minHeight="1px";
    while(s.root.firstChild)current.appendChild(s.root.firstChild);
    if(step>0){track.append(current,preview);s.currentPanel=current;}else{track.append(preview,current);s.currentPanel=current;}
    s.previewPanel=preview;s.root.appendChild(track);
    for(const panel of [current,preview]){
      panel.style.flex="0 0 "+width+"px";panel.style.width=width+"px";panel.style.minWidth=width+"px";
      panel.style.maxWidth=width+"px";panel.style.boxSizing="border-box";panel.style.alignSelf="stretch";
      if(s.kind==="cal"){panel.style.display="flex";panel.style.flexDirection="column";panel.style.height="100%";panel.style.minHeight="0";}
    }
    Object.assign(track.style,{display:"flex",flexFlow:"row nowrap",alignItems:"stretch",gap:"0",margin:"0",padding:"0",maxWidth:"none",willChange:"transform"});
    s.track=track;s.width=width;s.step=step;s.startPosition=step>0?0:-width;s.position=s.startPosition;s.stage=true;
    return true;
  }
  function finishSwipe(s,commit) {
    if(!s||!s.stage)return;
    s.finished=true;
    const target=commit?(s.step>0?-s.width:0):s.startPosition;
    const done=()=>{
      if(!s.track||!s.track.isConnected)return;
      s.track.removeEventListener("transitionend",onEnd);clearTimeout(s.fallback);
      if(commit){
        s.previewPanel.remove();
        s.root.style.overflow=s.saved.overflow;s.root.style.position=s.saved.position;
        s.root.style.touchAction=s.saved.touchAction;s.root.style.minHeight=s.saved.minHeight;
        const bridge=window.__wwMobileNavigationBridge;
        if(!bridge||!bridge.move(s.kind,s.step))restoreSwipeStage(s);
      }else restoreSwipeStage(s);
    };
    const onEnd=e=>{if(e.target===s.track&&e.propertyName==="transform")done();};
    s.track.addEventListener("transitionend",onEnd);s.fallback=setTimeout(done,310);
    setTrackX(s,target,true);
  }
  document.addEventListener("touchstart",e=>{
    const root=pageRoot(e.target);if(!root)return;
    e.stopPropagation();
    if(root.classList.contains("swipe-busy")||e.touches.length!==1||isEditable(e.target)||blockedSwipeTarget(e.target))return;
    const t=e.touches[0];swipe={root,kind:root.id==="pg-cal"?"cal":"tasks",x:t.clientX,y:t.clientY,stage:false,finished:false,dx:0,track:null};
  },{capture:true,passive:true});
  document.addEventListener("touchmove",e=>{
    const s=swipe;if(!s||e.touches.length!==1)return;
    const t=e.touches[0],dx=t.clientX-s.x,dy=t.clientY-s.y;
    if(!s.stage){
      if(Math.abs(dy)>Math.max(12,Math.abs(dx)*1.15)){swipe=null;return;}
      if(Math.abs(dx)<12||Math.abs(dx)<Math.abs(dy)*1.15)return;
      if(!scrollAtEdge(s.root,dx)||!makeSwipeStage(s,dx<0?1:-1)){swipe=null;return;}
    }
    if(s.stage&&!s.finished){
      e.preventDefault();e.stopPropagation();s.dx=dx;
      const x=s.step>0?Math.max(-s.width,Math.min(0,dx)):Math.max(-s.width,Math.min(0,-s.width+dx));
      setTrackX(s,x,false);
    }
  },{capture:true,passive:false});
  document.addEventListener("touchend",e=>{
    const root=pageRoot(e.target);if(root)e.stopPropagation();
    const s=swipe;if(!s)return;swipe=null;if(!s.stage)return;
    e.preventDefault();e.stopPropagation();
    const t=e.changedTouches[0],dx=t.clientX-s.x,dy=t.clientY-s.y;
    const commit=Math.abs(dx)>=Math.max(56,s.width*.18)&&Math.abs(dx)>Math.abs(dy)*1.2&&Math.sign(dx)===(s.step>0?-1:1);
    finishSwipe(s,commit);
  },{capture:true,passive:false});
  document.addEventListener("touchcancel",e=>{
    const root=pageRoot(e.target);if(root)e.stopPropagation();
    const s=swipe;swipe=null;if(s&&s.stage)finishSwipe(s,false);
  },{capture:true,passive:true});

  // In standalone mode, Back closes an open sheet first and otherwise keeps the PWA alive.
  const standalone = !!((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    navigator.standalone === true);
  if (standalone && window.history && typeof window.history.pushState === "function") {
    const armBackGuard = () => {
      try { window.history.pushState({ wildWorkspaceStayOpen: true }, "", window.location.href); } catch (_) {}
    };
    armBackGuard();
    window.addEventListener("popstate", () => {
      const modal = $("#ov");
      if (modal && modal.classList.contains("on")) {
        if (typeof window.requestModalClose === "function") window.requestModalClose();
        else { const close = modal.querySelector("[data-close]"); if (close) close.click(); }
      }
      armBackGuard();
    });
  }

  // Restore the weekly viewport on rerenders, and centre it on the current time
  // whenever the user deliberately navigates to another week.
  function centerWeeklyTimeline(root) {
    const card=root&&root.querySelector(".wcard");
    if(!card)return;
    const row=card.querySelector(".hr");
    const hourHeight=row?row.getBoundingClientRect().height:48;
    const now=new Date(),currentHours=now.getHours()+now.getMinutes()/60;
    const sticky=card.querySelector(".sth"),stickyHeight=sticky?sticky.getBoundingClientRect().height:0;
    const target=stickyHeight+8+currentHours*hourHeight-card.clientHeight/2;
    card.scrollTop=Math.max(0,Math.min(target,card.scrollHeight-card.clientHeight));
  }
  const originalRenderCal=window.renderCal;
  if(typeof originalRenderCal==="function"){
    window.renderCal=function(...args){
      const root=document.getElementById("pg-cal");
      const oldCard=root&&root.querySelector(".wcard"),oldScroll=oldCard?oldCard.scrollTop:null;
      const result=originalRenderCal.apply(this,args);
      const active=document.getElementById("pg-cal");
      const week=!!(active&&active.querySelector('[data-cv="week"].on'));
      if(week)requestAnimationFrame(()=>{
        const card=active.querySelector(".wcard");
        if(!card)return;
        if(oldScroll!==null)card.scrollTop=oldScroll;
        else centerWeeklyTimeline(active);
      });
      return result;
    };
  }
  const navBridge=window.__wwMobileNavigationBridge;
  if(navBridge&&typeof navBridge.move==="function"){
    const originalMove=navBridge.move.bind(navBridge);
    navBridge.move=function(kind,step){
      const result=originalMove(kind,step);
      if(kind==="cal"&&result){
        const root=document.getElementById("pg-cal");
        if(root&&root.querySelector('[data-cv="week"].on'))requestAnimationFrame(()=>centerWeeklyTimeline(document.getElementById("pg-cal")));
      }
      return result;
    };
  }

  // Desktop keyboard shortcuts.
  document.addEventListener("keydown",event=>{
    if(!window.matchMedia("(min-width:721px)").matches||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
    const target=event.target;
    if(target instanceof Element&&target.closest('input,textarea,select,[contenteditable="true"]'))return;
    const modal=$("#ov");if(modal&&modal.classList.contains("on"))return;
    if(event.code==="Slash"){
      const search=$("#srch"),input=$("#q");
      if(search&&input&&!search.classList.contains("hide")){event.preventDefault();input.focus();input.select();}
      return;
    }
    const actions={
      KeyT:()=>typeof window.formT==="function"&&window.formT(),
      KeyE:()=>typeof window.formE==="function"&&window.formE(),
      KeyS:()=>typeof window.go==="function"&&window.go("stats"),
      KeyH:()=>typeof window.go==="function"&&window.go("home"),
      KeyC:()=>typeof window.go==="function"&&window.go("cal"),
      KeyG:()=>typeof window.go==="function"&&window.go("tasks"),
      KeyP:()=>typeof window.go==="function"&&window.go("profile")
    };
    if(actions[event.code]){event.preventDefault();actions[event.code]();}
  });
  // Align browser/system UI metadata with the selected app theme where supported.
  function syncSystemThemeColor(){
    const root=document.documentElement,style=getComputedStyle(root);
    const background=style.getPropertyValue("--bg").trim()||"#0e1411";
    const scheme=root.dataset.theme==="light"?"light":"dark";
    const signature=background+"|"+scheme;
    const meta=$('meta[name="theme-color"]');
    if(root.dataset.wwSystemThemeSignature!==signature){
      if(root.style.colorScheme!==scheme)root.style.colorScheme=scheme;
      if(root.style.backgroundColor!==background)root.style.backgroundColor=background;
      if(meta&&meta.content!==background)meta.setAttribute("content",background);
      root.dataset.wwSystemThemeSignature=signature;
    } else if(meta&&meta.content!==background)meta.setAttribute("content",background);
  }
  syncSystemThemeColor();
  new MutationObserver(syncSystemThemeColor).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme","class","style"]});
  window.addEventListener("pageshow",syncSystemThemeColor,{passive:true});
  window.addEventListener("focus",syncSystemThemeColor,{passive:true});

})();