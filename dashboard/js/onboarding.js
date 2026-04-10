// BLUN Onboarding Tour - Beginner-First Einführung
// Keine Abhängigkeiten, reines Vanilla JS

const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    title: 'Willkommen bei BLUN',
    text: 'Willkommen bei BLUN! BLUN ist deine persönliche KI-Firma. Du bekommst ein Team aus KI-Agenten (computergesteuerte Mitarbeiter) die für dich arbeiten — ähnlich wie Mitarbeiter in einem echten Unternehmen. Du sagst was getan werden soll, die Agenten erledigen es. In dieser Tour zeigen wir dir Schritt für Schritt wie alles funktioniert. Keine Sorge, es ist einfacher als es aussieht.',
    selector: 'body',
    highlightElement: false,
    buttons: ['Weiter', 'Überspringen']
  },
  {
    id: 'dashboard',
    title: 'Das Dashboard',
    text: 'Das hier ist dein Dashboard — deine Kommandozentrale (der zentrale Ort von dem aus du alles kontrolierst). Links findest du alle Bereiche: Agents (deine Mitarbeiter), Operator (dein Chef-Agent), Chat, Livelog (was gerade passiert), Modelle (welche KI im Hintergrund arbeitet), Firmen, Websites, Software, Einstellungen. Du kannst jederzeit zwischen den Bereichen wechseln.',
    selector: '.sidebar, [role="navigation"]',
    buttons: ['Zurück', 'Weiter', 'Überspringen']
  },
  {
    id: 'operator',
    title: 'Der Operator',
    text: 'Der Operator ist dein Chef-Agent. Er bekommt deine Ziele und verteilt die Arbeit automatisch an die anderen Agenten. Stell ihn dir vor wie einen Projektleiter (jemand der bei einer großen Aufgabe alles koordiniert): du sagst "Ich brauche eine Webseite", der Operator teilt das auf und gibt jedem Agent die passende Teilaufgabe. Du musst also nicht selber wissen wer was macht.',
    selector: '#page-operator',
    buttons: ['Zurück', 'Weiter', 'Überspringen']
  },
  {
    id: 'operator-setup',
    title: 'Operator Einrichten',
    text: 'Hier richtest du jetzt deinen Operator ein. Gib ihm einen Namen (zum Beispiel "Dieter" oder "Anna"), wähle eine Persönlichkeit (locker, professionell, kreativ, streng) und los gehts. Der Operator merkt sich alles was du ihm sagst und wird mit der Zeit immer besser darin zu verstehen was du willst. Du kannst ihn später jederzeit umbenennen oder die Einstellungen ändern.',
    selector: '.operator-settings, [data-section="operator"]',
    buttons: ['Zurück', 'Weiter', 'Überspringen']
  },
  {
    id: 'agents',
    title: 'Agents — Dein Team',
    text: 'Das sind deine Agenten — jeder hat einen Beruf: Entwickler (programmiert Code), Designer (macht hübsche Oberflächen), QA-Tester (findet Fehler), Marketing (bewirbt dein Produkt), usw. Jeder ist auf sein Fach spezialisiert. Der grüne Punkt heißt: arbeitet gerade. Orange heißt: hat Aufgaben in der Warteschlange (wartet darauf bearbeitet zu werden). Grau heißt: wartet auf neue Arbeit.',
    selector: '#deptList, [data-agents], .agents-list',
    buttons: ['Zurück', 'Weiter', 'Überspringen']
  },
  {
    id: 'assign-tasks',
    title: 'Aufgaben Vergeben',
    text: 'So gibst du einem Agent einen Auftrag: Klick auf den Agent → "Neue Aufgabe" → beschreib in normalen Worten was du willst. Zum Beispiel: "Bau mir eine Kontakt-Seite mit Formular". Der Agent versteht das und legt los. Du musst nicht programmieren können — schreib einfach wie zu einem echten Mitarbeiter im Büro.',
    selector: '[data-agent-item], .agent-card',
    buttons: ['Zurück', 'Weiter', 'Überspringen']
  },
  {
    id: 'livelog',
    title: 'Livelog — Live Zuschauen',
    text: 'Im Livelog siehst du in Echtzeit was deine Agenten gerade tun. Wer arbeitet woran, was wurde fertig, welcher Code geschrieben. Es ist wie ein Blick ins Büro: du kannst jederzeit sehen wer gerade was macht und wie schnell es vorangeht.',
    selector: '#page-livelog',
    buttons: ['Zurück', 'Weiter', 'Überspringen']
  },
  {
    id: 'git',
    title: 'Git — Was ist das?',
    text: 'Kurz erklärt: Git ist ein System das alle Änderungen am Code speichert wie eine Zeitmaschine (jederzeit kannst du zu älteren Versionen zurück). So kann man nichts kaputtmachen — man kann immer rückgängig machen. Deine Agenten benutzen Git automatisch um ihren Code zu verwalten. Du brauchst davon nichts verstehen — im Hintergrund läuft alles automatisch. Falls du Code auf deinem eigenen Server hosten willst: du brauchst einen GitHub-Account (kostenlos, github.com). In den Einstellungen haben wir einen Link der dich direkt dorthin bringt — Account erstellen dauert 2 Minuten.',
    selector: '#page-livelog',
    buttons: ['Zurück', 'Weiter', 'Überspringen']
  },
  {
    id: 'ssh',
    title: 'SSH — Was ist das?',
    text: 'SSH ist eine sichere Verbindung zu einem Server — so wie ein verschlüsselter Gang zwischen zwei Häusern (niemand kann deine Daten unterwegs abhören). Wenn du BLUN auf deinem eigenen Server nutzen willst, brauchst du SSH-Zugang. ABER: Wenn du bei uns hostest (empfohlen!), brauchst du SSH gar nicht. Du bekommst automatisch einen Serverplatz zugewiesen und wir kümmern uns um alles im Hintergrund. Einfach "Bei BLUN hosten" wählen und du bist fertig.',
    selector: '#page-settings',
    buttons: ['Zurück', 'Weiter', 'Überspringen']
  },
  {
    id: 'hosting',
    title: 'Hosting — Bei uns oder selbst',
    text: 'Zwei Wege: (1) BEI UNS HOSTEN (einfach): Wir weisen dir automatisch einen Serverplatz zu. Kein SSH, kein Setup, du zahlst monatlich und alles läuft. Perfekt wenn du nur Ergebnisse willst ohne dich um Technik zu kümmern. (2) EIGENER SERVER (fortgeschritten): Du gibst uns deinen Server-Zugang (GitHub/SSH) und die Agenten arbeiten dort. Mehr Kontrolle, aber du musst etwas Technik verstehen. Du kannst jederzeit zwischen den beiden wechseln — alles ist flexibel.',
    selector: '[data-hosting], .hosting-options',
    buttons: ['Zurück', 'Weiter', 'Überspringen']
  },
  {
    id: 'ai-integration',
    title: 'KI Anbinden',
    text: 'Die Agenten brauchen eine KI im Hintergrund (Claude, GPT, Gemini oder eine lokale KI auf unseren Servern). Du hast drei Optionen: (1) Eigenen Account verbinden (OAuth-Login bei Claude/OpenAI/Google — sicherer, aber dein Account). (2) API-Key eintragen (für Profis die ihren eigenen Key haben). (3) Unsere lokale KI nutzen (kein Setup nötig, läuft auf unseren Servern, im Preis enthalten). Option 3 ist am einfachsten — du drückst einen Knopf und es läuft.',
    selector: '#page-settings, [data-ai-settings]',
    buttons: ['Zurück', 'Weiter', 'Überspringen']
  },
  {
    id: 'next-steps',
    title: 'Jetzt geht\'s los!',
    text: 'Du hast alles verstanden. Das sind deine nächsten Schritte: (1) Verbinde deinen KI-Anbieter ODER aktiviere die lokale KI ODER trag deinen API-Key ein. (2) Optional: Bestelle eine Domain und lass deine erste Webseite von den Agenten bauen. (3) Gib deinem Operator das erste Ziel und beobachte wie die Arbeit erledigt wird. Du bist jetzt bereit! Viel Spaß mit BLUN!',
    selector: 'body',
    highlightElement: false,
    buttons: ['Zurück', 'Tour beenden']
  }
];

let currentStep = 0;
let tour = null;
let backdropElement = null;
let spotlightElement = null;
let tooltipElement = null;

/**
 * Startet die Onboarding-Tour
 */
function startOnboardingTour() {
  // Prüfe ob Tour schon gemacht wurde
  if (localStorage.getItem('blun_onboarding_done') === '1') {
    return;
  }

  currentStep = 0;
  tour = ONBOARDING_STEPS;
  showStep(currentStep);

  // Escape-Taste zum Überspringen
  document.addEventListener('keydown', handleTourKeydown);
}

/**
 * Startet die Tour neu (für Settings-Button)
 */
function restartOnboardingTour() {
  localStorage.removeItem('blun_onboarding_done');
  currentStep = 0;
  if (tour) {
    removeTourElements();
  }
  tour = ONBOARDING_STEPS;
  showStep(currentStep);
  document.addEventListener('keydown', handleTourKeydown);
}

/**
 * Zeigt einen Tour-Schritt
 */
function showStep(stepIndex) {
  if (!tour || stepIndex < 0 || stepIndex >= tour.length) {
    return;
  }

  const step = tour[stepIndex];

  // Alte Elemente entfernen
  removeTourElements();

  // Backdrop erstellen
  backdropElement = document.createElement('div');
  backdropElement.className = 'bl-onboarding-backdrop';
  backdropElement.innerHTML = '';
  document.body.appendChild(backdropElement);

  // Spotlight erstellen
  const targetElement = document.querySelector(step.selector);

  if (targetElement && step.highlightElement !== false) {
    spotlightElement = document.createElement('div');
    spotlightElement.className = 'bl-onboarding-spotlight';

    const rect = targetElement.getBoundingClientRect();
    spotlightElement.style.top = (rect.top + window.scrollY) + 'px';
    spotlightElement.style.left = (rect.left + window.scrollX) + 'px';
    spotlightElement.style.width = rect.width + 'px';
    spotlightElement.style.height = rect.height + 'px';

    document.body.appendChild(spotlightElement);
  }

  // Tooltip erstellen
  tooltipElement = document.createElement('div');
  tooltipElement.className = 'bl-onboarding-tooltip';

  const titleEl = document.createElement('h2');
  titleEl.className = 'bl-onboarding-title';
  titleEl.textContent = step.title;

  const textEl = document.createElement('p');
  textEl.className = 'bl-onboarding-text';
  textEl.textContent = step.text;

  const buttonsEl = document.createElement('div');
  buttonsEl.className = 'bl-onboarding-buttons';

  step.buttons.forEach((buttonText, index) => {
    const btn = document.createElement('button');
    btn.className = 'bl-onboarding-btn';
    btn.textContent = buttonText;

    if (buttonText === 'Weiter') {
      btn.addEventListener('click', () => nextStep());
    } else if (buttonText === 'Zurück') {
      btn.addEventListener('click', () => prevStep());
    } else if (buttonText === 'Überspringen' || buttonText === 'Tour beenden') {
      btn.addEventListener('click', () => finishTour());
    }

    buttonsEl.appendChild(btn);
  });

  tooltipElement.appendChild(titleEl);
  tooltipElement.appendChild(textEl);
  tooltipElement.appendChild(buttonsEl);

  // Positioniere Tooltip
  if (spotlightElement) {
    const rect = spotlightElement.getBoundingClientRect();
    const isMobile = window.innerWidth < 768;

    if (isMobile) {
      // Mobile: zentriert unten
      tooltipElement.style.position = 'fixed';
      tooltipElement.style.bottom = '20px';
      tooltipElement.style.left = '50%';
      tooltipElement.style.transform = 'translateX(-50%)';
      tooltipElement.style.maxWidth = '90vw';
    } else {
      // Desktop: neben Spotlight
      tooltipElement.style.position = 'fixed';
      if (rect.right + 320 < window.innerWidth) {
        tooltipElement.style.left = (rect.right + 20) + 'px';
      } else {
        tooltipElement.style.right = '20px';
      }
      tooltipElement.style.top = rect.top + 'px';
    }
  } else {
    // Keine Spotlight: zentriert
    tooltipElement.style.position = 'fixed';
    tooltipElement.style.top = '50%';
    tooltipElement.style.left = '50%';
    tooltipElement.style.transform = 'translate(-50%, -50%)';
  }

  document.body.appendChild(tooltipElement);

  // Scroll zu Element wenn nötig
  if (spotlightElement && targetElement) {
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/**
 * Entfernt alle Tour-Elemente
 */
function removeTourElements() {
  if (backdropElement) {
    backdropElement.remove();
    backdropElement = null;
  }
  if (spotlightElement) {
    spotlightElement.remove();
    spotlightElement = null;
  }
  if (tooltipElement) {
    tooltipElement.remove();
    tooltipElement = null;
  }
}

/**
 * Nächster Schritt
 */
function nextStep() {
  currentStep++;
  if (currentStep < tour.length) {
    showStep(currentStep);
  } else {
    finishTour();
  }
}

/**
 * Vorheriger Schritt
 */
function prevStep() {
  currentStep--;
  if (currentStep >= 0) {
    showStep(currentStep);
  }
}

/**
 * Tour beenden
 */
function finishTour() {
  localStorage.setItem('blun_onboarding_done', '1');
  removeTourElements();
  document.removeEventListener('keydown', handleTourKeydown);
  tour = null;
}

/**
 * Tastatur-Shortcuts für Tour
 */
function handleTourKeydown(event) {
  if (event.key === 'Escape') {
    finishTour();
  }
  if (event.key === 'ArrowRight') {
    nextStep();
  }
  if (event.key === 'ArrowLeft') {
    prevStep();
  }
}

/**
 * Auto-Start beim Seitenladung wenn noch nicht gemacht
 */
document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('blun_onboarding_done') !== '1') {
    // Kleine Verzögerung damit Seite fertig geladen ist
    setTimeout(() => {
      startOnboardingTour();
    }, 500);
  }
});

// Global exposen
window.startOnboardingTour = startOnboardingTour;
window.restartOnboardingTour = restartOnboardingTour;
