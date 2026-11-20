// Web to App Instant runtime bridge — injected into every page of the app.
// Makes common web features behave natively inside the Android WebView.
(function () {
  if (window.__wtaShim) return;
  window.__wtaShim = true;
  var plugins = function () { return (window.Capacitor && window.Capacitor.Plugins) || {}; };

  // ── Downloads of files generated in the browser (Blob / data: URLs) ─────────
  function saveHref(href, name) {
    var P = plugins();
    if (!P.WTADownloader) return false;
    fetch(href)
      .then(function (r) { return r.blob(); })
      .then(function (b) {
        return new Promise(function (ok) {
          var fr = new FileReader();
          fr.onload = function () { ok({ data: fr.result, mime: b.type }); };
          fr.readAsDataURL(b);
        });
      })
      .then(function (x) { return P.WTADownloader.save({ data: x.data, name: name || 'download', mime: x.mime || 'application/octet-stream' }); })
      .catch(function (e) { console.error('[web-to-app] download failed', e); });
    return true;
  }
  function handleAnchor(a) {
    var href = a.href || '';
    if (!a.hasAttribute('download')) return false;
    if (href.indexOf('blob:') !== 0 && href.indexOf('data:') !== 0) return false;
    return saveHref(href, a.getAttribute('download') || '');
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a && handleAnchor(a)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  var nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (handleAnchor(this)) return;
    return nativeClick.apply(this, arguments);
  };

  // ── Native share sheet ──────────────────────────────────────────────────────
  if (plugins().Share) {
    navigator.share = function (d) {
      d = d || {};
      return plugins().Share.share({ title: d.title, text: d.text, url: d.url, dialogTitle: d.title });
    };
    navigator.canShare = function () { return true; };
  }

  // ── Notifications → Android notifications ──────────────────────────────────
  var LN = plugins().LocalNotifications;
  if (LN) {
    var granted = 'default';
    var Fake = function (title, opts) {
      opts = opts || {};
      LN.schedule({ notifications: [{ id: Math.floor(Math.random() * 2147483000), title: String(title), body: opts.body || '' }] });
      this.title = title;
      this.close = function () {};
    };
    Object.defineProperty(Fake, 'permission', { get: function () { return granted; } });
    Fake.requestPermission = function (cb) {
      return LN.requestPermissions().then(function (r) {
        granted = r.display === 'granted' ? 'granted' : 'denied';
        if (cb) cb(granted);
        return granted;
      });
    };
    LN.checkPermissions().then(function (r) { granted = r.display === 'granted' ? 'granted' : r.display === 'denied' ? 'denied' : 'default'; });
    window.Notification = Fake;
  }
})();
