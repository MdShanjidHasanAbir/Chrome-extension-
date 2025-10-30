// Google AI Studio Clear Chat Button (extension port of userscript behavior)
// Injects a button into the run toolbar and, when clicked, opens each chat turn's
// options menu and triggers its Delete action, mirroring native behavior.

(function() {
    'use strict';

    const CHAT_TURN_OPTIONS_SELECTOR = 'ms-chat-turn-options span.material-symbols-outlined.notranslate.ms-button-icon-symbol';
    const DELETE_BUTTON_MENU_SELECTOR = 'div.mat-mdc-menu-content > button';
    const DELETE_BUTTON_TEXT = 'delete';
    const TOOLBAR_SELECTOR = 'ms-toolbar .toolbar-right';
    const CHAT_CONTAINER_SELECTOR = '.chat-container';

    function clickAll(selector) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(function(el) { el.click(); });
        return elements.length;
    }

    function clickDeleteButtons(selector, text) {
        const buttons = document.querySelectorAll(selector);
        let count = 0;
        buttons.forEach(function(button) {
            var txt = (button.textContent || '').trim().toLowerCase();
            if (txt.includes(text.toLowerCase())) {
                button.click();
                count++;
            }
        });
        return count;
    }

    function createCleanerButton() {
        if (document.getElementById('gemini-cleaner-button')) return;

        const toolbar = document.querySelector(TOOLBAR_SELECTOR);
        const button = document.createElement('button');
        button.id = 'gemini-cleaner-button';
        button.setAttribute('aria-label', 'Clear Chat');

        if (toolbar) {
            // Toolbar style: text button labeled "Clear"
            button.className = 'mat-mdc-button-base ms-button-borderless';
            button.textContent = 'Clear';
            button.style.height = '36px';
            button.style.padding = '0 12px';
            button.style.borderRadius = '18px';
            button.style.fontWeight = '600';
            button.style.cursor = 'pointer';
        } else {
            // Fallback floating red button (previous UI)
            button.textContent = 'Clear';
            button.style.position = 'absolute';
            button.style.top = '10px';
            button.style.right = '10px';
            button.style.zIndex = '2147483647';
            button.style.padding = '6px 12px';
            button.style.border = '1px solid rgba(0,0,0,0.12)';
            button.style.borderRadius = '6px';
            button.style.background = '#e53935';
            button.style.color = '#fff';
            button.style.cursor = 'pointer';
            button.style.fontWeight = '600';
            button.style.lineHeight = '1';
            button.style.userSelect = 'none';
        }

        button.addEventListener('click', function() {
            const opened = clickAll(CHAT_TURN_OPTIONS_SELECTOR);
            // Wait briefly for menus to render
            setTimeout(function() {
                clickDeleteButtons(DELETE_BUTTON_MENU_SELECTOR, DELETE_BUTTON_TEXT);
            }, 500);
        });

        if (toolbar) {
            // Insert before the trailing more actions button to match placement
            var moreBtn = toolbar.querySelector('button[iconname="more_vert"]');
            if (moreBtn && moreBtn.parentElement === toolbar) {
                toolbar.insertBefore(button, moreBtn);
            } else {
                toolbar.appendChild(button);
            }
        } else {
            const chatContainer = document.querySelector(CHAT_CONTAINER_SELECTOR);
            if (chatContainer) {
                if (!chatContainer.style.position) chatContainer.style.position = 'relative';
                chatContainer.appendChild(button);
            }
        }
    }

    // Try immediately
    createCleanerButton();

    // Observe SPA mutations to (re)insert when needed
    const observer = new MutationObserver(function() {
        if (!document.getElementById('gemini-cleaner-button') && (document.querySelector(TOOLBAR_SELECTOR) || document.querySelector(CHAT_CONTAINER_SELECTOR))) {
            createCleanerButton();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
