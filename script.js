// ------------------------------------------------------------------
// Configuration. These are the only lines to touch as GoHighLevel
// pieces come online.
// ------------------------------------------------------------------

// W1 "Website Quiz Submission" inbound webhook. Leave empty until W1 is
// published; the quiz keeps emailing leads through FormSubmit either way.
const GHL_WEBHOOK_URL = '';

// The $165 checkout. Stripe's own link works today. Once Stripe is
// connected inside GHL, switch to the GHL payment link so W5 can fire:
// 'https://link.fastpaydirect.com/payment-link/6a986564d6768df054449671'
const STANDARD_CHECKOUT_URL = 'https://buy.stripe.com/14A9AS0RNaPX6857PVeQM0e';

document.getElementById('year').textContent = new Date().getFullYear();

// ------------------------------------------------------------------
// Hero video
// ------------------------------------------------------------------
let ytPlayer;
const ytApiScript = document.createElement('script');
ytApiScript.src = 'https://www.youtube.com/iframe_api';
document.head.appendChild(ytApiScript);

window.onYouTubeIframeAPIReady = function () {
  ytPlayer = new YT.Player('yt-player', {
    videoId: 'KjpVAPNrH14',
    playerVars: { autoplay: 1, mute: 1, playsinline: 1, rel: 0, modestbranding: 1 },
  });
};

document.getElementById('sound-toggle').addEventListener('click', () => {
  if (!ytPlayer || !ytPlayer.isMuted) return;
  if (ytPlayer.isMuted()) {
    ytPlayer.unMute();
    document.getElementById('sound-toggle').textContent = '\u{1F50A}';
  } else {
    ytPlayer.mute();
    document.getElementById('sound-toggle').textContent = '\u{1F507}';
  }
});

// ------------------------------------------------------------------
// Qualifying quiz. Same three routing questions as the DM flow, so a
// lead gets the same answer whichever door they come through.
// ------------------------------------------------------------------
const form = document.getElementById('qualify-form');
const steps = Array.from(form.querySelectorAll('.quiz-step'));
const stepByName = Object.fromEntries(steps.map((s) => [s.dataset.step, s]));
const trail = [];
let lastPayload = null;

function answer(name) {
  const el = form.elements[name];
  return el ? el.value : '';
}

// The routing. Marketing hits the money gate; a Yes goes straight to
// contact details and the calendar. Everyone else picks a starting point.
function nextStep(current) {
  switch (current) {
    case 'industry': return 'revenue';
    case 'revenue':  return 'interest';
    case 'interest': return answer('interest') === 'marketing' ? 'gate' : 'start';
    case 'gate':     return answer('gate_answer') === 'yes' ? 'contact' : 'start';
    case 'start':    return 'contact';
    default:         return null;
  }
}

function stepIsValid(step) {
  const radios = step.querySelectorAll('input[type="radio"]');
  if (radios.length) {
    if (Array.from(radios).some((r) => r.checked)) return true;
    step.classList.add('needs-answer');
    return false;
  }
  return step.querySelector('select, input').reportValidity();
}

function showStep(name) {
  steps.forEach((s) => { s.hidden = s.dataset.step !== name; });
}

form.addEventListener('click', (e) => {
  if (e.target.matches('.next-step')) {
    const step = e.target.closest('.quiz-step');
    if (!stepIsValid(step)) return;
    trail.push(step.dataset.step);
    showStep(nextStep(step.dataset.step));
  }
  if (e.target.matches('.back-step')) {
    const prev = trail.pop();
    if (prev) showStep(prev);
  }
});

form.addEventListener('change', (e) => {
  const step = e.target.closest('.quiz-step');
  if (step) step.classList.remove('needs-answer');
});

// Where each answer set lands, and the tag GHL gets. mkt-not-yet is the
// tag W7 (the 30-day nurture) triggers on, so it has to be exact.
function routeFor(a) {
  if (a.gate_answer === 'yes') return { path: 'call', tags: ['mkt-qualified'] };
  const byChoice = { standard: 'standard-interest', roundtable: 'rt-interest', webinar: 'webinar-interest' };
  const tags = [];
  if (a.gate_answer === 'not_yet') tags.push('mkt-not-yet');
  if (byChoice[a.start_choice]) tags.push(byChoice[a.start_choice]);
  if (!tags.length) tags.push('coaching-interest');
  return { path: a.start_choice === 'standard' ? 'standard' : 'webinar', tags };
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = new FormData(form);
  const [first_name = '', ...rest] = String(data.get('name') || '').trim().split(/\s+/);
  const answers = {
    industry: data.get('industry'),
    monthly_revenue: data.get('monthly_revenue'),
    interest: data.get('interest'),
    gate_answer: data.get('gate_answer') || '',
    start_choice: data.get('start_choice') || '',
  };
  const route = routeFor(answers);
  const payload = {
    source: 'website',
    first_name,
    last_name: rest.join(' '),
    email: data.get('email'),
    phone: data.get('phone'),
    ...answers,
    tag: route.tags[0],
    tags: route.tags,
  };
  lastPayload = payload;

  // GoHighLevel is the system of record. If the browser is refused a
  // cross-origin JSON post, retry opaque so the hit still lands.
  if (GHL_WEBHOOK_URL) {
    const body = JSON.stringify(payload);
    fetch(GHL_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      .catch(() => fetch(GHL_WEBHOOK_URL, { method: 'POST', mode: 'no-cors', body }))
      .catch((err) => console.error('GHL webhook failed:', err));
  }

  // The email copy Mike already gets. Keep it until GHL is trusted.
  data.append('route', route.path);
  data.append('tag', route.tags.join(', '));
  fetch(form.action, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
    .catch((err) => console.error('Lead email failed to send:', err));

  form.hidden = true;
  showNextStep(route.path);
});

// ------------------------------------------------------------------
// The next step, inline: the call calendar, the $165 checkout, or the
// weekly webinar. Calendars are GHL booking widgets, prefilled.
// ------------------------------------------------------------------
const nextSection = document.getElementById('next-step');

function showNextStep(path) {
  const p = lastPayload || {};
  nextSection.hidden = false;
  nextSection.querySelectorAll('.path').forEach((el) => { el.hidden = el.dataset.path !== path; });

  const active = nextSection.querySelector(`.path[data-path="${path}"]`);
  const frame = active.querySelector('iframe[data-src]');
  if (frame && !frame.src) {
    const prefill = new URLSearchParams({
      first_name: p.first_name || '', last_name: p.last_name || '',
      email: p.email || '', phone: p.phone || '',
    });
    frame.src = `${frame.dataset.src}?${prefill}`;
  }

  const rtNote = nextSection.querySelector('[data-roundtable-note]');
  if (rtNote) rtNote.hidden = !(path === 'webinar' && p.start_choice === 'roundtable');

  const checkout = nextSection.querySelector('[data-standard-checkout]');
  if (checkout) checkout.href = STANDARD_CHECKOUT_URL;

  nextSection.scrollIntoView({ behavior: 'smooth' });
}

nextSection.addEventListener('click', (e) => {
  const link = e.target.closest('[data-switch-path]');
  if (!link) return;
  e.preventDefault();
  showNextStep(link.dataset.switchPath);
});
