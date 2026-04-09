Bamboo Booper – Sounds
=====================

The game uses the Web Audio API (synthesised tones) for all sound effects.
No external audio files are required for the game to run.

If you want to replace the synthesised sounds with real MP3 files in future:

  bamboo-pop.mp3  — played when panda eats bamboo
  click.mp3       — played on button clicks
  game-over.mp3   — played when game ends

Add your files to this folder, then update js/audio.js to load them
using the Audio() constructor instead of the WebAudio oscillator.

Current audio engine: js/audio.js (WebAudio API, no external files needed)
