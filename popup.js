// Popup script for WordReference Vocabulary List

document.addEventListener('DOMContentLoaded', function() {
  const wordListEl = document.getElementById('wordList');
  const emptyStateEl = document.getElementById('emptyState');
  const wordCountEl = document.getElementById('wordCount');
  const searchInput = document.getElementById('searchInput');
  const exportBtn = document.getElementById('exportBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const dialogOverlay = document.getElementById('dialogOverlay');
  const cancelClearBtn = document.getElementById('cancelClear');
  const confirmClearBtn = document.getElementById('confirmClear');
  const snackbar = document.getElementById('snackbar');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const languageTogglesEl = document.getElementById('languageToggles');

  let vocabulary = [];
  let languageSettings = {};

  // Load vocabulary from storage
  function loadVocabulary() {
    chrome.storage.local.get(['vocabulary', 'languageSettings'], function(result) {
      vocabulary = result.vocabulary || [];
      languageSettings = result.languageSettings || {};
      renderWordList(vocabulary);
      updateWordCount();
      renderLanguageSettings();
    });
  }

  // Render language settings toggles
  function renderLanguageSettings() {
    // Get unique language pairs from vocabulary
    const languagePairs = [...new Set(vocabulary.map(v => v.languagePair).filter(Boolean))];
    
    if (languagePairs.length === 0) {
      languageTogglesEl.innerHTML = '<div class="no-languages">No languages found yet. Search some words first!</div>';
      return;
    }

    // Initialize settings for new language pairs (enabled by default)
    languagePairs.forEach(lang => {
      if (languageSettings[lang] === undefined) {
        languageSettings[lang] = true;
      }
    });

    languageTogglesEl.innerHTML = languagePairs.map(lang => `
      <div class="language-toggle">
        <span class="language-label">${escapeHtml(lang)}</span>
        <label class="switch">
          <input type="checkbox" data-lang="${escapeHtml(lang)}" ${languageSettings[lang] ? 'checked' : ''}>
          <span class="slider"></span>
        </label>
      </div>
    `).join('');

    // Add event listeners for toggles
    languageTogglesEl.querySelectorAll('input[type="checkbox"]').forEach(toggle => {
      toggle.addEventListener('change', function() {
        const lang = this.dataset.lang;
        languageSettings[lang] = this.checked;
        saveLanguageSettings();
      });
    });
  }

  // Save language settings
  function saveLanguageSettings() {
    chrome.storage.local.set({ languageSettings: languageSettings }, function() {
      showSnackbar('Settings saved');
    });
  }

  // Toggle settings panel
  function toggleSettings() {
    settingsPanel.classList.toggle('show');
  }

  // Render word list
  function renderWordList(words) {
    if (words.length === 0) {
      wordListEl.style.display = 'none';
      emptyStateEl.style.display = 'flex';
      return;
    }

    wordListEl.style.display = 'block';
    emptyStateEl.style.display = 'none';

    wordListEl.innerHTML = words.map((item, index) => `
      <div class="word-card" data-index="${index}">
        <div class="word-card-content">
          <div class="word-header">
            <span>
              <span class="word-title" data-url="${item.url}">${escapeHtml(item.word)}</span>
              ${item.pronunciation ? `<span class="word-pronunciation">${escapeHtml(item.pronunciation)}</span>` : ''}
            </span>
            <span class="language-chip">${escapeHtml(item.languagePair || 'N/A')}</span>
          </div>
          <div class="word-meaning">${escapeHtml(item.meaning)}</div>
          <div class="word-meta">
            <span>${formatDate(item.timestamp)}</span>
            <div class="word-actions">
              <button class="icon-btn copy-btn" data-word="${escapeHtml(item.word)}" data-meaning="${escapeHtml(item.meaning)}" title="Copy">
                <span class="material-icons">content_copy</span>
              </button>
              <button class="icon-btn delete-btn" data-index="${index}" title="Delete">
                <span class="material-icons">delete</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    // Add event listeners for word titles (open URL)
    document.querySelectorAll('.word-title').forEach(el => {
      el.addEventListener('click', function() {
        const url = this.dataset.url;
        if (url) {
          chrome.tabs.create({ url: url });
        }
      });
    });

    // Add event listeners for copy buttons
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const word = this.dataset.word;
        const meaning = this.dataset.meaning;
        copyToClipboard(`${word}: ${meaning}`);
        showSnackbar('Copied to clipboard!');
      });
    });

    // Add event listeners for delete buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const index = parseInt(this.dataset.index);
        deleteWord(index);
      });
    });
  }

  // Update word count
  function updateWordCount() {
    const count = vocabulary.length;
    wordCountEl.textContent = `${count} word${count !== 1 ? 's' : ''} saved`;
  }

  // Delete single word
  function deleteWord(index) {
    vocabulary.splice(index, 1);
    chrome.storage.local.set({ vocabulary: vocabulary }, function() {
      renderWordList(vocabulary);
      updateWordCount();
      showSnackbar('Word deleted');
    });
  }

  // Clear all words
  function clearAllWords() {
    vocabulary = [];
    chrome.storage.local.set({ vocabulary: [] }, function() {
      renderWordList([]);
      updateWordCount();
      showSnackbar('All words deleted');
      hideDialog();
    });
  }

  // Search functionality
  function filterWords(query) {
    if (!query) {
      renderWordList(vocabulary);
      return;
    }
    
    const filtered = vocabulary.filter(item => 
      item.word.toLowerCase().includes(query.toLowerCase()) ||
      item.meaning.toLowerCase().includes(query.toLowerCase())
    );
    renderWordList(filtered);
  }

  // Export to CSV
  function exportToCSV() {
    if (vocabulary.length === 0) {
      showSnackbar('No words to export');
      return;
    }

    const headers = ['Word', 'Pronunciation', 'Meaning', 'Language', 'Date', 'URL'];
    const csvContent = [
      headers.join(','),
      ...vocabulary.map(item => [
        `"${item.word.replace(/"/g, '""')}"`,
        `"${(item.pronunciation || '').replace(/"/g, '""')}"`,
        `"${item.meaning.replace(/"/g, '""')}"`,
        `"${item.languagePair || ''}"`,
        `"${new Date(item.timestamp).toISOString()}"`,
        `"${item.url || ''}"`
      ].join(','))
    ].join('\n');

    // Add UTF-8 BOM for proper encoding in Excel and other applications
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `wordreference_vocab_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showSnackbar('Vocabulary exported!');
  }

  // Show snackbar
  function showSnackbar(message) {
    snackbar.textContent = message;
    snackbar.classList.add('show');
    setTimeout(() => {
      snackbar.classList.remove('show');
    }, 2500);
  }

  // Show/hide dialog
  function showDialog() {
    dialogOverlay.classList.add('show');
  }

  function hideDialog() {
    dialogOverlay.classList.remove('show');
  }

  // Copy to clipboard
  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(err => {
      console.error('Failed to copy:', err);
    });
  }

  // Format date
  function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }

  // Escape HTML
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Event listeners
  searchInput.addEventListener('input', function() {
    filterWords(this.value);
  });

  exportBtn.addEventListener('click', exportToCSV);

  clearAllBtn.addEventListener('click', function() {
    if (vocabulary.length > 0) {
      showDialog();
    } else {
      showSnackbar('No words to delete');
    }
  });

  cancelClearBtn.addEventListener('click', hideDialog);
  confirmClearBtn.addEventListener('click', clearAllWords);
  settingsBtn.addEventListener('click', toggleSettings);

  dialogOverlay.addEventListener('click', function(e) {
    if (e.target === dialogOverlay) {
      hideDialog();
    }
  });

  // Initial load
  loadVocabulary();
});
