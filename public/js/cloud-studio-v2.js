(() => {
  document.querySelectorAll('[data-cloud-theme]').forEach(button => button.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('rentTheme', next); } catch {}
  }));
  const tabs = [...document.querySelectorAll('[data-screen-tab]')];
  function select(index, focus = false) {
    tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; });
    document.querySelectorAll('[data-screen-panel]').forEach(panel => { panel.hidden = Number(panel.dataset.screenPanel) !== index; });
    if (focus) tabs[index].focus();
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(i));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (i + 1) % tabs.length;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); select(next, true); }
    });
  });
  const dialog = document.querySelector('[data-screen-dialog]');
  document.querySelectorAll('[data-expand-screen]').forEach(button => button.addEventListener('click', () => {
    dialog.querySelector('img').src = button.dataset.expandScreen;
    dialog.querySelector('img').alt = button.dataset.expandTitle;
    dialog.querySelector('[data-screen-title]').textContent = button.dataset.expandTitle;
    dialog.showModal();
  }));
  document.querySelector('[data-close-screen]')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.querySelector('[data-cloud-admin-menu]')?.addEventListener('click', event => {
    const open = document.querySelector('.admin-sidebar').classList.toggle('is-open');
    event.currentTarget.setAttribute('aria-expanded', String(open));
  });
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('cloud-reveal-enter'); observer.unobserve(entry.target); }
    }), { threshold: .1 });
    document.querySelectorAll('.cloud-section-heading,.cloud-start-section,.cloud-admin-head').forEach(element => observer.observe(element));
  }
  const planInputs = [...document.querySelectorAll('[data-cloud-plan-price]')];
  const summary = document.querySelector('[data-cloud-setup-summary]');
  function updatePlan() {
    const selected = planInputs.find(input => input.checked);
    if (summary && selected) summary.textContent = `฿${Number(selected.dataset.cloudPlanPrice).toLocaleString('th-TH')} / ${selected.dataset.cloudPlanDays} วัน`;
  }
  planInputs.forEach(input => input.addEventListener('change', updatePlan)); updatePlan();
  const slug = document.querySelector('input[name="slug"]');
  const domain = document.querySelector('[data-cloud-domain-preview]');
  slug?.addEventListener('input', () => { if (domain) domain.textContent = (slug.value.trim().toLowerCase() || 'yourshop') + '.' + domain.dataset.cloudDomainPreview; });
})();
