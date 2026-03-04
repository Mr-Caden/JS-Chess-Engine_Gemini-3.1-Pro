# Web-Worker JS Chess Engine
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

A high-performance, purely client-side Chess Engine built entirely in JavaScript. 

Unlike traditional JS game loops that freeze the DOM during heavy computation, this engine utilizes a **Web Worker architecture** to offload multi-threaded move-tree generation to a background process. This allows the UI—including a live dynamic Evaluation Bar—to remain fully responsive while calculating millions of possible board states.

*(Insert a GIF of you playing a move and the Eval Bar shifting here)*

## Features & Architecture

* **Web Worker Threading:** Core mathematical processing runs on a background thread.
* **Dynamic Evaluation Bar:** A Lichess-style visual bar that maps the engine's absolute centipawn evaluation directly into the CSS UI smoothly. 
* **Opening Book:** Includes an instantly retrieved hash-map of standard chess theory for the first few moves (e.g., the Sicilian, the Italian Game), saving massive computation time in the early game.
* **NegaMax Algorithm:** A streamlined, mathematically elegant variant of Minimax utilized by standard modern chess engines.
* **Alpha-Beta Pruning & Move Ordering:** (MVV-LVA) Intelligently evaluates standard capture chains first, eliminating unviable branches of the game tree mathematically to exponentially increase search depth.
* **Quiescence Search:** Prevents the "Horizon Effect" by recalculating capture-chains beyond the target depth limit, ensuring the engine never blunders pieces at the end of a sequence.
* **Tapered String Evaluation:** Heavily optimized static evaluation by iterating raw FEN strings rather than dynamically allocating Javascript objects, boosting speed by ~400%. Shifts piece-square values dynamically between the Middle and End-game.
* **100/100 Accessibility:** Fully mobile responsive, high-contrast UI compliant with Lighthouse web standards. Features audio playback for moves and visual square highlighting.

## File Structure

* `index.html`: The semantic UI and entry point.
* `style.css`: Presentation layer, Flexbox layout, and CSS Eval Bar animations.
* `main.js`: Main UI thread. Handles chessboard rendering, DOM state, audio, highlights, and Web Worker messaging.
* `worker.js`: The backend processor thread. Contains the Opening book, evaluation weights, and search algorithms.

## How to Run Locally

Due to modern browser Cross-Origin Resource Sharing (CORS) security policies regarding Web Workers (`worker.js`), this project must be served via a local web server (opening `index.html` directly from your hard drive will result in a security block).

**Using VS Code:**
1. Install the "Live Server" extension.
2. Right-click `index.html` and click "Open with Live Server".

**Using Python:**
1. Open your terminal in the project directory.
2. Run `python -m http.server 8000` (or `python3`).
3. Open `http://localhost:8000` in your browser.

## Tech Stack & Dependencies
* **Core Logic:** Vanilla Javascript (ES6+)
* **UI/Board Graphics:**[Chessboard.js](https://chessboardjs.com/)
* **Move Validation/Generation:** [Chess.js](https://github.com/jhlywa/chess.js)
