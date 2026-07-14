document.getElementById('year').textContent = new Date().getFullYear();

const form = document.getElementById('qualify-form');

form.querySelectorAll('.next-step').forEach((btn) => {
  btn.addEventListener('click', () => {
    const currentStep = btn.closest('.quiz-step');
    const select = currentStep.querySelector('select, input');
    if (!select.reportValidity()) return;

    const nextStep = currentStep.nextElementSibling;
    currentStep.hidden = true;
    if (nextStep) nextStep.hidden = false;
  });
});

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const data = new FormData(form);

  fetch(form.action, {
    method: 'POST',
    body: data,
    headers: { Accept: 'application/json' },
  }).catch((err) => console.error('Lead email failed to send:', err));

  form.hidden = true;
  showBooking(data.get('name'), data.get('email'));
});

function showBooking(name, email) {
  document.getElementById('booking').hidden = false;

  Calendly.initInlineWidget({
    url: 'https://calendly.com/mikecesaroni1/30min?hide_event_type_details=1&hide_gdpr_banner=1',
    parentElement: document.getElementById('calendly-embed'),
    prefill: { name, email },
  });

  document.getElementById('booking').scrollIntoView({ behavior: 'smooth' });
}
