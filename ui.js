/**
 * Bamboo Booper v1.0 – ui.js
 * CodeTech · Lead Developer: Sachin Sheth
 * ─────────────────────────────────────────
 * Screen routing, modals, back-button, exit logic.
 * Full implementation is inlined in index.html.
 *
 * Screens: splash|menu|settings|about|privacy|
 *          leaderboard|achievements|game-screen|welcome
 *
 * Back behaviour:
 *   gameplay → pause | sub-screen → back | menu → double-back exit
 *
 * exitApp() chain:
 *   AndroidBridge → navigator.app → window.close → friendly screen
 */
'use strict';
console.log('[UI] Module ready');
