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

  // Intercept page-level touch navigation so it can use a real horizontal slide.
  let swipe = null;
  const isEditable = el => !!(el && el.closest('input,textarea,select,[contenteditable="true"],a'));
  function pageRoot(target) {
    if (!(target instanceof Element)) return null;
    const root = target.closest("#pg-cal, #pg-tasks");
    return root && root.classList.contains("on") ? root : null;
  }
  function changePageGroup(root, step) {
    if (root.id === "pg-cal") {
      const b = root.querySelector('[data-mv="' + step + '"]');
      if (b) b.click();
      return;
    }
    const tabs = $$(".bts [data-bk]", root);
    if (!tabs.length) return;
    let i = tabs.findIndex(b => b.classList.contains("on"));
    if (i < 0) i = 0;
    if (tabs[i + step]) tabs[i + step].click();
  }
  function animateSwipe(root, step) {
    if (!root || root.classList.contains("swipe-busy")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { changePageGroup(root, step); return; }
    root.classList.remove("swipe-exit-left", "swipe-exit-right", "swipe-enter-left", "swipe-enter-right");
    root.classList.add("swipe-busy");
    const exit = step > 0 ? "swipe-exit-left" : "swipe-exit-right";
    const enter = step > 0 ? "swipe-enter-right" : "swipe-enter-left";
    root.classList.add(exit);
    setTimeout(() => {
      root.classList.remove(exit);
      changePageGroup(root, step);
      void root.offsetWidth;
      root.classList.add(enter);
      setTimeout(() => root.classList.remove(enter, "swipe-busy"), 330);
    }, 210);
  }
  document.addEventListener("touchstart", e => {
    const root = pageRoot(e.target);
    if (!root || root.classList.contains("swipe-busy") || e.touches.length !== 1 || isEditable(e.target)) return;
    const t = e.touches[0]; swipe = { root, x: t.clientX, y: t.clientY };
    e.stopPropagation();
  }, true);
  document.addEventListener("touchend", e => {
    if (!swipe) return;
    const s = swipe; swipe = null; e.stopPropagation();
    if (e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (Math.abs(dx) < 58 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    animateSwipe(s.root, dx < 0 ? 1 : -1);
  }, true);
  document.addEventListener("touchcancel", e => {
    if (swipe) {
      const root = pageRoot(e.target);
      if (!root || root === swipe.root) swipe = null;
    }
    if (pageRoot(e.target)) e.stopPropagation();
  }, true);

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
})();