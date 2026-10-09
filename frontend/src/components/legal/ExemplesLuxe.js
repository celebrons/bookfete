// frontend/src/components/legal/ExemplesLuxe.js
//
// Refonte 2026-10-10 de la page "Exemples" (a partir de l'artefact Claude
// "Bookipix Exemples") : un album feuilletable en 3D au centre (page-flip),
// 4 albums fictifs complets (30 pages, un par format reel), jamais
// presentes comme venant d'un vrai client (voir exemplesData.js). Vraies
// photos libres de droits (Wikimedia Commons), pas de fausses illustrations.
//
// Port volontairement IMPERATIF plutot que declaratif pour la zone
// "visionneur" : page-flip (bibliotheque tierce) prend possession directe
// du DOM de ses pages des `loadFromHTML` et les anime lui-meme hors du
// cycle de rendu React — c'est exactement ainsi que fonctionne l'artefact
// d'origine (vanilla JS + innerHTML), et c'est la seule integration fiable
// avec une bibliotheque de ce type. Tout est scope sous rootRef (jamais
// `document.getElementById`) pour rester propre si la page est demontee/
// remontee par React Router.
//
// 2026-10-11 (chantier bilingue) : la bascule FR/EN fonctionne aussi ici.
// La zone JSX statique (hero, en-tetes de section, pied de page, modale
// zoom) est traduite normalement via useTranslation. La zone imperative
// (visionneur, galerie, legende...) ne re-rend jamais via React — elle est
// reconstruite a la main quand la langue change, via un PETIT effet separe
// qui depend de `i18n.language` (controllerRef, plus bas). Teste et
// corrige : un ecouteur direct `i18n.on('languageChanged', ...)` pose ici
// ne se declenchait JAMAIS de facon fiable pour le vrai changement de
// langue (seulement pour un evenement redondant au tout premier montage) —
// la dependance React `[i18n.language]`, elle, se declenche a coup sur,
// puisque react-i18next force deja un re-rendu du composant a chaque
// changement (verifie : le texte traduit en JSX, lui, suivait bien).
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageFlip } from 'page-flip';
import { buildFormats, LAST, PHOTOS, pageHTML } from './exemplesData';
import '../../styles/luxe-theme.css';
import './ExemplesLuxe.css';

const MINW = 260;
const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Caveat:wght@500;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Figtree:wght@400;500;600;700&display=swap';

export default function ExemplesLuxe() {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const { t, i18n } = useTranslation('exemples');
  // Pont entre le petit effet reactif ci-dessous (qui, lui, voit vraiment
  // les changements de langue, au moment ou React re-rend ce composant) et
  // les fonctions imperatives definies DANS le gros effet de montage
  // (jamais rappele directement par React). `currentLangRef` porte la
  // valeur de langue a utiliser : jamais relue en direct sur `i18n.language`
  // depuis l'interieur du gros effet, qui l'a vue changer de valeur ENTRE
  // deux lectures synchrones consecutives pendant les tests (course avec
  // initLanguagePreferenceSync, qui reagit aussi a onAuthStateChange) —
  // seule la valeur CAPTUREE ici, au moment ou React confirme le rendu
  // reactif, fait foi.
  const controllerRef = useRef(null);
  const mountedLangRef = useRef(i18n.language);
  const currentLangRef = useRef(i18n.language);

  useEffect(() => {
    if (i18n.language === mountedLangRef.current) return;
    mountedLangRef.current = i18n.language;
    currentLangRef.current = i18n.language;
    const ctrl = controllerRef.current;
    if (ctrl) ctrl.rebuildAll(ctrl.getFmtIndex());
  }, [i18n.language]);

  useEffect(() => {
    // Polices dediees a cette page uniquement (jamais chargees ailleurs sur
    // le site) : ajoutees a l'arrivee, retirees au depart — coherent avec
    // le chargement differe deja pratique partout ailleurs dans l'atelier.
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = FONTS_HREF;
    fontLink.dataset.exemplesFont = 'true';
    document.head.appendChild(fontLink);

    const root = rootRef.current;
    const $ = (s, r = root) => r.querySelector(s);
    const $$ = (s, r = root) => [...r.querySelectorAll(s)];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Toujours la traduction COURANTE (jamais celle du montage) : lit
    // currentLangRef (mis a jour par le petit effet reactif, voir plus
    // haut) plutot que `i18n.language` en direct — voir le commentaire sur
    // currentLangRef pour la course testee et contournee ici.
    const tr = (...args) => i18n.getFixedT(currentLangRef.current, 'exemples')(...args);
    const layLabel = (key) => tr(`gallery.items.${key}.label`);
    const pageOpts = (bare) => ({
      bare,
      collabEyebrow: tr('collab.eyebrow'),
      madeWith: tr('final.madeWith'),
      thanksTitle: tr('thanks.title'),
      thanksLead: tr('thanks.lead'),
      thanksFooter: tr('thanks.footer'),
      photoWord: (n) => tr('collab.photoWord', { count: n }),
      textWord: (n) => tr('collab.textWord', { count: n })
    });
    const renderPage = (s, i, fmt, bare) => pageHTML(s, i, fmt, layLabel(s.lay), pageOpts(bare));
    const pagesLabelBare = (sp) => (sp.length === 1
      ? (sp[0] === 0 ? tr('viewer.cover') : sp[0] === LAST ? tr('viewer.backCover') : tr('viewer.page', { n: sp[0] }))
      : tr('viewer.pagesPair', { a: sp[0], b: sp[1] }));

    let formats = buildFormats(tr);
    let pf = null;
    let fmt = formats[0];
    const state = { fmtIndex: 0, focus: null, lay: false, by: false, touched: false, intro: false };

    const stage = $('#ex-stage');
    const stagewrap = $('#ex-stagewrap');
    const viewer = $('#ex-viewer');
    let toastTimer = null;
    const toast = (m) => {
      const t2 = $('#ex-toast');
      t2.textContent = m; t2.classList.add('ex-on');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => t2.classList.remove('ex-on'), 3200);
    };

    function stageSize() {
      const availW = Math.max(260, stagewrap.clientWidth);
      const single = availW < MINW * 2;
      const sr = single ? fmt.ratio : 2 * fmt.ratio;
      const full = document.fullscreenElement === viewer;
      const maxH = full ? window.innerHeight - 230 : Math.min(window.innerHeight * 0.8, 780);
      let W = availW, H = W / sr;
      if (H > maxH) { H = maxH; W = H * sr; }
      stage.style.width = `${Math.floor(W)}px`; stage.style.height = `${Math.floor(H)}px`;
    }
    function applyFocus(r) {
      $$('[data-by]', r).forEach((e) => {
        const on = !!state.focus;
        e.classList.toggle('ex-dim', on && e.dataset.by !== state.focus);
        e.classList.toggle('ex-hit', on && e.dataset.by === state.focus);
      });
    }
    function setFocus(id) {
      state.focus = state.focus === id ? null : id;
      if (state.focus && !state.by) { state.by = true; syncToggles(); }
      applyFocus(stage); applyFocus($('#ex-zbook'));
      buildChipsState();
      $$('.ex-th', $('#ex-strip')).forEach((t2, i) => t2.classList.toggle('ex-hit', !!state.focus && fmt.pageSets[i].has(state.focus)));
      if (state.focus && pf) { state.touched = true; const p = fmt.first[state.focus]; if (p > 0) pf.flip(p); }
    }
    function syncToggles() {
      viewer.classList.toggle('ex-show-lay', state.lay);
      viewer.classList.toggle('ex-show-by', state.by);
      $('#ex-zoom').classList.toggle('ex-show-lay', state.lay);
      $('#ex-zoom').classList.toggle('ex-show-by', state.by);
      $('#ex-bLay').setAttribute('aria-pressed', state.lay);
      $('#ex-bBy').setAttribute('aria-pressed', state.by);
    }
    function spreadOf(c) {
      if (pf && pf.getOrientation && pf.getOrientation() === 'portrait') return [c];
      if (c === 0) return [0];
      if (c >= LAST) return [LAST];
      return c % 2 ? [c, c + 1] : [c - 1, c];
    }
    function updateUI() {
      if (!pf) return;
      const c = pf.getCurrentPageIndex();
      const sp = spreadOf(c);
      $('#ex-vPages').textContent = `${pagesLabelBare(sp)} ${tr('viewer.of', { total: LAST - 1 })}`;
      $('#ex-prev').disabled = c <= 0;
      $('#ex-next').disabled = sp[sp.length - 1] >= LAST;
      $$('.ex-th', $('#ex-strip')).forEach((t2, i) => t2.classList.toggle('ex-on', sp.includes(i)));
      const on = $('.ex-th.ex-on', $('#ex-strip'));
      if (on) { const s = $('#ex-strip'); s.scrollTo({ left: on.offsetLeft - s.clientWidth / 2 + on.clientWidth / 2, behavior: reduce ? 'auto' : 'smooth' }); }
      const closed = sp.length === 1 && (sp[0] === 0 || sp[0] === LAST) && pf.getOrientation() === 'landscape';
      stage.style.transform = closed ? (sp[0] === 0 ? 'translateX(-25%)' : 'translateX(25%)') : 'none';
    }
    function buildThumbs() {
      const s = $('#ex-strip');
      s.innerHTML = fmt.pages.map((sp, i) => `<button class="ex-th" data-i="${i}" aria-label="${i === 0 ? tr('viewer.cover') : i === LAST ? tr('viewer.backCover') : tr('viewer.page', { n: i })}"><div class="ex-tpg" style="width:${(62 * fmt.ratio).toFixed(1)}px">${renderPage(sp, i, fmt, true)}</div><small>${i === 0 ? tr('viewer.coverShort') : i === LAST ? tr('viewer.backCoverShort') : i}</small></button>`).join('');
      $$('.ex-th', s).forEach((b) => b.addEventListener('click', () => { state.touched = true; pf && pf.flip(+b.dataset.i); }));
    }
    function buildChipsState() {
      $$('[data-pid]', root).forEach((b) => b.setAttribute('aria-pressed', state.focus === b.dataset.pid));
    }
    function buildPeople() {
      const A = fmt.album;
      $('#ex-legend').innerHTML = `<span class="ex-lh">${tr('viewer.contributors')}</span>` + A.people.map((p) => {
        const c = fmt.counts[p.id];
        return `<button class="ex-chip" data-pid="${p.id}" aria-pressed="false"><i class="ex-av" style="--c:${p.color}">${p.ini}</i>${p.name} <small>${c.photos + c.texts}</small></button>`;
      }).join('');
      const max = Math.max(...A.people.map((p) => fmt.counts[p.id].photos + fmt.counts[p.id].texts));
      $('#ex-who').innerHTML = A.people.map((p) => {
        const c = fmt.counts[p.id], total = c.photos + c.texts;
        const textLine = c.texts ? `<br>${c.texts} ${tr('collab.textWord', { count: c.texts })}` : '';
        return `<li><button data-pid="${p.id}" aria-pressed="false"><i class="ex-av" style="--c:${p.color}">${p.ini}</i><span><span class="ex-nm">${p.name}</span><span class="ex-bar" style="--c:${p.color}"><i style="width:${Math.round((total / max) * 100)}%"></i></span></span><span class="ex-cnt">${c.photos} ${tr('collab.photoWord', { count: c.photos })}${textLine}</span></button></li>`;
      }).join('');
      $$('[data-pid]', root).forEach((b) => b.addEventListener('click', () => {
        setFocus(b.dataset.pid);
        if (b.closest('#ex-who')) viewer.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      }));
    }
    function buildGallery() {
      const G = [
        ['cover', 0], ['chap', 2], ['pano', 3], ['four', 5], ['three', 7], ['six', 9], ['two', 11],
        ['cap', 6], ['tp', 8], ['full', 10], ['quote', 12], ['collage', 16], ['thanks', 28], ['back', 29], ['ded', 1]
      ];
      $('#ex-gal').innerHTML = G.map(([k, i]) => {
        const two = k === 'pano';
        const label = layLabel(k);
        const text = tr(`gallery.items.${k}.text`);
        return `<button class="ex-gcard${two ? ' ex-w2' : ''}" data-i="${i}"><div class="ex-gp" style="aspect-ratio:${(((two ? 2 : 1) * fmt.ratio * 100) / 100).toFixed(2)}">${(two ? [i, i + 1] : [i]).map((j) => `<div class="ex-fp">${renderPage(fmt.pages[j], j, fmt, true)}</div>`).join('')}</div><b>${label}</b><span>${text}</span></button>`;
      }).join('');
      $$('.ex-gcard', $('#ex-gal')).forEach((b) => b.addEventListener('click', () => {
        state.touched = true; if (!state.lay) { state.lay = true; syncToggles(); }
        viewer.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        setTimeout(() => pf && pf.flip(+b.dataset.i), reduce ? 0 : 450);
      }));
    }
    function buildTabs() {
      $('#ex-tabs').innerHTML = formats.map((f, i) => `<button class="ex-tab" role="tab" data-i="${i}" aria-selected="${i === state.fmtIndex}"><span class="ex-mc" style="width:${(54 * f.ratio).toFixed(1)}px;background-image:url('${f.pages[0].ph.url}')"></span><span class="ex-tt"><b>${f.name}</b><span>${f.size}</span><span>${f.album.theme}</span></span></button>`).join('');
      $$('.ex-tab', root).forEach((b) => b.addEventListener('click', () => { if (+b.dataset.i !== state.fmtIndex) loadFormat(+b.dataset.i); }));
    }
    function buildCollabExtras() {
      const f = formats[0], A = f.album, ps = A.people;
      $('#ex-phones').innerHTML = ps.slice(0, 3).map((p, i) => `<div class="ex-phone" style="--d:${i * 1.6}s"><i class="ex-av" style="--c:${p.color}">${p.ini}</i><b>${p.name}</b></div>`).join('');
      const slots = [[0, 'peaks'], [1, 'night'], [0, 'sea'], [2, 'road']];
      $('#ex-mock').innerHTML = slots.map(([pi, k], i) => `<div class="ex-slot" style="--d:${i * 1.1}s;background-image:url('${PHOTOS.carre[k]}')"><i style="--c:${ps[pi].color}"></i></div>`).join('');
      const sc = tr('collab.scenarios', { returnObjects: true }) || [];
      const link = tr('collab.scenarioLink');
      $('#ex-scen').innerHTML = sc.map((item) => `<button class="ex-sc" data-i="${item.fmt}"><b>${item.title}</b><span>${item.text}</span><u>${link}</u></button>`).join('');
      $$('.ex-sc', root).forEach((b) => b.addEventListener('click', () => { loadFormat(+b.dataset.i); viewer.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); }));
    }
    function buildSteps() {
      const steps = tr('collab.steps', { returnObjects: true }) || [];
      const el = $('.ex-steps', root);
      if (el) el.innerHTML = steps.map((st) => `<li><div><b>${st.title}</b><span>${st.text}</span></div></li>`).join('');
    }
    function sizeAndUpdate() {
      stageSize();
      requestAnimationFrame(() => { try { pf && pf.update && pf.update(); } catch (_e) { /* pas encore pret */ } updateUI(); });
    }
    function hideHint() { $('#ex-hint').classList.add('ex-off'); }
    function intro() {
      if (reduce) return;
      setTimeout(() => { if (!state.touched && pf) pf.flip(1); }, 1100);
      setTimeout(() => { if (!state.touched && pf) pf.flip(3); }, 2900);
    }
    function loadFormat(i) {
      state.fmtIndex = i; fmt = formats[i]; state.focus = null;
      try { pf && pf.destroy(); } catch (_e) { /* deja detruit */ }
      pf = null; stage.innerHTML = ''; stage.style.transform = 'none';
      const book = document.createElement('div');
      book.innerHTML = fmt.pages.map((s, k) => `<div class="ex-page-el" data-density="${k === 0 || k === LAST ? 'hard' : 'soft'}">${renderPage(s, k, fmt, false)}</div>`).join('');
      stage.appendChild(book);
      stageSize();
      $('#ex-vTitle').textContent = `${fmt.album.title} · ${fmt.name} ${fmt.size}`;
      $$('.ex-tab', root).forEach((t2) => t2.setAttribute('aria-selected', +t2.dataset.i === i));
      $('#ex-finalH').textContent = tr('final.titleFormat', { format: fmt.name.toLowerCase() });
      $('#ex-finalP').textContent = tr('final.leadFormat', { format: fmt.name, size: fmt.size });
      $('#ex-ctaFmt').textContent = tr('final.ctaFormat', { format: fmt.name.toLowerCase() });
      buildThumbs(); buildPeople(); buildGallery(); syncToggles();
      const bw = 400;
      pf = new PageFlip(book, {
        width: bw, height: Math.round(bw / fmt.ratio), size: 'stretch', minWidth: MINW, maxWidth: 1800,
        minHeight: 200, maxHeight: 2600, showCover: true, maxShadowOpacity: 0.45, mobileScrollSupport: false,
        flippingTime: 750, usePortrait: true, startPage: 0, autoSize: true, drawShadow: true
      });
      pf.loadFromHTML(book.querySelectorAll('.ex-page-el'));
      pf.on('flip', () => { updateUI(); hideHint(); });
      pf.on('changeOrientation', () => updateUI());
      updateUI();
      if (!state.intro) { state.intro = true; intro(); }
    }
    function rebuildAll(targetIndex) {
      formats = buildFormats(tr);
      buildTabs(); buildCollabExtras(); buildSteps();
      loadFormat(targetIndex);
    }

    stagewrap.addEventListener('pointerdown', () => { state.touched = true; hideHint(); }, { passive: true });
    stagewrap.addEventListener('keydown', () => { state.touched = true; hideHint(); }, { passive: true });
    stagewrap.addEventListener('wheel', () => { state.touched = true; hideHint(); }, { passive: true });

    $('#ex-prev').addEventListener('click', () => { state.touched = true; pf && pf.flipPrev('bottom'); });
    $('#ex-next').addEventListener('click', () => { state.touched = true; pf && pf.flipNext('bottom'); });
    $('#ex-bLay').addEventListener('click', () => { state.lay = !state.lay; syncToggles(); });
    $('#ex-bBy').addEventListener('click', () => { state.by = !state.by; if (!state.by && state.focus) setFocus(state.focus); syncToggles(); });
    $('#ex-bFs').addEventListener('click', () => {
      if (document.fullscreenElement) { document.exitFullscreen(); }
      else if (viewer.requestFullscreen) { viewer.requestFullscreen().catch(() => toast(tr('viewer.fullscreenUnavailable'))); }
      else toast(tr('viewer.fullscreenUnavailable'));
    });
    const onFullscreenChange = () => setTimeout(sizeAndUpdate, 120);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    let rt;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(sizeAndUpdate, 120); };
    window.addEventListener('resize', onResize);
    const onKeydown = (e) => {
      if (!$('#ex-zoom').hidden) {
        if (e.key === 'Escape') closeZoom();
        if (e.key === '+' || e.key === '=') zoomBy(1.3);
        if (e.key === '-') zoomBy(1 / 1.3);
        return;
      }
      if (/input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight' && pf) { state.touched = true; pf.flipNext('bottom'); }
      if (e.key === 'ArrowLeft' && pf) { state.touched = true; pf.flipPrev('bottom'); }
    };
    document.addEventListener('keydown', onKeydown);

    // Reconstruction a la volee si la langue change pendant que cette page
    // est ouverte (le selecteur FR/EN vit dans l'en-tete du site, toujours
    // visible) — voir le petit effet `[i18n.language]` plus haut, qui
    // appelle rebuildAll via ce pont.
    controllerRef.current = { rebuildAll, getFmtIndex: () => state.fmtIndex };

    // CTA reels (contrairement a l'artefact, qui n'etait qu'une maquette :
    // ici chaque bouton "Créer mon album"/"Partir de cet exemple" ouvre
    // vraiment le vrai parcours de creation, pas un toast de demonstration).
    $$('[data-cta]', root).forEach((b) => b.addEventListener('click', () => navigate('/create-book')));
    $('#ex-ctaTpl').addEventListener('click', () => navigate('/create-book'));
    $('#ex-toGallery').addEventListener('click', () => $('#ex-galerie').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }));

    // ---------- Zoom ----------
    const zv = { z: 1, x: 0, y: 0, w: 0, h: 0 };
    function applyZ() {
      $('#ex-zbook').style.transform = `translate(${zv.x.toFixed(1)}px,${zv.y.toFixed(1)}px) scale(${zv.z.toFixed(3)})`;
      $('#ex-zPct').textContent = `${Math.round(zv.z * 100)} %`;
    }
    function clampPan() {
      const mx = Math.max(0, (zv.w * zv.z - $('#ex-zstage').clientWidth) / 2);
      const my = Math.max(0, (zv.h * zv.z - $('#ex-zstage').clientHeight) / 2);
      zv.x = Math.min(mx, Math.max(-mx, zv.x)); zv.y = Math.min(my, Math.max(-my, zv.y));
    }
    function zoomBy(k) {
      zv.z = Math.min(5, Math.max(1, zv.z * k));
      if (zv.z === 1) { zv.x = 0; zv.y = 0; }
      clampPan(); applyZ();
    }
    function openZoom() {
      if (!pf) return;
      const idx = spreadOf(pf.getCurrentPageIndex());
      const z = $('#ex-zoom'); z.hidden = false; document.body.style.overflow = 'hidden';
      // Meme classe que les autres calques plein ecran du site (voir
      // AtelierBookView.js/Layout.css) : sans elle, l'en-tete du vrai site
      // (sticky, z-index 1000 — bien plus haut que ce calque) reste au-dessus
      // et intercepte les clics sur la barre du zoom (bouton Fermer compris).
      document.body.classList.add('has-fullscreen-viewer');
      const st = $('#ex-zstage'), aw = window.innerWidth - 24, ah = st.clientHeight - 16 || window.innerHeight - 120, sr = idx.length * fmt.ratio;
      let W = aw, H = W / sr;
      if (H > ah) { H = ah; W = H * sr; }
      zv.w = W; zv.h = H; zv.z = 1; zv.x = 0; zv.y = 0;
      const zb = $('#ex-zbook'); zb.style.width = `${Math.floor(W)}px`; zb.style.height = `${Math.floor(H)}px`;
      zb.innerHTML = idx.map((k) => `<div class="ex-zp">${renderPage(fmt.pages[k], k, fmt, false)}</div>`).join('');
      $('#ex-zTitle').textContent = pagesLabelBare(idx);
      applyFocus(zb); syncToggles(); applyZ(); $('#ex-zClose').focus();
    }
    function closeZoom() { $('#ex-zoom').hidden = true; document.body.style.overflow = ''; document.body.classList.remove('has-fullscreen-viewer'); }
    $('#ex-bZoom').addEventListener('click', openZoom);
    $('#ex-zClose').addEventListener('click', closeZoom);
    $('#ex-zIn').addEventListener('click', () => zoomBy(1.4));
    $('#ex-zOut').addEventListener('click', () => zoomBy(1 / 1.4));
    $('#ex-zPct').addEventListener('click', () => { zv.z = 1; zv.x = 0; zv.y = 0; applyZ(); });
    const zs = $('#ex-zstage');
    let drag = null;
    const onWheelZoom = (e) => { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0018)); };
    zs.addEventListener('wheel', onWheelZoom, { passive: false });
    zs.addEventListener('pointerdown', (e) => { drag = { x: e.clientX - zv.x, y: e.clientY - zv.y }; zs.setPointerCapture(e.pointerId); zs.classList.add('ex-drag'); });
    zs.addEventListener('pointermove', (e) => { if (!drag || zv.z === 1) return; zv.x = e.clientX - drag.x; zv.y = e.clientY - drag.y; clampPan(); applyZ(); });
    zs.addEventListener('pointerup', () => { drag = null; zs.classList.remove('ex-drag'); });
    zs.addEventListener('dblclick', () => { if (zv.z > 1) { zv.z = 1; zv.x = 0; zv.y = 0; } else zv.z = 2.6; clampPan(); applyZ(); });

    buildSteps();
    rebuildAll(0);

    return () => {
      try { pf && pf.destroy(); } catch (_e) { /* non bloquant */ }
      clearTimeout(toastTimer);
      controllerRef.current = null;
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKeydown);
      document.body.style.overflow = '';
      document.body.classList.remove('has-fullscreen-viewer');
      if (fontLink.parentNode) fontLink.parentNode.removeChild(fontLink);
    };
    // Monte une seule fois : toute la logique au-dessus vit dans ses
    // propres fermetures (fmt/pf/state), jamais dans des dependances React —
    // c'est le meme choix que l'artefact d'origine (un seul script, jamais
    // re-execute), indispensable pour que page-flip garde la main sur son
    // DOM sans qu'un re-rendu React ne vienne le lui reprendre. Le
    // changement de langue est gere a part, via l'ecouteur i18next
    // (onLanguageChanged) — pas en redeclenchant cet effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ex-page" ref={rootRef}>
      <div className="ex-wrap">
        <div className="ex-hero">
          <h1>{t('hero.titlePre')}<em>{t('hero.titleEm')}</em></h1>
          <div>
            <p>{t('hero.lead')}</p>
            <div className="ex-cta">
              <button type="button" className="ex-btn" data-cta>{t('hero.ctaCreate')}</button>
              <button type="button" className="ex-btn ex-ghost" id="ex-toGallery">{t('hero.ctaGallery')}</button>
            </div>
          </div>
        </div>

        <div className="ex-tabs" role="tablist" aria-label={t('hero.ctaCreate')} id="ex-tabs" />

        <div className="ex-viewer" id="ex-viewer">
          <div className="ex-vbar">
            <div className="ex-vt"><b id="ex-vTitle" /><span id="ex-vPages" /></div>
            <div className="ex-vact">
              <button type="button" className="ex-tg" id="ex-bLay" aria-pressed="false" aria-label={t('viewer.layoutsAria')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="5" rx="1" /><rect x="13" y="10" width="8" height="11" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /></svg>
                <span className="ex-lb">{t('viewer.layouts')}</span>
              </button>
              <button type="button" className="ex-tg" id="ex-bBy" aria-pressed="false" aria-label={t('viewer.contributorsAria')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><circle cx="17.5" cy="9" r="2.5" /><path d="M17.5 14.2c2.3.1 3.7 1.5 4.2 4" /></svg>
                <span className="ex-lb">{t('viewer.contributors')}</span>
              </button>
              <button type="button" className="ex-tg" id="ex-bZoom" aria-label={t('viewer.zoomAria')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" /></svg>
                <span className="ex-lb">{t('viewer.zoom')}</span>
              </button>
              <button type="button" className="ex-tg" id="ex-bFs" aria-label={t('viewer.fullscreenAria')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
                <span className="ex-lb">{t('viewer.fullscreen')}</span>
              </button>
            </div>
          </div>
          <div className="ex-vtable" id="ex-vtable">
            <button type="button" className="ex-arrow ex-prev" id="ex-prev" aria-label={t('viewer.prevAria')}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg></button>
            <button type="button" className="ex-arrow ex-next" id="ex-next" aria-label={t('viewer.nextAria')}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg></button>
            <div className="ex-stagewrap" id="ex-stagewrap"><div id="ex-stage" /></div>
            <div className="ex-floor" />
            <div className="ex-hint" id="ex-hint">{t('viewer.hint')}</div>
          </div>
          <div className="ex-strip" id="ex-strip" aria-label={t('hero.ctaGallery')} />
          <div className="ex-legend" id="ex-legend" />
        </div>
      </div>

      <section className="ex-s">
        <div className="ex-wrap">
          <div className="ex-eyebrow">{t('collab.eyebrow')}</div>
          <h2>{t('collab.title')}</h2>
          <p className="ex-lead">{t('collab.lead')}</p>

          <div className="ex-collab">
            <div>
              <div className="ex-card">
                <h3>{t('collab.cardTitle')}</h3>
                <p className="ex-sub">{t('collab.cardSub')}</p>
                <ul className="ex-who" id="ex-who" />
              </div>
              <div className="ex-sync" aria-hidden="true">
                <div className="ex-phones" id="ex-phones" />
                <div className="ex-flow" />
                <div className="ex-mock" id="ex-mock" />
              </div>
            </div>
            <div>
              <ol className="ex-steps" />
            </div>
          </div>

          <div className="ex-scen" id="ex-scen" />
        </div>
      </section>

      <section className="ex-s" id="ex-galerie" style={{ paddingTop: 0 }}>
        <div className="ex-wrap">
          <div className="ex-eyebrow">{t('gallery.eyebrow')}</div>
          <h2>{t('gallery.title')}</h2>
          <p className="ex-lead">{t('gallery.lead')}</p>
          <div className="ex-gal" id="ex-gal" />
        </div>
      </section>

      <section className="ex-s" style={{ paddingTop: 0 }}>
        <div className="ex-wrap">
          <div className="ex-final">
            <div>
              <h2 id="ex-finalH">{t('final.titleDefault')}</h2>
              <p id="ex-finalP">{t('final.leadDefault')}</p>
            </div>
            <div className="ex-acts">
              <button type="button" className="ex-btn" id="ex-ctaFmt" data-cta>{t('hero.ctaCreate')}</button>
              <button type="button" className="ex-btn ex-ghost" id="ex-ctaTpl">{t('final.ctaTemplate')}</button>
            </div>
          </div>
          <footer className="ex-foot">{t('final.footerCredit')}</footer>
        </div>
      </section>

      <div className="ex-zoom" id="ex-zoom" hidden role="dialog" aria-modal="true" aria-label={t('viewer.zoomAria')}>
        <div className="ex-zbar">
          <div><b id="ex-zTitle" /> <small>{t('zoomModal.hint')}</small></div>
          <div className="ex-zc">
            <button type="button" id="ex-zOut" aria-label={t('zoomModal.zoomOutAria')}>−</button>
            <button type="button" id="ex-zPct" aria-label={t('zoomModal.resetAria')}>100 %</button>
            <button type="button" id="ex-zIn" aria-label={t('zoomModal.zoomInAria')}>+</button>
            <button type="button" id="ex-zClose" aria-label={t('zoomModal.closeAria')}>{t('zoomModal.close')}</button>
          </div>
        </div>
        <div className="ex-zstage" id="ex-zstage"><div className="ex-zbook" id="ex-zbook" /></div>
      </div>
      <div className="ex-toast" id="ex-toast" role="status" aria-live="polite" />
    </div>
  );
}
