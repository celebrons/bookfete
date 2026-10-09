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
// Pas de bascule FR/EN sur CETTE page (voir note en pied de fichier) : le
// contenu des 4 albums est un recit fictif redige en francais (noms,
// legendes, citations) — le traduire sort du perimetre de cette refonte,
// contrairement au chrome du site (Header/Footer/Layout) qui reste bilingue
// comme partout ailleurs.
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageFlip } from 'page-flip';
import { FORMATS, LAY, LAST, PHOTOS, pageHTML } from './exemplesData';
import '../../styles/luxe-theme.css';
import './ExemplesLuxe.css';

const MINW = 260;
const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Caveat:wght@500;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Figtree:wght@400;500;600;700&display=swap';

export default function ExemplesLuxe() {
  const navigate = useNavigate();
  const rootRef = useRef(null);

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

    let pf = null;
    let fmt = FORMATS[0];
    const state = { fmtIndex: 0, focus: null, lay: false, by: false, touched: false, intro: false };

    const stage = $('#ex-stage');
    const stagewrap = $('#ex-stagewrap');
    const viewer = $('#ex-viewer');
    let toastTimer = null;
    const toast = (m) => {
      const t = $('#ex-toast');
      t.textContent = m; t.classList.add('ex-on');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('ex-on'), 3200);
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
      $$('.ex-th', $('#ex-strip')).forEach((t, i) => t.classList.toggle('ex-hit', !!state.focus && fmt.pageSets[i].has(state.focus)));
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
      $('#ex-vPages').textContent = `${sp.length === 1 ? (sp[0] === 0 ? 'Couverture' : sp[0] === LAST ? '4ème de couverture' : `Page ${sp[0]}`) : `Pages ${sp[0]} et ${sp[1]}`} sur ${LAST - 1}`;
      $('#ex-prev').disabled = c <= 0;
      $('#ex-next').disabled = sp[sp.length - 1] >= LAST;
      $$('.ex-th', $('#ex-strip')).forEach((t, i) => t.classList.toggle('ex-on', sp.includes(i)));
      const on = $('.ex-th.ex-on', $('#ex-strip'));
      if (on) { const s = $('#ex-strip'); s.scrollTo({ left: on.offsetLeft - s.clientWidth / 2 + on.clientWidth / 2, behavior: reduce ? 'auto' : 'smooth' }); }
      const closed = sp.length === 1 && (sp[0] === 0 || sp[0] === LAST) && pf.getOrientation() === 'landscape';
      stage.style.transform = closed ? (sp[0] === 0 ? 'translateX(-25%)' : 'translateX(25%)') : 'none';
    }
    function buildThumbs() {
      const s = $('#ex-strip');
      s.innerHTML = fmt.pages.map((sp, i) => `<button class="ex-th" data-i="${i}" aria-label="${i === 0 ? 'Couverture' : i === LAST ? '4ème de couverture' : `Page ${i}`}"><div class="ex-tpg" style="width:${(62 * fmt.ratio).toFixed(1)}px">${pageHTML(sp, i, fmt, { bare: true })}</div><small>${i === 0 ? 'Couv.' : i === LAST ? '4ème' : i}</small></button>`).join('');
      $$('.ex-th', s).forEach((b) => b.addEventListener('click', () => { state.touched = true; pf && pf.flip(+b.dataset.i); }));
    }
    function buildChipsState() {
      $$('[data-pid]', root).forEach((b) => b.setAttribute('aria-pressed', state.focus === b.dataset.pid));
    }
    function buildPeople() {
      const A = fmt.album;
      $('#ex-legend').innerHTML = '<span class="ex-lh">Contributeurs</span>' + A.people.map((p) => {
        const c = fmt.counts[p.id];
        return `<button class="ex-chip" data-pid="${p.id}" aria-pressed="false"><i class="ex-av" style="--c:${p.color}">${p.ini}</i>${p.name} <small>${c.photos + c.texts}</small></button>`;
      }).join('');
      const max = Math.max(...A.people.map((p) => fmt.counts[p.id].photos + fmt.counts[p.id].texts));
      $('#ex-who').innerHTML = A.people.map((p) => {
        const c = fmt.counts[p.id], t = c.photos + c.texts;
        return `<li><button data-pid="${p.id}" aria-pressed="false"><i class="ex-av" style="--c:${p.color}">${p.ini}</i><span><span class="ex-nm">${p.name}</span><span class="ex-bar" style="--c:${p.color}"><i style="width:${Math.round((t / max) * 100)}%"></i></span></span><span class="ex-cnt">${c.photos} photo${c.photos > 1 ? 's' : ''}${c.texts ? `<br>${c.texts} texte${c.texts > 1 ? 's' : ''}` : ''}</span></button></li>`;
      }).join('');
      $$('[data-pid]', root).forEach((b) => b.addEventListener('click', () => {
        setFocus(b.dataset.pid);
        if (b.closest('#ex-who')) viewer.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      }));
    }
    function buildGallery() {
      const G = [
        ['cover', 0, 'Un titre, une photo, vos contributeurs.'], ['chap', 2, "Pour ouvrir une partie de l'album."],
        ['pano', 3, 'Une photo sur deux pages.'], ['four', 5, 'Quatre photos qui se répondent.'],
        ['three', 7, 'Une grande photo, deux petites.'], ['six', 9, 'Six photos pour un moment riche.'],
        ['two', 11, 'Deux photos, un contraste.'], ['cap', 6, 'Une photo et son petit mot.'],
        ['tp', 8, 'Une photo et un texte écrit par un proche.'], ['full', 10, 'La photo à fond de page.'],
        ['quote', 12, "Un mot, avec le nom de son auteur."], ['collage', 16, 'Des photos posées comme sur une table.'],
        ['thanks', 28, 'Les contributeurs, un par un.'], ['back', 29, 'La dernière page, à votre image.'],
        ['ded', 1, 'Quelques mots pour commencer.']
      ];
      $('#ex-gal').innerHTML = G.map(([k, i, d]) => {
        const two = k === 'pano';
        return `<button class="ex-gcard${two ? ' ex-w2' : ''}" data-i="${i}"><div class="ex-gp" style="aspect-ratio:${(((two ? 2 : 1) * fmt.ratio * 100) / 100).toFixed(2)}">${(two ? [i, i + 1] : [i]).map((j) => `<div class="ex-fp">${pageHTML(fmt.pages[j], j, fmt, { bare: true })}</div>`).join('')}</div><b>${LAY[k]}</b><span>${d}</span></button>`;
      }).join('');
      $$('.ex-gcard', $('#ex-gal')).forEach((b) => b.addEventListener('click', () => {
        state.touched = true; if (!state.lay) { state.lay = true; syncToggles(); }
        viewer.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
        setTimeout(() => pf && pf.flip(+b.dataset.i), reduce ? 0 : 450);
      }));
    }
    function buildTabs() {
      $('#ex-tabs').innerHTML = FORMATS.map((f, i) => `<button class="ex-tab" role="tab" data-i="${i}" aria-selected="${i === state.fmtIndex}"><span class="ex-mc" style="width:${(54 * f.ratio).toFixed(1)}px;background-image:url('${f.pages[0].ph.url}')"></span><span class="ex-tt"><b>${f.name}</b><span>${f.size}</span><span>${f.album.theme}</span></span></button>`).join('');
      $$('.ex-tab', root).forEach((b) => b.addEventListener('click', () => { if (+b.dataset.i !== state.fmtIndex) loadFormat(+b.dataset.i); }));
    }
    function buildCollabExtras() {
      const f = FORMATS[0], A = f.album, ps = A.people;
      $('#ex-phones').innerHTML = ps.slice(0, 3).map((p, i) => `<div class="ex-phone" style="--d:${i * 1.6}s"><i class="ex-av" style="--c:${p.color}">${p.ini}</i><b>${p.name}</b></div>`).join('');
      const slots = [[0, 'peaks'], [1, 'night'], [0, 'sea'], [2, 'road']];
      $('#ex-mock').innerHTML = slots.map(([pi, k], i) => `<div class="ex-slot" style="--d:${i * 1.1}s;background-image:url('${PHOTOS.carre[k]}')"><i style="--c:${ps[pi].color}"></i></div>`).join('');
      const sc = [
        ['Mariage', 'Les invités ajoutent leurs photos de la soirée, vous gardez les meilleures.', 1],
        ['Voyage entre amis', 'Chacun a pris des photos de son côté. Elles finissent toutes dans le même album.', 3],
        ['Naissance', 'Grands-parents, oncles et tantes écrivent un mot et ajoutent leurs photos.', 2],
        ['Voyage en groupe', 'Un seul album pour toute la bande, avec le nom de chacun sur ses pages.', 0]
      ];
      $('#ex-scen').innerHTML = sc.map(([t, d, i]) => `<button class="ex-sc" data-i="${i}"><b>${t}</b><span>${d}</span><u>Voir l'album ›</u></button>`).join('');
      $$('.ex-sc', root).forEach((b) => b.addEventListener('click', () => { loadFormat(+b.dataset.i); viewer.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); }));
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
      state.fmtIndex = i; fmt = FORMATS[i]; state.focus = null;
      try { pf && pf.destroy(); } catch (_e) { /* deja detruit */ }
      pf = null; stage.innerHTML = ''; stage.style.transform = 'none';
      const book = document.createElement('div');
      book.innerHTML = fmt.pages.map((s, k) => `<div class="ex-page-el" data-density="${k === 0 || k === LAST ? 'hard' : 'soft'}">${pageHTML(s, k, fmt)}</div>`).join('');
      stage.appendChild(book);
      stageSize();
      $('#ex-vTitle').textContent = `${fmt.album.title} · ${fmt.name} ${fmt.size}`;
      $$('.ex-tab', root).forEach((t) => t.setAttribute('aria-selected', +t.dataset.i === i));
      $('#ex-finalH').textContent = `Votre album ${fmt.name.toLowerCase()} commence ici.`;
      $('#ex-finalP').textContent = `Format ${fmt.name}, ${fmt.size}. Invitez vos proches et remplissez les pages ensemble.`;
      $('#ex-ctaFmt').textContent = `Créer mon album ${fmt.name.toLowerCase()}`;
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

    stagewrap.addEventListener('pointerdown', () => { state.touched = true; hideHint(); }, { passive: true });
    stagewrap.addEventListener('keydown', () => { state.touched = true; hideHint(); }, { passive: true });
    stagewrap.addEventListener('wheel', () => { state.touched = true; hideHint(); }, { passive: true });

    $('#ex-prev').addEventListener('click', () => { state.touched = true; pf && pf.flipPrev('bottom'); });
    $('#ex-next').addEventListener('click', () => { state.touched = true; pf && pf.flipNext('bottom'); });
    $('#ex-bLay').addEventListener('click', () => { state.lay = !state.lay; syncToggles(); });
    $('#ex-bBy').addEventListener('click', () => { state.by = !state.by; if (!state.by && state.focus) setFocus(state.focus); syncToggles(); });
    $('#ex-bFs').addEventListener('click', () => {
      if (document.fullscreenElement) { document.exitFullscreen(); }
      else if (viewer.requestFullscreen) { viewer.requestFullscreen().catch(() => toast("Le plein écran n'est pas disponible ici.")); }
      else toast("Le plein écran n'est pas disponible ici.");
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
      zb.innerHTML = idx.map((k) => `<div class="ex-zp">${pageHTML(fmt.pages[k], k, fmt)}</div>`).join('');
      $('#ex-zTitle').textContent = idx.length === 1 ? (idx[0] === 0 ? 'Couverture' : idx[0] === LAST ? '4ème de couverture' : `Page ${idx[0]}`) : `Pages ${idx[0]} et ${idx[1]}`;
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

    buildTabs(); buildCollabExtras();
    loadFormat(0);

    return () => {
      try { pf && pf.destroy(); } catch (_e) { /* non bloquant */ }
      clearTimeout(toastTimer);
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
    // DOM sans qu'un re-rendu React ne vienne le lui reprendre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ex-page" ref={rootRef}>
      <div className="ex-wrap">
        <div className="ex-hero">
          <h1>Feuilletez un vrai album. Puis <em>faites le vôtre.</em></h1>
          <div>
            <p>Chaque exemple compte 30 pages et utilise toutes les mises en page de l&apos;éditeur. Tournez les pages, zoomez sur les photos, voyez qui a ajouté quoi.</p>
            <div className="ex-cta">
              <button type="button" className="ex-btn" data-cta>Créer mon album</button>
              <button type="button" className="ex-btn ex-ghost" id="ex-toGallery">Voir les mises en page</button>
            </div>
          </div>
        </div>

        <div className="ex-tabs" role="tablist" aria-label="Format de l'album" id="ex-tabs" />

        <div className="ex-viewer" id="ex-viewer">
          <div className="ex-vbar">
            <div className="ex-vt"><b id="ex-vTitle" /><span id="ex-vPages" /></div>
            <div className="ex-vact">
              <button type="button" className="ex-tg" id="ex-bLay" aria-pressed="false" aria-label="Afficher les mises en page">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="5" rx="1" /><rect x="13" y="10" width="8" height="11" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /></svg>
                <span className="ex-lb">Mises en page</span>
              </button>
              <button type="button" className="ex-tg" id="ex-bBy" aria-pressed="false" aria-label="Afficher les contributeurs">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><circle cx="17.5" cy="9" r="2.5" /><path d="M17.5 14.2c2.3.1 3.7 1.5 4.2 4" /></svg>
                <span className="ex-lb">Contributeurs</span>
              </button>
              <button type="button" className="ex-tg" id="ex-bZoom" aria-label="Zoomer sur la page">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" /></svg>
                <span className="ex-lb">Zoom</span>
              </button>
              <button type="button" className="ex-tg" id="ex-bFs" aria-label="Plein écran">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
                <span className="ex-lb">Plein écran</span>
              </button>
            </div>
          </div>
          <div className="ex-vtable" id="ex-vtable">
            <button type="button" className="ex-arrow ex-prev" id="ex-prev" aria-label="Page précédente"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5-7 7 7 7" /></svg></button>
            <button type="button" className="ex-arrow ex-next" id="ex-next" aria-label="Page suivante"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg></button>
            <div className="ex-stagewrap" id="ex-stagewrap"><div id="ex-stage" /></div>
            <div className="ex-floor" />
            <div className="ex-hint" id="ex-hint">Cliquez sur un coin de page ou faites-la glisser</div>
          </div>
          <div className="ex-strip" id="ex-strip" aria-label="Pages de l'album" />
          <div className="ex-legend" id="ex-legend" />
        </div>
      </div>

      <section className="ex-s">
        <div className="ex-wrap">
          <div className="ex-eyebrow">Album collaboratif</div>
          <h2>Un album, plusieurs mains.</h2>
          <p className="ex-lead">Vous invitez vos proches avec un lien. Chacun ajoute ses photos et ses textes depuis son téléphone. Vous composez l&apos;album ensemble et vous le commandez une seule fois.</p>

          <div className="ex-collab">
            <div>
              <div className="ex-card">
                <h3>Qui a ajouté quoi ?</h3>
                <p className="ex-sub">Dans l&apos;album ci-dessus. Cliquez sur un prénom pour retrouver ses pages.</p>
                <ul className="ex-who" id="ex-who" />
              </div>
              <div className="ex-sync" aria-hidden="true">
                <div className="ex-phones" id="ex-phones" />
                <div className="ex-flow" />
                <div className="ex-mock" id="ex-mock" />
              </div>
            </div>
            <div>
              <ol className="ex-steps">
                <li><div><b>Invitez vos proches</b><span>Un lien à envoyer par message. Pas de compte à créer pour envoyer des photos.</span></div></li>
                <li><div><b>Chacun ajoute ses photos et ses textes</b><span>Les contributions arrivent dans votre album, avec le nom de leur auteur.</span></div></li>
                <li><div><b>Vous composez et vous commandez</b><span>Vous choisissez les mises en page et les pages. Un seul album, une seule commande.</span></div></li>
              </ol>
            </div>
          </div>

          <div className="ex-scen" id="ex-scen" />
        </div>
      </section>

      <section className="ex-s" id="ex-galerie" style={{ paddingTop: 0 }}>
        <div className="ex-wrap">
          <div className="ex-eyebrow">Mises en page</div>
          <h2>Toutes les pages que vous pouvez composer.</h2>
          <p className="ex-lead">Cliquez sur une mise en page pour la retrouver dans l&apos;album, à la page où elle apparaît.</p>
          <div className="ex-gal" id="ex-gal" />
        </div>
      </section>

      <section className="ex-s" style={{ paddingTop: 0 }}>
        <div className="ex-wrap">
          <div className="ex-final">
            <div>
              <h2 id="ex-finalH">Votre album commence ici.</h2>
              <p id="ex-finalP">Choisissez un format, invitez vos proches et remplissez les pages.</p>
            </div>
            <div className="ex-acts">
              <button type="button" className="ex-btn" id="ex-ctaFmt" data-cta>Créer mon album</button>
              <button type="button" className="ex-btn ex-ghost" id="ex-ctaTpl">Partir de cet exemple</button>
            </div>
          </div>
          <footer className="ex-foot">
            Les photos de ces exemples sont des photos libres de droits (Wikimedia Commons, licences CC0/CC BY/CC BY-SA) choisies pour illustrer l&apos;album — les albums que vous créez utilisent vos propres photos. Les personnes et récits illustrés ici sont fictifs.
          </footer>
        </div>
      </section>

      <div className="ex-zoom" id="ex-zoom" hidden role="dialog" aria-modal="true" aria-label="Zoom sur les pages">
        <div className="ex-zbar">
          <div><b id="ex-zTitle" /> <small>Molette ou boutons pour zoomer, glissez pour déplacer</small></div>
          <div className="ex-zc">
            <button type="button" id="ex-zOut" aria-label="Dézoomer">−</button>
            <button type="button" id="ex-zPct" aria-label="Réinitialiser le zoom">100 %</button>
            <button type="button" id="ex-zIn" aria-label="Zoomer">+</button>
            <button type="button" id="ex-zClose" aria-label="Fermer">Fermer</button>
          </div>
        </div>
        <div className="ex-zstage" id="ex-zstage"><div className="ex-zbook" id="ex-zbook" /></div>
      </div>
      <div className="ex-toast" id="ex-toast" role="status" aria-live="polite" />
    </div>
  );
}
