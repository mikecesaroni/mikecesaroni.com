document.getElementById('year').textContent = new Date().getFullYear();

const form = document.getElementById('qualify-form');
const steps = form.querySelectorAll('.quiz-step');

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
  form.hidden = true;
  document.getElementById('booking').hidden = false;
  document.getElementById('booking').scrollIntoView({ behavior: 'smooth' });
});
