(() => {
  const engine = document.querySelector('[data-store-engine]');
  if (!engine) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const buttons = [...engine.querySelectorAll('[data-engine-select]')];
  const toggle = engine.querySelector('[data-motion-toggle]');
  const hero = document.querySelector('.cloud-hero-stage');
  let step = 0, paused = false, visible = true, timer;
  function select(next) {
    step = next; engine.dataset.engineStep = String(step);
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === step)));
    engine.querySelector('[data-engine-delivery]').textContent = ['รอคำสั่งซื้อ', 'บันทึกคำสั่งซื้อ', 'ข้อมูลพร้อมส่งมอบ'][step];
  }
  function schedule() {
    clearInterval(timer);
    engine.classList.toggle('is-paused', paused || !visible || document.hidden);
    hero?.classList.toggle('is-paused', paused || document.hidden);
    if (!paused && !reduced.matches && visible && !document.hidden) timer = setInterval(() => select((step + 1) % 3), 2600);
  }
  buttons.forEach((button, i) => button.addEventListener('click', () => { select(i); schedule(); }));
  toggle.addEventListener('click', () => {
    paused = !paused; engine.classList.toggle('is-paused', paused); hero?.classList.toggle('is-paused', paused);
    toggle.setAttribute('aria-pressed', String(paused)); toggle.textContent = paused ? 'เล่นแอนิเมชัน' : 'หยุดแอนิเมชัน'; schedule();
  });
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting; engine.classList.toggle('is-paused', paused || !visible); schedule();
  }, { threshold: .15 }).observe(engine);
  document.addEventListener('visibilitychange', schedule); reduced.addEventListener('change', schedule);
  window.addEventListener('pagehide', () => clearInterval(timer)); schedule();
})();
