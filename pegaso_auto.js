(async function () {

  const TEST_MODE = false;
  const OBIETTIVO_PERCENTUALE = 70;
  const PAUSA_TRA_LEZIONI_MS = 3000;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── Legge la percentuale totale del corso ─────────────────
  function leggiPercentualeTotale() {
    const el = document.querySelector('.number-container .text-sm.font-medium');
    if (!el) return 0;
    return parseInt(el.textContent.replace('%', '').trim(), 10) || 0;
  }

  // ── Raccoglie tutti i capitoli (aperti o chiusi) ──────────
  // Restituisce array di { elemento, aperto }
  function raccogliCapitoli() {
    const intestazioni = document.querySelectorAll('.cursor-pointer.relative.align-middle');
    return Array.from(intestazioni).map(el => {
      const chevronDown = el.querySelector('path[id="chevron-down-Filled_1_"]');
      return { elemento: el, aperto: !chevronDown };
    });
  }

  // ── Apre un singolo capitolo (se non è già aperto) ────────
  async function apriCapitolo(capitolo) {
    if (!capitolo.aperto) {
      capitolo.elemento.click();
      await sleep(800); // aspetta animazione apertura
    }
  }

  // ── Chiude un singolo capitolo (se non è già chiuso) ──────
  async function chiudiCapitolo(capitolo) {
    // Rilegge lo stato attuale dal DOM
    const chevronDown = capitolo.elemento.querySelector('path[id="chevron-down-Filled_1_"]');
    const eAperto = !chevronDown;
    if (eAperto) {
      capitolo.elemento.click();
      await sleep(500);
    }
  }

  // ── Trova e clicca l'item "Obiettivi" del capitolo aperto ──
  // L'item Obiettivi è identificato dall'SVG con id "bullseye-arrow"
  // (univoco, non presente sulle righe video).
  // Restituisce true se ha cliccato qualcosa, false se non trovato.
  async function cliccaObiettivi() {
    const svgObiettivi = document.querySelector('svg path[id="bullseye-arrow"]');
    if (!svgObiettivi) {
      console.log('[Pegaso] ℹ️  Item "Obiettivi" non trovato in questo capitolo.');
      return false;
    }

    // Risale al div cliccabile più vicino
    const cliccabile = svgObiettivi.closest('.cursor-pointer');
    if (!cliccabile) {
      console.log('[Pegaso] ⚠️  Trovato "Obiettivi" ma nessun contenitore cliccabile.');
      return false;
    }

    console.log('[Pegaso] 🎯 Clicco su "Obiettivi"...');
    cliccabile.click();
    // Pausa per dare tempo alla piattaforma di registrare la visualizzazione
    await sleep(2500);
    return true;
  }

  // ── Raccoglie le lezioni VIDEO dentro i capitoli APERTI ───
  function raccogliLezioniVideo() {
    const risultati = [];
    const righe = document.querySelectorAll('[data-v-5c42503f].border-t.hover\\:bg-platform-hover-light');

    for (const riga of righe) {
      const durataEl = riga.querySelector('.text-sm.text-platform-gray');
      if (!durataEl) continue;
      const durataStr = durataEl.textContent.trim();
      if (!durataStr.includes(':')) continue;

      const parti = durataStr.split(':');
      const durata_secondi = parseInt(parti[0], 10) * 60 + parseInt(parti[1], 10);

      const titoloEl = riga.querySelector('.mb-2');
      const titolo = titoloEl ? titoloEl.textContent.trim() : '(senza titolo)';

      const barraEl = riga.querySelector('.absolute.h-1\\.5.rounded-full');
      let percentuale = 0;
      if (barraEl) {
        const stile = barraEl.getAttribute('style') || '';
        const match = stile.match(/width:\s*([\d.]+)%/);
        if (match) percentuale = parseFloat(match[1]);
      }

      const svgPath = riga.querySelector('path[id="Tracciato_189"]');
      if (!svgPath) continue;

      const cliccabile = riga.querySelector('.cursor-pointer');
      if (!cliccabile) continue;

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
  // Restituisce true se l'obiettivo è già stato raggiunto
  async function processaCapitolo(indiceCapitolo, nomeCapitolo) {
    // 1. Clicca SEMPRE su "Obiettivi" all'apertura del capitolo
    //    (anche se i video sono già completati al 100%)
    await cliccaObiettivi();

    const lezioniTutte = raccogliLezioniVideo();
    const lezioniDaFare = lezioniTutte
      .filter(l => l.percentuale < 100)
      .sort((a, b) => b.durata_secondi - a.durata_secondi);

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

      lezione.elemento.click();

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
    await apriCapitolo(capitoli[0]);

    const lezioni = raccogliLezioniVideo();
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
  for (let i = 0; i < capitoli.length; i++) {
    const pctCorso = leggiPercentualeTotale();
    console.log(`\n[Pegaso] ════════════════════════════════════`);
    console.log(`[Pegaso] 📂 Capitolo ${i + 1} di ${capitoli.length} — Corso al ${pctCorso}%`);

    if (pctCorso >= OBIETTIVO_PERCENTUALE) {
      console.log(`[Pegaso] 🏁 Obiettivo ${OBIETTIVO_PERCENTUALE}% raggiunto! Script terminato.`);
      console.log('[Pegaso] ℹ️  Premi F5 per aggiornare la pagina.');
      return;
    }

    // 1. Chiude tutti i capitoli tranne quello corrente
    //    (opzionale ma aiuta a isolare le lezioni del capitolo giusto)
    for (let j = 0; j < capitoli.length; j++) {
      if (j !== i) await chiudiCapitolo(capitoli[j]);
    }

    // 2. Apre il capitolo corrente
    await apriCapitolo(capitoli[i]);
    await sleep(500); // attesa extra per sicurezza DOM

    // 3. Processa i video di questo capitolo
    const obiettivoRaggiunto = await processaCapitolo(i, `Capitolo ${i + 1}`);
    if (obiettivoRaggiunto) return;

    console.log(`[Pegaso] ✅ Capitolo ${i + 1} completato, passo al successivo...`);
    await sleep(1000);
  }

  console.log('\n[Pegaso] ✅ Tutti i capitoli processati. Premi F5 per vedere la percentuale finale.');

})();
