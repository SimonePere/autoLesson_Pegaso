(async function () {

  // ── Configurazione ──
  const TEST_MODE = false;
  const OBIETTIVO_PERCENTUALE = 70;
  const PAUSA_TRA_LEZIONI_MS = 3000;

  // Selezione capitoli (tutti 1-based, inclusivi):
  //   CAPITOLO_INIZIO  : numero del primo capitolo da processare (default 1)
  //   SOLO_CAPITOLI    : array di numeri specifici (es. [37,38]); null = tutti
  //   SOLO_OBIETTIVI   : se true salta i video, clicca solo l'item "Obiettivi"
  const CAPITOLO_INIZIO = 1;
  const SOLO_CAPITOLI = null;
  const SOLO_OBIETTIVI = false;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Click "umano" sul topmost al centro del rect.
  // Niente pointerdown/mousedown manuali: la piattaforma li tratta come
  // toggle e il .click() successivo lo richiude (no-op apparente).
  function clickReale(elemento) {
    if (!elemento || !elemento.isConnected) return;

    try {
      const r0 = elemento.getBoundingClientRect();
      if (r0.top < 0 || r0.bottom > window.innerHeight) {
        elemento.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    } catch { }

    const rect = elemento.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    let target = document.elementFromPoint(x, y);
    if (!target || (!elemento.contains(target) && target !== elemento)) {
      target = elemento;
    }
    try { target.click(); } catch { }
  }

  // Capitolo "aperto" = ha figli renderizzati (durate mm:ss / bullseye-arrow).
  // Non usiamo il chevron: gli ID SVG cambiano dopo i rerender Vue.
  function capitoloAperto(headerCapitolo, prossimoHeader) {
    return haFigliNelRange(headerCapitolo, prossimoHeader);
  }

  // ── Legge la percentuale totale del corso ─────────────────
  function leggiPercentualeTotale() {
    const el = document.querySelector('.number-container .text-sm.font-medium');
    if (!el) return 0;
    return parseInt(el.textContent.replace('%', '').trim(), 10) || 0;
  }

  // Allinea l'URL della SPA al capitolo N (Vue Router via pushState+popstate).
  // Senza questo i capitoli "lontani" dall'URL attivo restano vuoti e i click
  // sul loro header sono no-op.
  async function navigaACapitolo(numeroCapitolo) {
    const m = window.location.pathname.match(/\/videolezioni\/([^/]+)/);
    if (!m) return false;
    const corsoId = m[1];
    const target = `/videolezioni/${corsoId}/${numeroCapitolo}`;
    if (window.location.pathname === target) return true;
    try {
      history.pushState({}, '', target);
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    } catch (e) {
      console.log('[Pegaso] ⚠️ pushState fallito:', e.message);
      return false;
    }
    await sleep(2500);
    return true;
  }

  // Raccoglie i VERI capitoli (esclude header di sezione "Lezioni" ecc.).
  // Tiene solo gli header che iniziano con "NUMERO - TITOLO".
  function raccogliCapitoli() {
    const intestazioni = document.querySelectorAll('.cursor-pointer.relative.align-middle');
    return Array.from(intestazioni)
      .filter(el => /^\d+\s*[-–]\s*\S/.test((el.textContent || '').trim()))
      .map(el => ({ elemento: el }));
  }

  // Attende che il header abbia un SVG path renderizzato (virtual scroll).
  async function attendiHeaderRenderizzato(headerCapitolo, maxMs = 3000) {
    let attesa = 0;
    while (attesa < maxMs) {
      if (headerCapitolo.querySelector('svg path')) return true;
      await sleep(200);
      attesa += 200;
    }
    return false;
  }

  // Apre il dropdown del capitolo. Lo stato "aperto" è deciso dal contenuto
  // (non dal chevron). Il PRIMO tentativo aspetta più a lungo: dopo una
  // navigaACapitolo il render della sidebar è lento e con timeout corti
  // fallisce sempre.
  async function apriCapitolo(capitolo, prossimoHeader) {
    const MAX_TENTATIVI = 5;

    try {
      capitolo.elemento.scrollIntoView({ block: 'center', behavior: 'instant' });
    } catch {
      capitolo.elemento.scrollIntoView();
    }
    await sleep(400);
    await attendiHeaderRenderizzato(capitolo.elemento);

    // Grace period: se il capitolo è GIÀ aperto evita di cliccarlo
    // (un click su uno aperto lo chiude).
    let attesaIniziale = 0;
    while (attesaIniziale < 2000 && !capitoloAperto(capitolo.elemento, prossimoHeader)) {
      await sleep(200);
      attesaIniziale += 200;
    }

    for (let tentativo = 1; tentativo <= MAX_TENTATIVI; tentativo++) {
      if (capitoloAperto(capitolo.elemento, prossimoHeader)) break;

      try {
        capitolo.elemento.scrollIntoView({ block: 'center', behavior: 'instant' });
      } catch { }
      await sleep(250);
      await attendiHeaderRenderizzato(capitolo.elemento, 1500);

      clickReale(capitolo.elemento);

      // Primo tentativo: attesa più generosa (4s) perché il render dopo
      // navigaACapitolo è lento. Tentativi successivi: 1.8s.
      const limite = tentativo === 1 ? 4000 : 1800;
      let atteso = 0;
      const passo = 150;
      while (atteso < limite && !capitoloAperto(capitolo.elemento, prossimoHeader)) {
        await sleep(passo);
        atteso += passo;
      }

      if (capitoloAperto(capitolo.elemento, prossimoHeader)) break;

      if (tentativo < MAX_TENTATIVI) {
        await sleep(300 + tentativo * 200); // backoff progressivo, no log
      }
    }

    return await attendiFigli(capitolo.elemento, prossimoHeader, 5000);
  }

  // Polling: aspetta che il container del capitolo abbia figli (max maxMs).
  async function attendiFigli(headerCapitolo, prossimoHeader, maxMs = 4000) {
    let attesa = 0;
    while (attesa < maxMs) {
      if (haFigliNelRange(headerCapitolo, prossimoHeader)) return true;
      await sleep(300);
      attesa += 300;
    }
    return false;
  }

  // True se il container del capitolo contiene almeno una durata mm:ss
  // o l'icona bullseye-arrow ("Obiettivi").
  function haFigliNelRange(headerCapitolo, prossimoHeader) {
    const container = trovaContainerCapitolo(headerCapitolo, prossimoHeader);
    if (!container) return false;
    const durate = container.querySelectorAll('.text-sm.text-platform-gray');
    for (const d of durate) {
      const txt = (d.textContent || '').trim();
      if (/^\d{1,3}:\d{2}$/.test(txt)) return true;
    }
    if (container.querySelector('svg path[id^="bullseye-arrow"]')) return true;
    return false;
  }

  // Chiude il dropdown del capitolo (no-op se già chiuso).
  async function chiudiCapitolo(capitolo, prossimoHeader) {
    try { capitolo.elemento.scrollIntoView({ block: 'center' }); } catch { }
    await sleep(200);
    await attendiHeaderRenderizzato(capitolo.elemento, 1500);

    if (!capitoloAperto(capitolo.elemento, prossimoHeader)) return;

    for (let tentativo = 1; tentativo <= 3; tentativo++) {
      if (!capitoloAperto(capitolo.elemento, prossimoHeader)) return;
      clickReale(capitolo.elemento);
      let atteso = 0;
      while (atteso < 1000 && capitoloAperto(capitolo.elemento, prossimoHeader)) {
        await sleep(150);
        atteso += 150;
      }
      if (!capitoloAperto(capitolo.elemento, prossimoHeader)) return;
      await sleep(200);
    }
  }

  // Trova il più piccolo ancestor del header che contiene questo capitolo
  // ma NON il prossimo header (così isoliamo i suoi figli).
  function trovaContainerCapitolo(headerCapitolo, prossimoHeader) {
    if (!headerCapitolo || !headerCapitolo.isConnected) return null;

    let candidato = headerCapitolo.parentElement;
    while (candidato) {
      if (prossimoHeader && prossimoHeader.isConnected && candidato.contains(prossimoHeader)) {
        break;
      }
      const haContenuti =
        candidato.querySelector('svg path[id^="bullseye-arrow"]') ||
        Array.from(candidato.querySelectorAll('.text-sm.text-platform-gray'))
          .some(d => /^\d{1,3}:\d{2}$/.test((d.textContent || '').trim()));
      if (haContenuti) {
        const piuSu = candidato.parentElement;
        if (piuSu && (!prossimoHeader || !piuSu.contains(prossimoHeader))) {
          candidato = piuSu;
          continue;
        }
        return candidato;
      }
      candidato = candidato.parentElement;
    }

    return headerCapitolo.parentElement || headerCapitolo;
  }

  // Clicca sull'item "Obiettivi" del capitolo. Ritorna il numero di item cliccati.
  async function cliccaObiettivi(headerCapitolo, prossimoHeader) {
    const container = trovaContainerCapitolo(headerCapitolo, prossimoHeader);
    if (!container) return 0;
    const svgs = container.querySelectorAll('svg path[id^="bullseye-arrow"]');
    if (svgs.length === 0) return 0;

    let cliccati = 0;
    for (const svg of svgs) {
      const cliccabile =
        svg.closest('.cursor-pointer') ||
        svg.closest('[role="button"]') ||
        svg.closest('a') ||
        svg.closest('button') ||
        svg.closest('div[class*="hover"]') ||
        svg.closest('div[class*="border-t"]') ||
        svg.closest('li') ||
        svg.parentElement?.parentElement ||
        svg.parentElement;
      if (!cliccabile) continue;

      clickReale(cliccabile);
      cliccati++;
      await sleep(2500); // tempo per registrare la visualizzazione
    }
    return cliccati;
  }

  // ── Raccoglie le lezioni VIDEO del SOLO capitolo corrente ───
  // Una riga è considerata "video" se ha una durata in formato mm:ss.
  // Cerca SOLO nel container del capitolo (approccio robusto, niente range fragili).
  function raccogliLezioniVideo(headerCapitolo, prossimoHeader) {
    const risultati = [];
    const visti = new Set();

    const container = trovaContainerCapitolo(headerCapitolo, prossimoHeader);
    if (!container) return risultati;

    // Cerca tutti gli elementi durata "mm:ss" SOLO dentro il container del capitolo
    const candidatiDurata = container.querySelectorAll('.text-sm.text-platform-gray');

    for (const durataEl of candidatiDurata) {
      const durataStr = (durataEl.textContent || '').trim();
      const m = durataStr.match(/^(\d{1,3}):(\d{2})$/);
      if (!m) continue;

      const durata_secondi = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);

      // Risale fino al contenitore della riga (più fallback)
      const riga =
        durataEl.closest('div[class*="border-t"]') ||
        durataEl.closest('[class*="hover:bg-platform-hover"]') ||
        durataEl.closest('li') ||
        durataEl.parentElement?.parentElement?.parentElement;
      if (!riga || visti.has(riga)) continue;
      visti.add(riga);

      const titoloEl = riga.querySelector('.mb-2');
      const titolo = titoloEl ? titoloEl.textContent.trim() : '(senza titolo)';

      // Barra di progresso (con o senza absolute)
      const barraEl =
        riga.querySelector('.absolute.h-1\\.5.rounded-full') ||
        riga.querySelector('.h-1\\.5.rounded-full') ||
        riga.querySelector('[class*="rounded-full"][style*="width"]');
      let percentuale = 0;
      if (barraEl) {
        const stile = barraEl.getAttribute('style') || '';
        const match = stile.match(/width:\s*([\d.]+)%/);
        if (match) percentuale = parseFloat(match[1]);
      }

      // Elemento cliccabile per avviare il video
      const cliccabile =
        riga.querySelector('.cursor-pointer') ||
        riga.querySelector('[role="button"]') ||
        riga;

      risultati.push({ elemento: cliccabile, titolo, durata_secondi, percentuale });
    }

    return risultati;
  }

  // ── Aspetta la fine del video ─────────────────────────────
  function aspettaFineVideo(durata_secondi) {
    return new Promise(resolve => {
      const video = document.getElementById('video');
      if (!video) {
        console.log(`[Pegaso] ⚠️ Tag <video> non trovato, aspetto ${durata_secondi}s per sicurezza`);
        setTimeout(resolve, durata_secondi * 1000 + 5000);
        return;
      }

      if (video.ended) { resolve(); return; }

      const onEnded = () => {
        video.removeEventListener('ended', onEnded);
        clearTimeout(timeout);
        console.log(`[Pegaso] ✅ Video terminato`);
        resolve();
      };

      video.addEventListener('ended', onEnded);

      const timeout = setTimeout(() => {
        video.removeEventListener('ended', onEnded);
        console.log(`[Pegaso] ⏱️ Timeout raggiunto, passo alla prossima lezione`);
        resolve();
      }, (durata_secondi + 60) * 1000);
    });
  }

  // ── Aspetta che il nuovo video si carichi e parta ─────────
  async function aspettaCambioVideo(secondiMax = 15) {
    const video = document.getElementById('video');
    if (!video) { await sleep(5000); return; }
    let attesa = 0;
    while (video.paused && attesa < secondiMax * 1000) {
      await sleep(500);
      attesa += 500;
    }
    await sleep(1000);
  }

  // Processa un capitolo: clicca "Obiettivi" e (se non SOLO_OBIETTIVI) avvia
  // i video da completare. Ritorna true se l'obiettivo % è stato raggiunto.
  async function processaCapitolo(indiceCapitolo, headerCapitolo, prossimoHeader) {
    const numCap = indiceCapitolo + 1;

    // Sempre: clicca "Obiettivi" (registra la visualizzazione).
    await cliccaObiettivi(headerCapitolo, prossimoHeader);

    if (SOLO_OBIETTIVI) {
      console.log(`[Pegaso] 🎯 Capitolo ${numCap}: solo Obiettivi (video saltati).`);
      return false;
    }

    const lezioniTutte = raccogliLezioniVideo(headerCapitolo, prossimoHeader);
    const lezioniDaFare = lezioniTutte
      .filter(l => l.percentuale < 100)
      .sort((a, b) => b.durata_secondi - a.durata_secondi);

    if (lezioniTutte.length === 0) {
      console.log(`[Pegaso] ⚠️  Capitolo ${numCap}: 0 righe video rilevate (selettori cambiati?).`);
      return false;
    }
    if (lezioniDaFare.length === 0) {
      console.log(`[Pegaso] ✔️  Capitolo ${numCap}: già completato.`);
      return false;
    }

    console.log(`[Pegaso] 📖 Capitolo ${numCap}: ${lezioniDaFare.length} video da completare`);

    for (const lezione of lezioniDaFare) {
      const pctAttuale = leggiPercentualeTotale();
      if (pctAttuale >= OBIETTIVO_PERCENTUALE) {
        console.log(`[Pegaso] 🏁 Obiettivo ${OBIETTIVO_PERCENTUALE}% raggiunto (${pctAttuale}%). Script terminato.`);
        console.log('[Pegaso] ℹ️  Premi F5 per aggiornare la pagina.');
        return true;
      }

      const min = Math.floor(lezione.durata_secondi / 60);
      const sec = lezione.durata_secondi % 60;
      console.log(`[Pegaso] ▶️  "${lezione.titolo}" (${min}:${String(sec).padStart(2, '0')})`);

      clickReale(lezione.elemento);
      await aspettaCambioVideo(15);
      await aspettaFineVideo(lezione.durata_secondi);
      await sleep(PAUSA_TRA_LEZIONI_MS);
    }

    return false;
  }

  // ══════════════════════════════════════════════════════════
  //  INIZIO
  // ══════════════════════════════════════════════════════════

  console.log('═══════════════════════════════════════════════');
  if (TEST_MODE) {
    console.log('[Pegaso] 🧪 MODALITÀ TEST - SOLO 1 video (il più corto)');
  } else if (SOLO_OBIETTIVI) {
    console.log(`[Pegaso] 🎯 MODALITÀ SOLO OBIETTIVI - dal cap. ${CAPITOLO_INIZIO}, video saltati`);
  } else {
    console.log(`[Pegaso] 🚀 MODALITÀ COMPLETA - dal cap. ${CAPITOLO_INIZIO} fino al ${OBIETTIVO_PERCENTUALE}%`);
  }
  console.log('═══════════════════════════════════════════════');

  const percentualeIniziale = leggiPercentualeTotale();
  console.log(`[Pegaso] 📊 Percentuale attuale del corso: ${percentualeIniziale}%`);

  if (!TEST_MODE && percentualeIniziale >= OBIETTIVO_PERCENTUALE) {
    console.log(`[Pegaso] ✅ Sei già al ${percentualeIniziale}%! Obiettivo raggiunto.`);
    return;
  }

  // ── Raccoglie i capitoli disponibili ─────────────────────
  const capitoli = raccogliCapitoli();
  console.log(`[Pegaso] 📂 Trovati ${capitoli.length} capitoli nella sidebar`);

  if (capitoli.length === 0) {
    console.log('[Pegaso] ❌ Nessun capitolo trovato. Controlla di essere nella pagina giusta con la sidebar aperta.');
    return;
  }

  // ══════════════════════════════════════════════════════════
  //  MODALITÀ TEST
  // ══════════════════════════════════════════════════════════
  if (TEST_MODE) {
    // Apre il primo capitolo e testa il video più corto
    console.log('[Pegaso] 🧪 Apro il primo capitolo per il test...');
    const headerCorrente = capitoli[0].elemento;
    const headerProssimo = capitoli[1] ? capitoli[1].elemento : null;
    await apriCapitolo(capitoli[0], headerProssimo);

    const lezioni = raccogliLezioniVideo(headerCorrente, headerProssimo);
    const lezioniPerTest = lezioni
      .filter(l => l.percentuale < 100)
      .sort((a, b) => a.durata_secondi - b.durata_secondi);

    const videoTest = lezioniPerTest[0];
    if (!videoTest) {
      console.log('[Pegaso] ❌ Nessun video non completato trovato nel primo capitolo.');
      return;
    }

    const min = Math.floor(videoTest.durata_secondi / 60);
    const sec = videoTest.durata_secondi % 60;
    console.log(`[Pegaso] 🧪 Video scelto per il test: "${videoTest.titolo}"`);
    console.log(`[Pegaso] ⏱️  Durata: ${min}:${String(sec).padStart(2, '0')}`);
    console.log(`[Pegaso] 📈 Percentuale attuale di questo video: ${videoTest.percentuale}%`);
    console.log('[Pegaso] ▶️  Clicco sulla lezione...');

    videoTest.elemento.click();
    await aspettaCambioVideo(15);
    await aspettaFineVideo(videoTest.durata_secondi);

    console.log('');
    console.log('[Pegaso] 🧪 TEST COMPLETATO.');
    console.log('[Pegaso] ℹ️  Se tutto ok → cambia TEST_MODE = false e riesegui.');
    return;
  }

  // ═══ MODALITÀ COMPLETA — loop sui capitoli ═══
  // I riferimenti DOM vengono ri-presi ad ogni iterazione: la SPA rerendera
  // la sidebar dopo ogni navigazione/click.
  const totaleCapitoli = capitoli.length;
  const indiceInizio = Math.max(0, (CAPITOLO_INIZIO || 1) - 1);

  for (let i = indiceInizio; i < totaleCapitoli; i++) {
    const numeroCapitolo = i + 1;
    if (SOLO_CAPITOLI && !SOLO_CAPITOLI.includes(numeroCapitolo)) continue;

    const pctCorso = leggiPercentualeTotale();
    console.log(`\n[Pegaso] ════════════════════════════════════`);
    console.log(`[Pegaso] 📂 Capitolo ${numeroCapitolo} di ${totaleCapitoli} — Corso al ${pctCorso}%`);

    if (!SOLO_OBIETTIVI && pctCorso >= OBIETTIVO_PERCENTUALE) {
      console.log(`[Pegaso] 🏁 Obiettivo ${OBIETTIVO_PERCENTUALE}% raggiunto! Script terminato.`);
      console.log('[Pegaso] ℹ️  Premi F5 per aggiornare la pagina.');
      return;
    }

    // Allinea l'URL della SPA al capitolo (Vue Router popola la sidebar).
    await navigaACapitolo(numeroCapitolo);

    // Re-fetch dei riferimenti DOM (sono stale dopo ogni rerender SPA).
    const capitoliCorrenti = raccogliCapitoli();
    if (i >= capitoliCorrenti.length) {
      console.log(`[Pegaso] ⚠️  Indice capitolo fuori range (${i} ≥ ${capitoliCorrenti.length}). Mi fermo.`);
      return;
    }

    const capCorrente = capitoliCorrenti[i];
    const capProssimo = capitoliCorrenti[i + 1];
    const headerCorrente = capCorrente.elemento;
    const headerProssimo = capProssimo ? capProssimo.elemento : null;

    // Chiude il precedente per non gonfiare il virtual scroll.
    if (i > indiceInizio && capitoliCorrenti[i - 1]) {
      await chiudiCapitolo(capitoliCorrenti[i - 1], headerCorrente);
    }

    const figliOk = await apriCapitolo(capCorrente, headerProssimo);
    if (!figliOk) {
      console.log(`[Pegaso] ⚠️  Capitolo ${numeroCapitolo}: figli non renderizzati, retry...`);
      await sleep(1000);
      headerCorrente.scrollIntoView({ block: 'center' });
      await sleep(800);
      await apriCapitolo(capCorrente, headerProssimo);
    }
    await sleep(500);

    const obiettivoRaggiunto = await processaCapitolo(i, headerCorrente, headerProssimo);
    if (obiettivoRaggiunto) return;

    await sleep(800);
  }

  console.log('\n[Pegaso] ✅ Tutti i capitoli processati. Premi F5 per vedere la percentuale finale.');

})();
