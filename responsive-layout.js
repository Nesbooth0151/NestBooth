// Penyempurnaan tampilan layar kecil. Tidak mengubah data atau hak akses POS.
(() => {
  const style = document.createElement('style');
  style.textContent = `
    :root { -webkit-text-size-adjust: 100%; }
    button, input, select, textarea { font: inherit; }
    button, .btn, .pay, .cat, .method { min-height: 40px; touch-action: manipulation; }
    input, select, textarea { max-width: 100%; }
    .responsive-table { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .responsive-table > table { min-width: 620px; }
    .table-card > table { min-width: 620px; }
    .catalog, .cart, .section, .table-card { min-width: 0; }
    .product { min-width: 0; }
    .pname, .item-name, td, th { overflow-wrap: anywhere; }
    .queue-row-actions { display: flex; align-items: center; gap: 7px; margin-left: auto; }
    .queue-row-actions .btn { white-space: nowrap; }

    @media (max-width: 1100px) {
      .main { padding: 20px 22px; }
      .pos { grid-template-columns: minmax(0, 1fr) 330px; gap: 16px; }
      .products { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
      .dash-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .two-col, .queue-grid { gap: 16px; }
    }

    /* Tablet landscape: daftar antrean tidak lagi berebut ruang dengan layar panggilan. */
    @media (min-width: 601px) and (max-width: 1280px) {
      .queue-grid { grid-template-columns: minmax(0, 1fr); }
      .queue-grid > .display { min-height: 220px; padding: 24px 18px; }
      .queue-actions { flex-wrap: wrap; }
      .queue-actions .btn { flex: 1 1 170px; text-align: center; }
      .queue-item { min-width: 0; }

      /* Tablet: halaman stok memakai susunan dua kolom yang mudah disentuh.
         Jangan mempertahankan enam kolom desktop pada layar tablet. */
      #produk .inventory-page { max-width: 920px; margin-inline: auto; gap: 16px; }
      #produk .inventory-heading,
      #produk .recipe-manager-head { padding: 18px 20px; }
      #produk .inventory-heading { display: block; }
      #produk .inventory-note,
      #produk .recipe-manager-head > span { display: block; max-width: none; margin-top: 12px; }
      #produk .inventory-form,
      #produk .menu-form,
      #produk .recipe-manager-form { grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 16px 18px; padding: 14px; }
      #produk .inventory-form .btn,
      #produk .recipe-manager-form .btn { width: 100%; }
      #produk .inventory-table-wrap { margin: 0 18px 18px; }
      #produk #stockAlerts { margin: 0 18px 16px !important; overflow-x: auto; }
      #produk #stockAlerts table { min-width: 560px; }
      #produk .recipe-manager-body { padding: 16px 18px 20px; }
      #produk .recipe-variant-card { overflow-x: auto; }
      #produk .recipe-variant-card table { min-width: 560px; }
    }

    @media (max-width: 900px) {
      body { padding-bottom: 70px; }
      .main { padding: 16px; }
      .top { align-items: flex-start; margin-bottom: 12px; }
      .top h1 { font-size: 21px; }
      .top p { font-size: 13px; line-height: 1.45; }
      .mobile-nav { position: sticky; top: 0; z-index: 15; padding: 10px 0 12px !important; margin: 0 0 8px !important; background: var(--bg); }
      .mobile-nav button { min-height: 38px; }
      .pos { grid-template-columns: 1fr; }
      .cart { min-height: auto; }
      .cart-items { max-height: 330px; overflow-y: auto; }
      .queue-actions { flex-wrap: wrap; }
      .queue-actions .btn { flex: 1 1 150px; text-align: center; }
      .display { min-height: 220px; }
      .now { margin: 18px 0 7px; }
      .inventory-page { gap: 16px; }
      .session-user { left: auto !important; right: 12px; bottom: 12px; }
    }

    @media (max-width: 600px) {
      body { font-size: 14px; }
      .main { padding: 12px; }
      .top h1 { font-size: 20px; }
      .card { border-radius: 10px; }
      .catalog, .cart, .section, .table-card { padding: 14px; }
      .products { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .product { padding: 9px; }
      .picon { height: 58px; font-size: 27px; margin-bottom: 7px; }
      .product-photo { height: 92px !important; }
      .pname { font-size: 13px; line-height: 1.3; }
      .price { font-size: 13px; }
      .stock { font-size: 10px; }
      .cats { margin: 12px 0; }
      .cat { padding: 7px 11px; min-height: 36px; }
      .dash-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .stat { padding: 14px; }
      .stat .value { font-size: 20px; overflow-wrap: anywhere; }
      .stat .label { font-size: 12px; }
      .two-col { margin-top: 12px; gap: 12px; }
      .section h2, .table-card h2 { font-size: 16px; }
      .bars { height: 155px; gap: 9px; padding: 0 3px; }
      .bar { min-width: 12px; }
      .queue-item { align-items: flex-start; gap: 9px; padding: 11px 4px; flex-wrap: wrap; }
      .queue-item .number { width: 50px; font-size: 18px; }
      .queue-row-actions { width: 100%; display: flex; gap: 6px; padding-left: 59px; margin-left: 0; }
      .queue-row-actions .btn { flex: 1; padding: 8px 6px; }
      .display { padding: 20px 14px; }
      .now { font-size: 42px; }
      .subbtn { gap: 7px; }
      .subbtn button { padding: 10px 6px; }
      .modal-backdrop { padding: 12px; align-items: end; }
      .modal { max-height: calc(100vh - 24px); overflow-y: auto; padding: 18px; }
      .methods { margin: 15px 0; }
      .method { padding: 11px; }
      .toast { left: 12px; right: 12px; bottom: 66px; text-align: center; }
      .inventory-heading { padding: 16px; }
      .inventory-heading h2 { font-size: 17px; }
      .inventory-note { font-size: 12px; }
      .inventory-form { padding: 13px; }
      #produk #stockAlerts { margin-inline: 14px !important; }
      .responsive-table { margin-inline: -2px; }
      .session-user { max-width: calc(100vw - 24px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pos-login { padding: 14px; }
      .pos-login-card { padding: 24px 20px; }
      .pos-login-brand { font-size: 23px; }
      .role-picks { gap: 6px; }
      .role-pick { padding: 11px 4px; font-size: 13px; }
    }

    @media (max-width: 360px) {
      .dash-grid { grid-template-columns: 1fr; }
      .products { gap: 7px; }
      .product { padding: 8px; }
      .mobile-nav button { padding: 7px 10px; font-size: 12px; }
    }
  `;
  document.head.appendChild(style);

  function wrapTables(root = document) {
    root.querySelectorAll('table').forEach((table) => {
      if (table.closest('.responsive-table') || table.closest('.receipt-paper')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'responsive-table';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  wrapTables();
  new MutationObserver((changes) => {
    changes.forEach((change) => change.addedNodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.matches?.('table')) wrapTables(node.parentNode);
      else wrapTables(node);
    }));
  }).observe(document.body, { childList: true, subtree: true });
})();
