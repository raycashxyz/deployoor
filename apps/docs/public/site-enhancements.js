(function () {
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(function () {
        return copyTextFallback(text);
      });
    }
    return copyTextFallback(text);
  }

  function copyTextFallback(text) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      if (!document.execCommand('copy')) throw new Error('copy failed');
    } finally {
      document.body.removeChild(textarea);
    }
    return Promise.resolve();
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
  }

  function extractCodeBlockText(pre) {
    var node = pre.cloneNode(true);
    node.querySelectorAll(
      '.line.diff.remove,.twoslash-popup-info-hover,.twoslash-popup-info,.twoslash-meta-line,.twoslash-tag-line',
    ).forEach(function (el) {
      el.remove();
    });
    return (node.textContent || '').replace(/\n{2,}/g, '\n').trim();
  }

  function extractShellLineText(line, pre) {
    var clone = line.cloneNode(true);
    clone.querySelector('[data-v-shell-prompt]')?.remove();
    clone.querySelector('[data-v-shell-copy]')?.remove();
    var text = (clone.textContent || '').trim();

    if (text.endsWith('\\')) {
      var allLines = Array.from(pre.querySelectorAll('.line'));
      var startIdx = allLines.indexOf(line);
      for (var i = startIdx + 1; i < allLines.length; i++) {
        var next = allLines[i];
        if (!next) continue;
        if (next.hasAttribute('data-v-shell-line')) break;
        var nextText = (next.textContent || '').trim();
        if (!nextText) break;
        text += '\n' + nextText;
        if (!nextText.endsWith('\\')) break;
      }
    }

    return text;
  }

  function markCopied(actionEl, originalLabel) {
    if (!actionEl) return;
    actionEl.textContent = 'Copied';
    window.setTimeout(function () {
      actionEl.textContent = originalLabel;
    }, 2000);
  }

  document.addEventListener(
    'click',
    function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;

      var landingBtn = target.closest('.landing-command-row');
      if (landingBtn) {
        var code = landingBtn.querySelector('code');
        if (!code) return;
        event.preventDefault();
        event.stopPropagation();
        var action = landingBtn.querySelector('.landing-command-action');
        copyText(code.textContent || '').then(function () {
          markCopied(action, 'Copy');
        });
        return;
      }

      var shellBtn = target.closest('[data-v-shell-copy]');
      if (shellBtn) {
        var shellLine = shellBtn.closest('.line[data-v-shell-line]');
        var shellPre = shellBtn.closest('pre');
        if (!shellLine || !shellPre) return;
        event.preventDefault();
        event.stopPropagation();
        copyText(extractShellLineText(shellLine, shellPre));
        return;
      }

      var codeBtn = target.closest('button[aria-label="Copy code"], button[aria-label="Copied"]');
      if (codeBtn) {
        var pre = codeBtn.parentElement;
        if (!pre || pre.tagName !== 'PRE') return;
        event.preventDefault();
        event.stopPropagation();
        copyText(extractCodeBlockText(pre));
        codeBtn.setAttribute('aria-label', 'Copied');
        codeBtn.setAttribute('data-copied', 'true');
        window.setTimeout(function () {
          codeBtn.setAttribute('aria-label', 'Copy code');
          codeBtn.removeAttribute('data-copied');
        }, 1000);
      }
    },
    true,
  );

  function getPaginationLinks(nav) {
    var links = Array.from(nav.querySelectorAll('a[href]'));
    return {
      prev: links.find(function (a) {
        return (a.textContent || '').includes('Previous');
      }),
      next: links.find(function (a) {
        return (a.textContent || '').includes('Next');
      }),
    };
  }

  function navigatePagination(direction) {
    var nav = document.querySelector('[data-v-pagination]');
    if (!nav) return false;
    var links = getPaginationLinks(nav);
    var link = direction === 'next' ? links.next : links.prev;
    if (!link) return false;
    link.click();
    return true;
  }

  document.addEventListener('keydown', function (event) {
    if (isEditableTarget(event.target)) return;
    if (event.altKey) return;
    if (!(event.metaKey || event.ctrlKey || event.shiftKey)) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    var direction = event.key === 'ArrowRight' ? 'next' : 'prev';
    if (navigatePagination(direction)) {
      event.preventDefault();
    }
  });

  var isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);

  function updatePaginationKbd() {
    if (!isMac) return;
    document.querySelectorAll('[data-v-pagination] kbd').forEach(function (kbd) {
      if (kbd.textContent === 'Shift') kbd.textContent = '⌘';
    });
  }

  updatePaginationKbd();
  new MutationObserver(updatePaginationKbd).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
