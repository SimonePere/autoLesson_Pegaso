(async function () {

  const TEST_MODE = false;
  const OBIETTIVO_PERCENTUALE = 70;
  const PAUSA_TRA_LEZIONI_MS = 3000;

  // ── Limita l'esecuzione a un range di capitoli (1-based, inclusivo) ──
  // Esempio: SOLO_CAPITOLI = [37, 38] esegue solo i capitoli 37 e 38.
  // Lascia null per processare tutti i capitoli.
  const SOLO_CAPITOLI = null;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── Simula un click REALE ──
  // Diagnostica ha confermato: il listener di toggle NON è sull'header
  // ".cursor-pointer.relative.align-middle" ma su un suo figlio interno.
  // L'unico modo che funziona è chiamare .click() sul VERO elemento topmost
  // alle coordinate del centro (quello che riceverebbe un click umano).
  //
  // IMPORTANTE: NIENTE dispatch di pointerdown/mousedown prima del click.
  // Su questa piattaforma alcuni capitoli reagiscono al toggle SU pointerdown,
  // poi il successivo .click() lo richiude → "doppio toggle" che lascia il
  // capitolo nello stato originale. Il diagnostico ha mostrato che la sola
  // cosa che apre in modo affidabile è `topmost.click()` puro.
  function clickReale(elemento) {
    if (!elemento || !elemento.isConnected) return;

    // Scrolla in vista PRIMA di calcolare le coordinate (elementFromPoint
    // ritorna l'elemento alle coordinate del viewport, non del documento)
    try {
      const r0 = elemento.getBoundingClientRect();
      if (r0.top < 0 || r0.bottom > window.innerHeight) {
        elemento.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    } catch { }

    const rect = elemento.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    // Trova il VERO elemento topmost alle coordinate.
    // Se per qualche motivo non lo troviamo o non è dentro il nostro elemento,
    // facciamo fallback sull'elemento originale.
    let target = document.elementFromPoint(x, y);
    if (!target || (!elemento.contains(target) && target !== elemento)) {
      target = elemento;
    }

    // Click vero sul topmost: l'unica cosa che ha funzionato nel diagnostico.
    try { target.click(); } catch { }
  }

  // ── Stato "aperto" basato sul CONTENUTO REALE (ground truth) ──
  // Un capitolo è aperto se nel suo container ci sono figli renderizzati
  // (durate mm:ss o icona bullseye-arrow). NON usiamo il chevron come
  // sorgente di verità: i suoi <path> SVG hanno ID auto-numerati (_1_, _2_,
  // ...) che cambiano dopo i re-render Vue → falsi negativi che fanno
  // saltare interi capitoli.
  function capitoloAperto(headerCapitolo, prossimoHeader) {
    return haFigliNelRange(headerCapitolo, prossimoHeader);
  }

  // ── Legge la percentuale totale del corso ─────────────────
  function leggiPercentualeTotale() {
    const el = document.querySelector('.number-container .text-sm.font-medium');
    if (!el) return 0;
    return parseInt(el.textContent.replace('%', '').trim(), 10) || 0;
  }

  // ── Raccoglie tutti i VERI capitoli (esclude header di sezione tipo "Lezioni") ──
  // Restituisce array di { elemento, aperto }
  function raccogliCapitoli() {
    const intestazioni = document.querySelectorAll('.cursor-pointer.relative.align-middle');
    return Array.from(intestazioni)
      .filter(el => {
        // Tieni solo header che iniziano con "NUMERO - TITOLO" (es. "13 - Problemi di...")
        // Esclude la voce di sezione "Lezioni" e simili.
        const testo = (el.textContent || '').trim();
        return /^\d+\s*[-–]\s*\S/.test(testo);
      })
      .map(el => {
        const chevronDown = el.querySelector('path[id="chevron-down-Filled_1_"]');
        return { elemento: el, aperto: !chevronDown };
      });
  }

  // ── Attende che il header sia DAVVERO renderizzato (ha almeno un SVG path) ──
  // A causa del virtual scroll, un header fuori viewport può avere solo il container
  // ma non il suo contenuto interno (chevron, ecc.) nel DOM.
  async function attendiHeaderRenderizzato(headerCapitolo, maxMs = 3000) {
    let attesa = 0;
    while (attesa < maxMs) {
      if (headerCapitolo.querySelector('svg path')) return true;
      await sleep(200);
      attesa += 200;
    }
    return false;
  }

  // ── Apre un singolo capitolo con polling affidabile (NON chiude mai) ──
  // Strategia robusta contro il virtual scroll + Vue:
  //  1) Scroll into view + attesa header renderizzato
  //  2) Loop fino a MAX_TENTATIVI: se chiuso → click reale → verifica
  //     che il chevron sia DAVVERO cambiato. Se no, riscrolla e riprova.
  //  3) Quando il chevron è "up" (aperto), poll sui figli per max 5s.
  // Restituisce true se al termine ci sono figli renderizzati.
  async function apriCapitolo(capitolo, prossimoHeader) {
    const MAX_TENTATIVI = 5;

    // 1. Scrolla l'header nella viewport
    try {
      capitolo.elemento.scrollIntoView({ block: 'center', behavior: 'instant' });
    } catch {
      capitolo.elemento.scrollIntoView();
    }
    await sleep(400);

    // 2. Attesa che il header sia renderizzato (virtual scroll)
    await attendiHeaderRenderizzato(capitolo.elemento);

    // 2b. Attesa "grace period" per dare tempo ai figli di apparire se il
    //     capitolo era GIÀ aperto (es. quelli completati prima dello script).
    //     Senza questa attesa entriamo subito nel retry-loop e clicchiamo
    //     inutilmente (rischiando anche di CHIUDERLO al primo click).
    let attesaIniziale = 0;
    while (attesaIniziale < 1200 && !capitoloAperto(capitolo.elemento, prossimoHeader)) {
      await sleep(200);
      attesaIniziale += 200;
    }

    // 3. Loop di apertura basato sul CONTENUTO REALE (non sul chevron).
    //    Il chevron-down ha ID auto-numerati (_1_, _2_, ...) che cambiano
    //    dopo i re-render Vue, quindi non è una fonte di verità affidabile.
    //    Affidiamoci alla presenza dei figli del capitolo.
    for (let tentativo = 1; tentativo <= MAX_TENTATIVI; tentativo++) {
      // Già aperto (figli presenti nel suo container)? Bene.
      if (capitoloAperto(capitolo.elemento, prossimoHeader)) break;

      // Riassicura la posizione PRIMA di ogni click (la chiusura del precedente
      // o il render del virtual scroll possono aver mosso l'elemento).
      try {
        capitolo.elemento.scrollIntoView({ block: 'center', behavior: 'instant' });
      } catch { }
      await sleep(250);
      await attendiHeaderRenderizzato(capitolo.elemento, 1500);

      clickReale(capitolo.elemento);

      // Aspetto che i figli appaiano (max ~1.5s a tentativo)
      let atteso = 0;
      const passo = 150;
      const limite = 1500;
      while (atteso < limite && !capitoloAperto(capitolo.elemento, prossimoHeader)) {
        await sleep(passo);
        atteso += passo;
      }

      if (capitoloAperto(capitolo.elemento, prossimoHeader)) break; // aperto!

      if (tentativo < MAX_TENTATIVI) {
        console.log(`[Pegaso] 🔁 Capitolo non aperto, retry click ${tentativo + 1}/${MAX_TENTATIVI}...`);
        await sleep(300 + tentativo * 200); // backoff progressivo
      }
    }

    // 4. Polling finale: aspetta finché i figli sono renderizzati (max 5s)
    return await attendiFigli(capitolo.elemento, prossimoHeader, 5000);
  }

  // ── Polling: aspetta che ci siano figli renderizzati nel container del capitolo ──
  async function attendiFigli(headerCapitolo, prossimoHeader, maxMs = 4000) {
    let attesa = 0;
    while (attesa < maxMs) {
      if (haFigliNelRange(headerCapitolo, prossimoHeader)) return true;
      await sleep(300);
      attesa += 300;
    }
    return false;
  }

  // ── Verifica se nel container del capitolo c'è ALMENO un figlio interessante ──
  // Cerca segnali tipici: SVG bullseye-arrow, durate mm:ss.
  function haFigliNelRange(headerCapitolo, prossimoHeader) {
    const container = trovaContainerCapitolo(headerCapitolo, prossimoHeader);
    if (!container) return false;
    const durate = container.querySelectorAll('.text-sm.text-platform-gray');
    for (const d of durate) {
      const txt = (d.textContent || '').trim();
      if (/^\d{1,3}:\d{2}$/.test(txt)) return true;
    }
    // Anche l'icona bullseye-arrow può avere ID auto-numerati: usa starts-with
    if (container.querySelector('svg path[id^="bullseye-arrow"]')) return true;
    return false;
  }

  // ── Chiude un singolo capitolo (con verifica del cambio di stato) ──
  // Usa la presenza dei figli come ground truth (non il chevron).
  async function chiudiCapitolo(capitolo, prossimoHeader) {
    try { capitolo.elemento.scrollIntoView({ block: 'center' }); } catch { }
    await sleep(200);
    // Attendi che il header sia renderizzato prima di leggere lo stato
    await attendiHeaderRenderizzato(capitolo.elemento, 1500);

    // Se è già chiuso (nessun figlio renderizzato), non fare nulla
    if (!capitoloAperto(capitolo.elemento, prossimoHeader)) return;

    // Loop di chiusura con verifica
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

  // ── Helper: trova il CONTAINER del capitolo corrente ──
  // Risale dal header finché il wrapper contiene il header MA NON il prossimo header.
  // Questo è il modo più robusto per isolare i contenuti di UN solo capitolo:
  // niente DOM-range fragili, solo "il più piccolo ancestor che contiene solo questo capitolo".
  function trovaContainerCapitolo(headerCapitolo, prossimoHeader) {
    if (!headerCapitolo || !headerCapitolo.isConnected) return null;

    let candidato = headerCapitolo.parentElement;
    while (candidato) {
      // Se il candidato contiene anche il prossimo header, siamo saliti troppo → torna giù
      if (prossimoHeader && prossimoHeader.isConnected && candidato.contains(prossimoHeader)) {
        // Il livello precedente è quello giusto, ma se abbiamo già fatto un solo passo,
        // torniamo lo stesso parentElement (caso del primo capitolo che parte da una root)
        break;
      }
      // Il candidato è buono se contiene il header E almeno UN figlio "interessante"
      // (durata mm:ss o bullseye-arrow) oltre al solo header.
      const haContenuti =
        candidato.querySelector('svg path[id^="bullseye-arrow"]') ||
        Array.from(candidato.querySelectorAll('.text-sm.text-platform-gray'))
          .some(d => /^\d{1,3}:\d{2}$/.test((d.textContent || '').trim()));
      if (haContenuti) {
        // Promuovo: salgo ancora di un livello per essere sicuro di abbracciare
        // tutti i figli del capitolo (a volte il wrapper diretto non basta)
        const piuSu = candidato.parentElement;
        if (piuSu && (!prossimoHeader || !piuSu.contains(prossimoHeader))) {
          candidato = piuSu;
          continue;
        }
        return candidato;
      }
      candidato = candidato.parentElement;
    }

    // Fallback: ritorna il parent diretto del header
    return headerCapitolo.parentElement || headerCapitolo;
  }

  // ── Helper legacy: true se `el` è nel DOM TRA `inizio` (esclusivo) e `fine` (esclusivo) ──
  // Mantenuto come fallback per haFigliNelRange.
  function elementoNelRange(el, inizio, fine) {
    if (!el || !inizio || !el.isConnected || !inizio.isConnected) return false;
    const dopoInizio = inizio.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING;
    if (!dopoInizio) return false;
    if (fine && fine.isConnected) {
      const primaDelFine = el.compareDocumentPosition(fine) & Node.DOCUMENT_POSITION_FOLLOWING;
      if (!primaDelFine) return false;
    }
    return true;
  }

  // ── Trova e clicca l'item "Obiettivi" del SOLO capitolo corrente ──
  // Cerca i bullseye-arrow nel CONTAINER del capitolo (approccio robusto).
  // Restituisce il numero di item cliccati (di solito 0 o 1).
  async function cliccaObiettivi(headerCapitolo, prossimoHeader) {
    const container = trovaContainerCapitolo(headerCapitolo, prossimoHeader);
    if (!container) {
      console.log('[Pegaso] ℹ️  Container capitolo non trovato.');
      return 0;
    }
    const svgs = container.querySelectorAll('svg path[id="bullseye-arrow"]');

    if (svgs.length === 0) {
      console.log('[Pegaso] ℹ️  Item "Obiettivi" non trovato in questo capitolo.');
      return 0;
    }

    let cliccati = 0;
    for (const svg of svgs) {
      // Cerca il container cliccabile salendo l'albero, con vari fallback
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

      if (!cliccabile) {
        console.log('[Pegaso] ⚠️  Trovato "Obiettivi" ma nessun contenitore cliccabile.');
        continue;
      }

      console.log('[Pegaso] 🎯 Clicco su "Obiettivi"...');
      clickReale(cliccabile);
      cliccati++;
      // Pausa per dare tempo alla piattaforma di registrare la visualizzazione
      await sleep(2500);
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

  // ── Processa tutti i video di UN capitolo ─────────────────
  // Restituisce true se l'obiettivo è già stato raggiunto.
  // headerCapitolo / prossimoHeader = elementi DOM dei due capitoli consecutivi,
  // usati per scopare le ricerche al solo capitolo corrente.
  async function processaCapitolo(indiceCapitolo, headerCapitolo, prossimoHeader) {
    // Log diagnostico: mostra il titolo letto dal header per verificare l'allineamento
    const titoloCap = (headerCapitolo?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    console.log(`[Pegaso] 🧭 Capitolo ${indiceCapitolo + 1} header: "${titoloCap}"`);

    // 1. Clicca su "Obiettivi" del SOLO capitolo corrente
    //    (anche se i video sono già completati al 100%)
    await cliccaObiettivi(headerCapitolo, prossimoHeader);

    const lezioniTutte = raccogliLezioniVideo(headerCapitolo, prossimoHeader);
    const lezioniDaFare = lezioniTutte
      .filter(l => l.percentuale < 100)
      .sort((a, b) => b.durata_secondi - a.durata_secondi);

    console.log(`[Pegaso] 🔎 Righe video rilevate: ${lezioniTutte.length} (di cui ${lezioniDaFare.length} da completare)`);

    if (lezioniTutte.length === 0) {
      console.log(`[Pegaso] ⚠️  Capitolo ${indiceCapitolo + 1}: 0 righe video rilevate. Possibile cambio dei selettori della piattaforma.`);
      return false;
    }

    if (lezioniDaFare.length === 0) {
      console.log(`[Pegaso] ✔️  Capitolo ${indiceCapitolo + 1}: nessun video da completare, passo oltre.`);
      return false;
    }

    console.log(`[Pegaso] 📖 Capitolo ${indiceCapitolo + 1}: ${lezioniDaFare.length} video da completare`);

    for (const lezione of lezioniDaFare) {
      const pctAttuale = leggiPercentualeTotale();
      console.log(`\n[Pegaso] 📊 Percentuale corso: ${pctAttuale}%`);

      if (pctAttuale >= OBIETTIVO_PERCENTUALE) {
        console.log(`[Pegaso] 🏁 Obiettivo ${OBIETTIVO_PERCENTUALE}% raggiunto! Script terminato.`);
        console.log('[Pegaso] ℹ️  Premi F5 per aggiornare la pagina.');
        return true; // segnala "obiettivo raggiunto"
      }

      const min = Math.floor(lezione.durata_secondi / 60);
      const sec = lezione.durata_secondi % 60;
      console.log(`[Pegaso] ▶️  Avvio: "${lezione.titolo}" (durata: ${min}:${String(sec).padStart(2, '0')})`);

      clickReale(lezione.elemento);

      console.log('[Pegaso] ⏳ Attendo che il video si carichi...');
      await aspettaCambioVideo(15);

      console.log(`[Pegaso] ⏳ Video in riproduzione, aspetto la fine (~${min} minuti)...`);
      await aspettaFineVideo(lezione.durata_secondi);

      console.log(`[Pegaso] ⏸️  Pausa di ${PAUSA_TRA_LEZIONI_MS / 1000}s...`);
      await sleep(PAUSA_TRA_LEZIONI_MS);
    }

    return false;
  }

  // ══════════════════════════════════════════════════════════
  //  INIZIO
  // ══════════════════════════════════════════════════════════

  console.log('═══════════════════════════════════════════════');
  if (TEST_MODE) {
    console.log('[Pegaso] 🧪 MODALITÀ TEST - verrà eseguito SOLO 1 video (il più corto)');
  } else {
    console.log('[Pegaso] 🚀 MODALITÀ COMPLETA - va avanti capitolo per capitolo fino al 70%');
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

  // ══════════════════════════════════════════════════════════
  //  MODALITÀ COMPLETA — loop sui capitoli
  // ══════════════════════════════════════════════════════════
  // NB: il numero totale di capitoli viene fissato all'inizio,
  // ma le REFERENCE agli elementi DOM vengono ri-prese ad ogni iterazione
  // perché la SPA Vue rerendera la sidebar dopo ogni navigazione (es. clic su Obiettivi).
  const totaleCapitoli = capitoli.length;

  for (let i = 0; i < totaleCapitoli; i++) {
    // Salta i capitoli fuori dal range SOLO_CAPITOLI (se impostato)
    const numeroCapitolo = i + 1;
    if (SOLO_CAPITOLI && !SOLO_CAPITOLI.includes(numeroCapitolo)) {
      continue;
    }

    const pctCorso = leggiPercentualeTotale();
    console.log(`\n[Pegaso] ════════════════════════════════════`);
    console.log(`[Pegaso] 📂 Capitolo ${i + 1} di ${totaleCapitoli} — Corso al ${pctCorso}%`);

    if (pctCorso >= OBIETTIVO_PERCENTUALE) {
      console.log(`[Pegaso] 🏁 Obiettivo ${OBIETTIVO_PERCENTUALE}% raggiunto! Script terminato.`);
      console.log('[Pegaso] ℹ️  Premi F5 per aggiornare la pagina.');
      return;
    }

    // Ri-raccoglie i capitoli FRESCHI dal DOM (i riferimenti vecchi sono stale
    // dopo ogni navigazione SPA causata dal click su Obiettivi/video)
    const capitoliCorrenti = raccogliCapitoli();
    if (i >= capitoliCorrenti.length) {
      console.log(`[Pegaso] ⚠️  Indice capitolo fuori range dopo re-fetch (${i} ≥ ${capitoliCorrenti.length}). Mi fermo.`);
      return;
    }

    const capCorrente = capitoliCorrenti[i];
    const capProssimo = capitoliCorrenti[i + 1]; // può essere undefined sull'ultimo
    const headerCorrente = capCorrente.elemento;
    const headerProssimo = capProssimo ? capProssimo.elemento : null;

    // Chiude il capitolo PRECEDENTE per non gonfiare la sidebar
    // (con 40+ capitoli aperti il virtual scroll diventa instabile)
    if (i > 0 && capitoliCorrenti[i - 1]) {
      // Per scopare correttamente il container del precedente passiamo
      // come "prossimoHeader" l'header del capitolo corrente.
      await chiudiCapitolo(capitoliCorrenti[i - 1], headerCorrente);
    }

    // Apre il capitolo corrente con scroll-into-view + apertura forzata
    // (la sidebar usa virtual scroll: senza questo i figli non sono nel DOM)
    const figliOk = await apriCapitolo(capCorrente, headerProssimo);
    if (!figliOk) {
      console.log(`[Pegaso] ⚠️  Capitolo ${i + 1}: figli non renderizzati dopo l'apertura. Riprovo a scrollare e re-apro fra 1s...`);
      await sleep(1000);
      headerCorrente.scrollIntoView({ block: 'center' });
      await sleep(800);
      await apriCapitolo(capCorrente, headerProssimo);
    }
    await sleep(500); // attesa extra per sicurezza DOM

    // Processa i video di questo capitolo
    const obiettivoRaggiunto = await processaCapitolo(i, headerCorrente, headerProssimo);
    if (obiettivoRaggiunto) return;

    console.log(`[Pegaso] ✅ Capitolo ${i + 1} completato, passo al successivo...`);
    await sleep(1000);
  }

  console.log('\n[Pegaso] ✅ Tutti i capitoli processati. Premi F5 per vedere la percentuale finale.');

})();
