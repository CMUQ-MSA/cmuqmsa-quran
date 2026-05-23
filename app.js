document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generate-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const container = document.getElementById('verses-container');
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error-message');

    // API Configuration
    const BASE_URL = 'https://api.quran.com/api/v4';
    const TRANSLATION_ID = 20;
    const FETCH_TIMEOUT_MS = 10000;

    // State Management
    let verseState = {
        chapterId: null,
        surahName: '', // NEW: To store the Surah name
        totalVerses: 0,
        startVerse: 0,
        endVerse: 0
    };

    generateBtn.addEventListener('click', handleGenerate);
    prevBtn.addEventListener('click', handlePrev);
    nextBtn.addEventListener('click', handleNext);

    async function handleGenerate() {
        container.innerHTML = '';
        errorEl.classList.add('hidden');
        loadingEl.classList.remove('hidden');
        prevBtn.classList.add('hidden');
        nextBtn.classList.add('hidden');
        generateBtn.disabled = true;

        try {
            // 1. Fetch Random Ayah
            const randomData = await fetchRandomAyah();
            const mainVerseKey = randomData.verse_key;
            
            // 2. Determine Context Keys & Get Chapter Info
            const keysToFetch = await calculateContextKeys(mainVerseKey);
            
            // 3. Fetch All Verses
            const verses = await fetchVersesSafe(keysToFetch);

            // 4. Update State Ranges
            if (verses.length > 0) {
                const verseNumbers = verses.map(v => parseInt(v.verse_key.split(':')[1]));
                verseState.startVerse = Math.min(...verseNumbers);
                verseState.endVerse = Math.max(...verseNumbers);
            }

            // 5. Render
            renderVerses(verses, mainVerseKey);

            // 6. Update UI
            updateButtonUI();

        } catch (error) {
            console.error(error);
            showError('Failed to fetch content. Please check your internet connection and try again.');
        } finally {
            loadingEl.classList.add('hidden');
            generateBtn.disabled = false;
        }
    }

    // --- Button Handlers ---

    async function handlePrev() {
        if (verseState.startVerse <= 1) return;

        const newVerseNum = verseState.startVerse - 1;
        const key = `${verseState.chapterId}:${newVerseNum}`;

        prevBtn.disabled = true;
        prevBtn.textContent = 'Loading...';

        try {
            const verses = await fetchVersesSafe([key]);
            if (verses.length > 0) {
                const verse = verses[0];
                const card = createVerseCard(verse, false);
                
                // Scroll Logic
                const oldHeight = container.scrollHeight;
                const oldScrollY = window.scrollY;

                container.prepend(card);

                const newHeight = container.scrollHeight;
                window.scrollTo(0, oldScrollY + (newHeight - oldHeight));

                verseState.startVerse = newVerseNum;
                updateButtonUI();
            }
        } catch (e) {
            console.error(e);
        } finally {
            prevBtn.textContent = 'Load Previous Ayah';
        }
    }

    async function handleNext() {
        if (verseState.endVerse >= verseState.totalVerses) return;

        const newVerseNum = verseState.endVerse + 1;
        const key = `${verseState.chapterId}:${newVerseNum}`;

        nextBtn.disabled = true;
        nextBtn.textContent = 'Loading...';

        try {
            const verses = await fetchVersesSafe([key]);
            if (verses.length > 0) {
                const verse = verses[0];
                const card = createVerseCard(verse, false);
                container.appendChild(card); 

                verseState.endVerse = newVerseNum;
                updateButtonUI();
            }
        } catch (e) {
            console.error(e);
        } finally {
            nextBtn.textContent = 'Load Next Ayah';
        }
    }

    function updateButtonUI() {
        prevBtn.classList.remove('hidden');
        nextBtn.classList.remove('hidden');
        prevBtn.disabled = verseState.startVerse <= 1;
        nextBtn.disabled = verseState.endVerse >= verseState.totalVerses;
    }

    // --- Core Logic ---

    async function fetchRandomAyah() {
        const data = await fetchJson(`${BASE_URL}/verses/random?translations=${TRANSLATION_ID}&fields=text_uthmani`);
        return data.verse;
    }

    async function calculateContextKeys(verseKey) {
        const [chapterStr, verseStr] = verseKey.split(':');
        const chapter = parseInt(chapterStr);
        const verse = parseInt(verseStr);

        // Fetch chapter info
        const chapterData = await fetchJson(`${BASE_URL}/chapters/${chapter}`);
        
        // UPDATE STATE: Store name and counts
        verseState.totalVerses = chapterData.chapter.verses_count;
        verseState.chapterId = chapter;
        verseState.surahName = chapterData.chapter.name_simple; // Get "Al-Fatihah", etc.

        const keys = [];
        if (verse > 1) keys.push(`${chapter}:${verse - 1}`);
        keys.push(`${chapter}:${verse}`);
        if (verse < verseState.totalVerses) keys.push(`${chapter}:${verse + 1}`);

        return keys;
    }

    async function fetchVersesSafe(keys) {
        const promises = keys.map(async (key) => {
            const url = `${BASE_URL}/verses/by_key/${key}?translations=${TRANSLATION_ID}&fields=text_uthmani`;
            try {
                const data = await fetchJson(url);
                return data.verse;
            } catch {
                return null;
            }
        });

        const results = await Promise.all(promises);
        return results.filter(v => v !== null);
    }

    // --- Render Logic ---

    function createVerseCard(verse, isMain) {
        const translation = verse.translations && verse.translations.length > 0 
            ? verse.translations[0].text 
            : 'Translation unavailable';

        // Display "Surah Al-Name 2:155"
        const headerText = `${verseState.surahName} ${verse.verse_key}`;

        const card = document.createElement('div');
        card.className = `verse-card ${isMain ? 'main-verse' : 'context-verse'}`;

        const header = document.createElement('div');
        header.className = 'verse-header';
        const label = document.createElement('span');
        label.textContent = isMain ? 'Selected Ayah' : 'Context';
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = headerText;
        header.append(label, badge);

        const arabic = document.createElement('div');
        arabic.className = 'arabic-text';
        arabic.textContent = verse.text_uthmani || '';

        const translationEl = document.createElement('div');
        translationEl.className = 'translation-text';
        translationEl.textContent = removeFootnotes(translation);

        card.append(header, arabic, translationEl);
        return card;
    }

    function renderVerses(verses, mainKey) {
        container.innerHTML = '';
        verses.forEach(verse => {
            const isMain = verse.verse_key === mainKey;
            const card = createVerseCard(verse, isMain);
            container.appendChild(card);
        });

        const mainCard = document.querySelector('.main-verse');
        if(mainCard) {
            mainCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function removeFootnotes(text) {
        return text.replace(/<sup.*?<\/sup>/g, '').replace(/\[\d+\]/g, '');
    }

    async function fetchJson(url, attempts = 2) {
        let lastError;
        for (let attempt = 0; attempt < attempts; attempt++) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
            try {
                const response = await fetch(url, { signal: controller.signal });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return await response.json();
            } catch (error) {
                lastError = error;
                if (attempt < attempts - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
                }
            } finally {
                clearTimeout(timeout);
            }
        }
        throw lastError || new Error('Fetch failed');
    }

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
    }
});
