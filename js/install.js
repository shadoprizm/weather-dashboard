/**
 * "Add to Home Screen", offered once and only when it is welcome.
 *
 * A visitor who installs stops arriving through a search engine, which is the
 * only acquisition metric that compounds. But an install prompt on first
 * pageview is the same interruption this site exists to avoid, so this one
 * waits for evidence of intent — a second visit, or a saved location — and
 * takes no for an answer permanently.
 */

const VISITS_KEY = 'weatherview.visits';
const DISMISSED_KEY = 'weatherview.install-dismissed';
const MIN_VISITS = 2;

function readNumber(key) {
  try { return Number(localStorage.getItem(key)) || 0; } catch (error) { return 0; }
}

function write(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (error) { /* private mode */ }
}

function countVisit() {
  const visits = readNumber(VISITS_KEY) + 1;
  write(VISITS_KEY, visits);
  return visits;
}

function dismissed() {
  return readNumber(DISMISSED_KEY) === 1;
}

function banner({ onInstall, onDismiss }) {
  const node = document.createElement('div');
  node.className = 'install-banner';
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-label', 'Add WeatherView to your home screen');
  node.innerHTML = `
    <div class="install-copy">
      <strong>Keep WeatherView one tap away</strong>
      <span>Add it to your home screen — it opens instantly and works offline.</span>
    </div>
    <div class="install-actions">
      <button type="button" class="install-yes">Add</button>
      <button type="button" class="install-no" aria-label="No thanks">Not now</button>
    </div>`;

  node.querySelector('.install-yes').addEventListener('click', onInstall);
  node.querySelector('.install-no').addEventListener('click', onDismiss);
  document.body.appendChild(node);
  return node;
}

export function setupInstallPrompt({ toast = () => {} } = {}) {
  const visits = countVisit();

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();

    // Already installed, already said no, or still a first-time visitor.
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (dismissed() || visits < MIN_VISITS) return;

    const node = banner({
      onInstall: async () => {
        node.remove();
        event.prompt();
        const choice = await event.userChoice;
        if (choice.outcome === 'accepted') toast('WeatherView added to your home screen');
        else write(DISMISSED_KEY, 1);
      },
      onDismiss: () => {
        node.remove();
        write(DISMISSED_KEY, 1);
      },
    });
  });

  window.addEventListener('appinstalled', () => write(DISMISSED_KEY, 1));
}
