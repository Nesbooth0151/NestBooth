// Statistik dashboard mengikuti transaksi dan antrean online, dengan zona waktu Asia/Jakarta.
(() => {
  const money = value => 'Rp' + Number(value || 0).toLocaleString('id-ID');
  const labels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  const dayKey = date => {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(date);
    const value = type => parts.find(part => part.type === type)?.value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  };
  const monday = date => { const result = new Date(date); result.setDate(result.getDate() - ((result.getDay() + 6) % 7)); result.setHours(0, 0, 0, 0); return result; };
  function setCard(card, value, note) { card.querySelector('.value').textContent = value; card.querySelector('.up,.muted').textContent = note; }
  function render() {
    let state = window.nesboothCloudState;
    if (!state) {
      try {
        const sales = JSON.parse(localStorage.getItem('nestbooth-sales-history') || '[]').map(sale => ({...sale, created_at: sale.timestamp}));
        state = {sales, queues: typeof queue === 'undefined' ? [] : queue};
      } catch { state = {sales: [], queues: []}; }
    }
    const cards = [...document.querySelectorAll('#dashboard .dash-grid > .card.stat')];
    if (cards.length < 4) return;
    const now = new Date(), today = dayKey(now), previous = new Date(now); previous.setDate(previous.getDate() - 1);
    const sales = (Array.isArray(state.sales) ? state.sales : []).filter(sale => (sale.payment_status || 'paid') === 'paid');
    const todaySales = sales.filter(sale => dayKey(new Date(sale.created_at)) === today);
    const yesterdaySales = sales.filter(sale => dayKey(new Date(sale.created_at)) === dayKey(previous));
    const todayTotal = todaySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const yesterdayTotal = yesterdaySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const compare = yesterdayTotal ? `${todayTotal >= yesterdayTotal ? '↑' : '↓'} ${Math.round(Math.abs(todayTotal - yesterdayTotal) / yesterdayTotal * 100)}% dibanding kemarin` : 'Belum ada pembanding kemarin';
    setCard(cards[0], money(todayTotal), compare);
    setCard(cards[1], todaySales.length, `${todaySales.length} transaksi hari ini`);
    const paymentSummary = document.getElementById('dashboardPaymentSummary') || (() => {
      const box = document.createElement('div');
      box.id = 'dashboardPaymentSummary'; box.className = 'dash-grid';
      box.style.cssText = 'grid-template-columns:repeat(2,minmax(0,1fr));margin-top:18px';
      document.querySelector('#dashboard .two-col').before(box); return box;
    })();
    const paymentStats = method => {
      const filtered = todaySales.filter(sale => (sale.payment_method || sale.method) === method);
      return {count: filtered.length, total: filtered.reduce((sum, sale) => sum + Number(sale.total || 0), 0)};
    };
    const cash = paymentStats('Tunai'), qris = paymentStats('QRIS');
    paymentSummary.innerHTML = `<div class="card stat"><div class="label">Transaksi Tunai Hari Ini</div><div class="value">${cash.count}</div><div class="muted">${money(cash.total)} total tunai</div></div><div class="card stat"><div class="label">Transaksi QRIS Hari Ini</div><div class="value">${qris.count}</div><div class="muted">${money(qris.total)} total QRIS</div></div>`;
    const queues = Array.isArray(state.queues) ? state.queues : [];
    setCard(cards[2], queues.length, queues.length ? `${queues.filter(item => item.status === 'Diproses').length} sedang diproses` : 'Tidak ada antrian berjalan');
    const count = new Map();
    todaySales.forEach(sale => (sale.items || []).forEach(item => { const name = String(item.name || '').split(' — ')[0]; count.set(name, (count.get(name) || 0) + Number(item.qty || 0)); }));
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    setCard(cards[3], top?.[0] || '—', top ? `${top[1]} terjual hari ini` : 'Belum ada penjualan hari ini');
    const reportCards = [...document.querySelectorAll('#laporan .dash-grid .stat')];
    if (reportCards.length >= 4) {
      const qrisTotal = todaySales.filter(sale => sale.payment_method === 'QRIS').reduce((sum, sale) => sum + Number(sale.total || 0), 0);
      reportCards[0].querySelector('.label').textContent = 'Penjualan Hari Ini';
      reportCards[0].querySelector('.value').textContent = money(todayTotal);
      reportCards[1].querySelector('.label').textContent = 'Total Transaksi Hari Ini';
      reportCards[1].querySelector('.value').textContent = todaySales.length;
      reportCards[2].querySelector('.label').textContent = 'Rata-rata Transaksi Hari Ini';
      reportCards[2].querySelector('.value').textContent = money(todaySales.length ? todayTotal / todaySales.length : 0);
      reportCards[3].querySelector('.label').textContent = 'Pembayaran QRIS Hari Ini';
      reportCards[3].querySelector('.value').textContent = `${todayTotal ? Math.round(qrisTotal / todayTotal * 100) : 0}%`;
    }
    const bars = document.querySelector('#dashboard .bars'); if (!bars) return;
    const first = monday(now);
    const totals = labels.map((_, index) => { const date = new Date(first); date.setDate(first.getDate() + index); const key = dayKey(date); return sales.filter(sale => dayKey(new Date(sale.created_at)) === key).reduce((sum, sale) => sum + Number(sale.total || 0), 0); });
    const max = Math.max(...totals, 1);
    bars.innerHTML = totals.map((total, index) => { const date = new Date(first); date.setDate(first.getDate() + index); return `<div class="bar" title="${labels[index]}: ${money(total)}" style="height:${total ? Math.max(10, Math.round(total / max * 100)) : 4}%;background:${dayKey(date) === today ? 'var(--blue)' : '#dceeff'}"><span>${labels[index]}</span></div>`; }).join('');
  }
  window.addEventListener('nesbooth-cloud-updated', render);
  render(); setInterval(render, 5000);
})();
