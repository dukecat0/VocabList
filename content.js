// Content script for WordReference.com
// Extracts the searched word and its translation/meaning

(function() {
  'use strict';

  // Check if we're on a translation page
  function isTranslationPage() {
    return window.location.pathname.match(/^\/[a-z]{2,4}\//) !== null;
  }

  // Extract the searched word from the page
  function getSearchedWord() {
    // Try to get from the search input
    const searchInput = document.querySelector('#si');
    if (searchInput && searchInput.value) {
      return searchInput.value.trim();
    }

    // Try to get from URL
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length >= 3) {
      return decodeURIComponent(pathParts[pathParts.length - 1]).trim();
    }

    // Try to get from page title
    const title = document.title;
    const match = title.match(/^(.+?)\s*[-|]/);
    if (match) {
      return match[1].trim();
    }

    return null;
  }

  // Extract pronunciation
  function getPronunciation() {
    // Try to get IPA pronunciation
    const pronElements = document.querySelectorAll('.pronWR, .pronIPAiPA, .pronRH, span[title*="pronunciation"]');
    for (const el of pronElements) {
      const text = el.textContent.trim();
      if (text && text.length > 0) {
        return text;
      }
    }

    // Try from the word header area
    const headerArea = document.querySelector('#articleWRD, .WRD');
    if (headerArea) {
      const pronSpan = headerArea.querySelector('span.pronWR, span[class*="pron"]');
      if (pronSpan) {
        return pronSpan.textContent.trim();
      }
    }

    // Try to find any element with IPA-like content near the word
    const allSpans = document.querySelectorAll('span');
    for (const span of allSpans) {
      const text = span.textContent.trim();
      // Match IPA patterns like /word/ or [word]
      if (text.match(/^[\/\[].+[\/\]]$/) && text.length < 50) {
        return text;
      }
    }

    return null;
  }

  // Extract the primary meaning/translation
  function getMeaning() {
    const meanings = [];

    // Try to get translations from the main table
    const translationRows = document.querySelectorAll('tr.even, tr.odd');
    
    for (const row of translationRows) {
      // Get the "To" column (translation)
      const toCol = row.querySelector('td.ToWrd');
      if (toCol) {
        const translation = toCol.textContent.trim().split('\n')[0].trim();
        if (translation && !meanings.includes(translation)) {
          meanings.push(translation);
          if (meanings.length >= 3) break; // Limit to 3 meanings
        }
      }
    }

    // If no translations found, try getting definitions
    if (meanings.length === 0) {
      const definitions = document.querySelectorAll('.FrWrd + td');
      for (const def of definitions) {
        const text = def.textContent.trim().split('\n')[0].trim();
        if (text && !meanings.includes(text)) {
          meanings.push(text);
          if (meanings.length >= 3) break;
        }
      }
    }

    return meanings.length > 0 ? meanings.join('; ') : null;
  }

  // Get language pair from URL
  function getLanguagePair() {
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length >= 2) {
      return pathParts[1]; // e.g., "enfr", "esen", etc.
    }
    return 'unknown';
  }

  // Save word to storage
  function saveWord(word, meaning, languagePair, pronunciation) {
    if (!word) return;

    const entry = {
      word: word,
      meaning: meaning || 'No translation found',
      pronunciation: pronunciation || '',
      languagePair: languagePair,
      timestamp: Date.now(),
      url: window.location.href
    };

    chrome.storage.local.get(['vocabulary', 'languageSettings'], function(result) {
      const languageSettings = result.languageSettings || {};
      
      // Check if this language pair is disabled
      if (languageSettings[languagePair] === false) {
        console.log('WordReference Vocab List: Skipping word - language disabled:', languagePair);
        return;
      }

      const vocabulary = result.vocabulary || [];
      
      // Check if word already exists
      const existingIndex = vocabulary.findIndex(
        v => v.word.toLowerCase() === word.toLowerCase() && v.languagePair === languagePair
      );

      if (existingIndex >= 0) {
        // Update existing entry
        vocabulary[existingIndex] = entry;
      } else {
        // Add new entry
        vocabulary.unshift(entry);
      }

      // Keep only last 500 words
      if (vocabulary.length > 500) {
        vocabulary.pop();
      }

      chrome.storage.local.set({ vocabulary: vocabulary }, function() {
        console.log('WordReference Vocab List: Saved word -', word);
      });
    });
  }

  // Main function
  function captureWord() {
    if (!isTranslationPage()) return;

    const word = getSearchedWord();
    if (!word) return;

    const meaning = getMeaning();
    const pronunciation = getPronunciation();
    const languagePair = getLanguagePair();

    saveWord(word, meaning, languagePair, pronunciation);
  }

  // Wait a bit for the page to fully load, then capture
  setTimeout(captureWord, 1000);

  // Also capture on URL changes (for single-page navigation)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      setTimeout(captureWord, 1000);
    }
  }).observe(document, { subtree: true, childList: true });

})();
