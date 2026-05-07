const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1200, height: 900 });

    page.on('console', msg => console.log('PAGE:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

    const url = 'file://' + path.resolve(__dirname, 'index.html');
    await page.goto(url, { waitUntil: 'networkidle' });

    // Select CharacterIndividual type and switch
    await page.selectOption('#individual-type-select', 'CharacterIndividual');
    await page.click('#switch-individual-type-btn');

    // Wait for canvas elements to appear in the grid
    try {
        await page.waitForSelector('#grid canvas', { timeout: 8000 });
        console.log('Canvases found');
    } catch (e) {
        console.log('No canvases found, checking grid state...');
    }

    await page.waitForTimeout(1500);

    // Debug info
    const info = await page.evaluate(() => {
        const grid = document.getElementById('grid');
        const canvases = grid ? grid.querySelectorAll('canvas') : [];
        return {
            gridExists: !!grid,
            gridChildren: grid ? grid.children.length : 0,
            canvasCount: canvases.length,
            gridStyle: grid ? window.getComputedStyle(grid).display : 'n/a'
        };
    });
    console.log('Debug:', JSON.stringify(info));

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: '/tmp/characters.png', fullPage: true });
    console.log('Screenshot saved to /tmp/characters.png');

    await browser.close();
})();
