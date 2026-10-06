// ===== ocean.is-a.dev =====
// typewriter del titulo (@ocean) + copiar discord al portapapeles

(function () {
  // ===== typewriter del titulo =====
  const typeSpeed = 180;
  const deleteSpeed = 90;
  const holdFull = 2200;
  const holdEmpty = 700;

  function startTypewriter(text, update, delay) {
    let position = 0;
    let deleting = false;

    function tick() {
      if (!deleting) {
        position++;
        update(text.slice(0, position));
        if (position === text.length) {
          deleting = true;
          setTimeout(tick, holdFull);
          return;
        }
        setTimeout(tick, typeSpeed);
        return;
      }

      position--;
      update(text.slice(0, position));
      if (position === 0) {
        deleting = false;
        setTimeout(tick, holdEmpty);
        return;
      }
      setTimeout(tick, deleteSpeed);
    }

    setTimeout(tick, delay);
  }

  const pageName = document.body.dataset.pageTitle || 'home';
  const titleText = pageName === 'home' ? '@ocean' : '#' + pageName;
  startTypewriter(titleText, function (value) {
    document.title = value || ' ';
  }, 500);

  const toast = document.getElementById('toast');

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      toast.classList.remove('show');
    }, 1600);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy') ? resolve() : reject();
      } catch (e) {
        reject(e);
      }
      document.body.removeChild(ta);
    });
  }

  document.querySelectorAll('[data-copy-value]').forEach(function (copyControl) {
    copyControl.addEventListener('click', function () {
      const value = copyControl.dataset.copyValue;
      copyText(value)
        .then(function () { showToast('copied: ' + value); })
        .catch(function () { showToast('copy failed'); });
    });
  });
})();
