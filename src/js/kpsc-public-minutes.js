(async function initPublicMinutes() {
  const params = new URLSearchParams(window.location.search);
  const token = (params.get('token') || '').trim();
  const statusEl = document.getElementById('kpsc-public-status');
  const metaEl = document.getElementById('kpsc-public-meta');
  const bodyEl = document.getElementById('kpsc-public-minutes');

  if (!token) {
    if (statusEl) statusEl.outerHTML = '<div class="k-error-box">Missing or invalid public minutes token.</div>';
    return;
  }

  try {
    const res = await fetch(`/api/kpsc-public-minutes/${encodeURIComponent(token)}`);
    const data = await res.json();
    if (!res.ok || data?.error) {
      if (statusEl) statusEl.outerHTML = `<div class="k-error-box">${(data?.error || 'Unable to load public minutes.').replace(/</g, '&lt;')}</div>`;
      return;
    }
    const date = data.meetingDate ? ` • ${data.meetingDate}` : '';
    const type = data.meetingType ? ` • ${String(data.meetingType).replace(/_/g, ' ')}` : '';
    if (metaEl) metaEl.textContent = `${data.title || 'KPSC Meeting'}${date}${type}`;
    if (bodyEl) {
      bodyEl.style.display = '';
      bodyEl.innerHTML = mdToHtml(data.minutesMarkdown || '');
    }
    if (statusEl) statusEl.remove();
  } catch (e) {
    if (statusEl) statusEl.outerHTML = `<div class="k-error-box">${String(e?.message || 'Unable to load minutes.').replace(/</g, '&lt;')}</div>`;
  }
})();

function mdToHtml(md) {
  const escaped = String(md || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return escaped
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>[\n]?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}
