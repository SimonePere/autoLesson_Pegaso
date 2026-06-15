# 🎓 AutoLesson Pegaso

> Script JavaScript da console per automatizzare la visualizzazione delle lezioni video sulla piattaforma e-learning **Pegaso / Mercatorum / San Raffaele** e raggiungere automaticamente la percentuale di completamento richiesta per accedere all'esame.

[![JavaScript](https://img.shields.io/badge/JavaScript-ES2017+-yellow.svg)](https://developer.mozilla.org/it/docs/Web/JavaScript)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-Browser%20Console-blue.svg)]()

---

## 📋 Indice

- [Cosa fa](#-cosa-fa)
- [Come funziona](#-come-funziona)
- [Requisiti](#-requisiti)
- [Installazione e utilizzo](#-installazione-e-utilizzo)
- [Configurazione](#-configurazione)
- [Modalità di esecuzione](#-modalità-di-esecuzione)
- [Output di esempio](#-output-di-esempio)
- [FAQ](#-faq)
- [Troubleshooting](#-troubleshooting)
- [Disclaimer](#%EF%B8%8F-disclaimer)
- [Licenza](#-licenza)

---

## 🎯 Cosa fa

Lo script automatizza completamente il processo di visualizzazione delle lezioni di un corso sulla piattaforma Pegaso:

- 📂 **Itera tutti i capitoli** del corso aperti nella sidebar
- 🎯 **Clicca automaticamente sugli "Obiettivi"** di ogni capitolo (richiesti per il completamento)
- ▶️ **Avvia in sequenza ogni video non completato**, partendo dai più lunghi
- ⏱️ **Aspetta la fine effettiva** di ogni video (rileva l'evento `ended` dal tag `<video>`)
- 📊 **Monitora in tempo reale la percentuale totale** del corso
- 🏁 **Si ferma automaticamente** appena raggiunta la soglia configurata (default **70%**)
- 🧪 Include una **modalità test** per validare il funzionamento con un solo video

---

## 🔧 Come funziona

Lo script viene incollato nella **console del browser** (DevTools) mentre la pagina del corso Pegaso è aperta, e sfrutta i selettori del DOM della piattaforma per:

1. Leggere la percentuale totale del corso dal contatore in alto
2. Trovare tutti i capitoli nella sidebar (`.cursor-pointer.relative.align-middle`)
3. Chiudere tutti i capitoli tranne quello in lavorazione (per isolare le lezioni)
4. Cliccare l'item **"Obiettivi"** (identificato dall'icona SVG `bullseye-arrow`)
5. Raccogliere le lezioni video con durata, titolo e percentuale di completamento
6. Cliccare la lezione, attendere il caricamento del player, e aspettare l'evento `ended`
7. Passare alla lezione successiva con una breve pausa
8. Ripetere finché non si raggiunge il **70%** (configurabile)

---

## ✅ Requisiti

- Un **browser moderno** (Chrome, Edge, Firefox, Brave...)
- Un account attivo sulla piattaforma **Pegaso / Mercatorum / San Raffaele**
- Essere loggati e trovarsi nella **pagina del corso** con la **sidebar dei capitoli visibile**
- Conoscenza di base per aprire la **Console** del browser (`F12`)

---

## 📥 Installazione e utilizzo

### 1. Apri la pagina del corso

Naviga sulla piattaforma Pegaso e apri la pagina del corso che vuoi completare. Assicurati che:
- La **sidebar dei capitoli** sia visibile sulla sinistra
- Stai vedendo un video o sia visibile il player
- La percentuale del corso sia visibile in alto

### 2. Apri la Console del browser

Premi `F12` (o `Ctrl+Shift+I` / `Cmd+Option+I` su Mac) e vai nella scheda **Console**.

> ⚠️ Alcuni browser (Chrome) richiedono di digitare `allow pasting` la prima volta che si incolla codice in console.

### 3. Incolla lo script

Apri il file [pegaso_auto.js](pegaso_auto.js), copia tutto il contenuto e incollalo nella console. Premi `Invio`.

### 4. Lascia lavorare lo script

A questo punto puoi:
- 🪟 **Minimizzare la finestra** (ma NON chiudere la scheda)
- ☕ Andare a fare altro
- 📺 Tenere d'occhio la console per vedere i log in tempo reale

Lo script si fermerà **automaticamente** quando raggiunge il 70% (o la soglia configurata).

### 5. Aggiorna la pagina

Quando vedi il messaggio `🏁 Obiettivo raggiunto!`, premi `F5` per aggiornare la pagina e vedere la percentuale finale.

---

## ⚙️ Configurazione

In cima al file [pegaso_auto.js](pegaso_auto.js) trovi tre costanti modificabili:

```js
const TEST_MODE = false;             // true = esegue solo 1 video di test
const OBIETTIVO_PERCENTUALE = 70;    // soglia di completamento da raggiungere
const PAUSA_TRA_LEZIONI_MS = 3000;   // millisecondi di pausa tra una lezione e l'altra
```

| Parametro | Default | Descrizione |
|-----------|---------|-------------|
| `TEST_MODE` | `false` | Se `true`, esegue **un solo video** (il più corto) del primo capitolo, utile per verificare che funzioni |
| `OBIETTIVO_PERCENTUALE` | `70` | Percentuale di completamento al raggiungimento della quale lo script si ferma |
| `PAUSA_TRA_LEZIONI_MS` | `3000` | Pausa (in ms) tra la fine di un video e l'avvio del successivo |

---

## 🧪 Modalità di esecuzione

### 🟡 Modalità Test (`TEST_MODE = true`)

Prima di lanciare l'automazione completa, è **consigliato** fare un test:

1. Imposta `TEST_MODE = true`
2. Incolla lo script in console
3. Lo script aprirà il **primo capitolo** e riprodurrà **solo il video più corto** non ancora completato
4. Verifica che tutto funzioni (caricamento, rilevamento fine video, ecc.)

### 🟢 Modalità Completa (`TEST_MODE = false`)

Modalità di produzione:

1. Imposta `TEST_MODE = false` (default)
2. Incolla lo script in console
3. Lo script processerà **tutti i capitoli in sequenza**, dal primo all'ultimo
4. Per ogni capitolo: clicca "Obiettivi" → riproduce i video non completati in ordine di durata decrescente
5. Si ferma appena la percentuale totale supera `OBIETTIVO_PERCENTUALE`

---

## 📺 Output di esempio

```
═══════════════════════════════════════════════
[Pegaso] 🚀 MODALITÀ COMPLETA - va avanti capitolo per capitolo fino al 70%
═══════════════════════════════════════════════
[Pegaso] 📊 Percentuale attuale del corso: 12%
[Pegaso] 📂 Trovati 8 capitoli nella sidebar

[Pegaso] ════════════════════════════════════
[Pegaso] 📂 Capitolo 1 di 8 — Corso al 12%
[Pegaso] 🎯 Clicco su "Obiettivi"...
[Pegaso] 📖 Capitolo 1: 4 video da completare

[Pegaso] 📊 Percentuale corso: 12%
[Pegaso] ▶️  Avvio: "Introduzione al modulo" (durata: 18:42)
[Pegaso] ⏳ Attendo che il video si carichi...
[Pegaso] ⏳ Video in riproduzione, aspetto la fine (~18 minuti)...
[Pegaso] ✅ Video terminato
[Pegaso] ⏸️  Pausa di 3s...

...

[Pegaso] 🏁 Obiettivo 70% raggiunto! Script terminato.
[Pegaso] ℹ️  Premi F5 per aggiornare la pagina.
```

---

## ❓ FAQ

**D: Il video può essere messo in mute o ridotto?**
R: Sì, puoi tranquillamente mettere muto il tab e minimizzare la finestra. Lo script si basa sull'evento `ended` del tag `<video>`, non sulla visibilità.

**D: Posso usare il browser per altro mentre lo script gira?**
R: Meglio di no nello stesso tab. Apri pure un'altra finestra del browser, ma **non chiudere o ricaricare** la scheda del corso.

**D: Funziona anche su Mercatorum / San Raffaele / altre piattaforme Multiversity?**
R: Le piattaforme Multiversity (Pegaso, Mercatorum, San Raffaele) condividono in gran parte lo stesso frontend, quindi **molto probabilmente sì**. Se i selettori cambiano, potrebbero essere necessari piccoli aggiustamenti.

**D: Cosa succede se chiudo la scheda?**
R: Lo script si interrompe. Riaprila e ricomincia (riprenderà dai video non ancora completati al 100%).

**D: Lo script salta i quiz o le verifiche?**
R: Sì, processa **solo le lezioni video** (riconosciute tramite l'SVG `Tracciato_189` e la durata in formato `mm:ss`).

**D: Posso lanciarlo su più corsi contemporaneamente?**
R: Sì, basta aprire ogni corso in una scheda separata e incollare lo script in ognuna.

---

## 🐛 Troubleshooting

### ❌ "Nessun capitolo trovato"
Assicurati di essere nella **pagina del corso** con la **sidebar dei capitoli** visibile sulla sinistra. Lo script si aspetta gli elementi DOM `.cursor-pointer.relative.align-middle`.

### ❌ Il video non parte / si blocca
- Verifica che il **player video** sia visibile nella pagina prima di lanciare lo script
- Alcuni browser bloccano l'autoplay: prova ad avviare manualmente il primo video prima di incollare lo script
- Disabilita estensioni come **AdBlock** o **uBlock Origin** sulla pagina

### ❌ Lo script si ferma prima del 70%
- Controlla i log in console: potrebbe aver finito tutti i video disponibili
- Alcuni corsi richiedono anche **quiz** o **test intermedi** per superare il 70%: questi vanno fatti manualmente

### ❌ La percentuale non aggiorna
La piattaforma può tardare qualche secondo a registrare la visualizzazione. Premi `F5` per forzare l'aggiornamento.

### ❌ "Item Obiettivi non trovato"
Non tutti i capitoli hanno la sezione "Obiettivi". È normale, lo script va comunque avanti con i video.

---

## ⚖️ Disclaimer

> Questo script è fornito a **scopo puramente educativo e di studio personale dei meccanismi web**.
>
> L'utilizzo per aggirare i criteri di frequenza obbligatoria di una piattaforma e-learning potrebbe violare i **Termini di Servizio** della piattaforma stessa e del tuo contratto come studente.
>
> L'autore **non si assume alcuna responsabilità** per l'uso improprio dello script, eventuali sanzioni accademiche, sospensioni dell'account o conseguenze di qualsiasi natura.
>
> **L'uso è a tuo rischio e pericolo.** Si raccomanda fortemente di **seguire effettivamente** le lezioni a cui si è iscritti.

---

## 📄 Licenza

Distribuito sotto licenza **MIT**. Vedi `LICENSE` per maggiori informazioni.

---

## 🤝 Contribuire

Pull request, segnalazioni di bug e suggerimenti sono benvenuti!

1. Fork del progetto
2. Crea un branch (`git checkout -b feature/mia-feature`)
3. Commit delle modifiche (`git commit -m 'Aggiunta mia-feature'`)
4. Push (`git push origin feature/mia-feature`)
5. Apri una Pull Request

---

<p align="center">
  Fatto con ☕ per gli studenti universitari sopravvissuti alle videolezioni infinite.
</p>
