// ------------------------------------------------------------------
// Configuration. These are the only lines to touch as GoHighLevel
// pieces come online.
// ------------------------------------------------------------------

// W1 "Website Quiz Submission" inbound webhook. The quiz also keeps
// emailing leads through FormSubmit until GHL is trusted.
const GHL_WEBHOOK_URL = 'https://services.leadconnectorhq.com/hooks/We1BEHduuoq5X2eA35Sb/webhook-trigger/4c228468-ac1c-4b56-86cd-7a3cbb29474b';

// The $165 checkout. This is the GoHighLevel payment link, not the old
// Stripe-native one: a subscription bought on a Stripe link never reaches
// GHL (no contact, no tag, no Skool invite), so every $165 button on the
// site goes through here. If the link is re-issued when the duplicate
// Stripe prices are consolidated, this is the one line to change.
const STANDARD_CHECKOUT_URL = 'https://link.fastpaydirect.com/payment-link/6a986564d6768df054449671';

document.getElementById('year').textContent = new Date().getFullYear();

// Every $165 button on the page uses the same checkout.
document.querySelectorAll('[data-standard-checkout]').forEach((a) => { a.href = STANDARD_CHECKOUT_URL; });

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


  nextSection.scrollIntoView({ behavior: 'smooth' });
}

nextSection.addEventListener('click', (e) => {
  const link = e.target.closest('[data-switch-path]');
  if (!link) return;
  e.preventDefault();
  showNextStep(link.dataset.switchPath);
});

/* Weekly webinar countdown.
   Counts to the next Tuesday 7:00 PM in New York, whatever timezone the
   visitor is in. Between 7 and 8 it reads as live; at 8 it rolls to next week.
   All arithmetic goes through Intl so daylight saving is handled for us. */
(function () {
  var box = document.getElementById('countdown');
  if (!box || typeof Intl === 'undefined' || !Intl.DateTimeFormat) return;

  var TZ = 'America/New_York';
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var liveEl = document.getElementById('cd-live');
  var ctaEl = document.getElementById('cd-cta');
  var whenEl = document.getElementById('cd-when');
  var out = {
    days: document.getElementById('cd-days'),
    hours: document.getElementById('cd-hours'),
    mins: document.getElementById('cd-mins'),
    secs: document.getElementById('cd-secs')
  };

  var partsFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  var labelFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric'
  });

  // Wall-clock reading of an instant, in New York.
  function etParts(ts) {
    var o = {};
    partsFmt.formatToParts(new Date(ts)).forEach(function (p) { o[p.type] = p.value; });
    return {
      y: +o.year, m: +o.month, d: +o.day,
      hh: +o.hour % 24, mm: +o.minute, ss: +o.second,
      wd: DAYS.indexOf(o.weekday)
    };
  }

  // The instant at which New York's clock reads this date and hour.
  function etWallToTs(y, m, d, hour) {
    var want = Date.UTC(y, m - 1, d, hour, 0, 0);
    var ts = want;
    for (var i = 0; i < 3; i++) {
      var p = etParts(ts);
      ts += want - Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
    }
    return ts;
  }

  // Calendar arithmetic on the New York date, so a DST change can't shift it.
  function addDays(p, n) {
    var d = new Date(Date.UTC(p.y, p.m - 1, p.d));
    d.setUTCDate(d.getUTCDate() + n);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }

  function nextCall(now) {
    var p = etParts(now);
    if (p.wd === 2) {
      var start = etWallToTs(p.y, p.m, p.d, 19);
      var end = etWallToTs(p.y, p.m, p.d, 20);
      if (now >= start && now < end) return { live: true, at: start };
      if (now < start) return { live: false, at: start };
      var nextWeek = addDays(p, 7);
      return { live: false, at: etWallToTs(nextWeek.y, nextWeek.m, nextWeek.d, 19) };
    }
    var ahead = (2 - p.wd + 7) % 7;
    var target = addDays(p, ahead);
    return { live: false, at: etWallToTs(target.y, target.m, target.d, 19) };
  }

  function tick() {
    var now = Date.now();
    var call = nextCall(now);

    if (call.live) {
      box.hidden = true;
      liveEl.hidden = false;
      ctaEl.textContent = 'Join The Call →';
      whenEl.textContent = 'Mike is on now. Register and you go straight in.';
      return;
    }

    liveEl.hidden = true;
    box.hidden = false;
    ctaEl.textContent = 'Save My Seat →';
    whenEl.textContent = 'Next call: ' + labelFmt.format(new Date(call.at)) + ' at 7:00 PM Eastern.';

    var left = Math.max(0, call.at - now);
    var secs = Math.floor(left / 1000);
    function pad(n) { return n < 10 ? '0' + n : String(n); }
    out.days.textContent = Math.floor(secs / 86400);
    out.hours.textContent = pad(Math.floor(secs % 86400 / 3600));
    out.mins.textContent = pad(Math.floor(secs % 3600 / 60));
    out.secs.textContent = pad(secs % 60);
  }

  tick();
  setInterval(tick, 1000);
})();
