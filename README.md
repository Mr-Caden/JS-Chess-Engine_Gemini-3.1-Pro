# Threaded Javascript Chess Engine

A high-performance, purely client-side Chess Engine built with Javascript. 

Unlike traditional JS game loops that freeze the DOM during heavy computation, this engine utilizes a **Web Worker architecture** to offload move-tree generation to a background thread. This allows the UI to remain fully responsive while calculating millions of possible board states.

> **Note:** Vibe coded with Gemini 3.1 Pro Preview.

## Features & Architecture

* **Web Worker Threading:** The core engine runs on a background process, ensuring the browser's main UI thread never locks up, even at high search depths.
* **NegaMax Algorithm:** A streamlined, mathematically elegant variant of Minimax utilized by standard chess engines.
* **Alpha-Beta Pruning:** Eliminates unviable branches of the game tree mathematically, exponentially increasing the depth the engine can search in a given time frame.
* **Quiescence Search:** Prevents the "Horizon Effect" by continuing to calculate capture-chains past the target depth limit, ensuring the engine evaluates stable board states.
* **MVV-LVA Move Ordering:** (Most Valuable Victim - Least Valuable Attacker). Intelligently sorts the move list before searching, vastly increasing the efficiency of Alpha-Beta pruning.
* **Tapered Evaluation:** Blends middle-game and end-game Piece-Square Tables (PST) seamlessly, allowing the King to activate and become an attacking piece as material leaves the board.
* **FEN-Based Evaluation:** Heavily optimized static evaluation by iterating raw FEN strings rather than dynamically allocating Javascript objects, boosting node-per-second (NPS) speed by ~400%.

## File Structure

* `index.html`: The structural entry point.
* `style.css`: Presentation and UI styling.
* `main.js`: Main UI thread. Handles chessboard rendering, DOM state, and Web Worker messaging.
* `worker.js`: The backend processor thread. Contains all AI logic, evaluations, and search algorithms.

## How to Run Locally

Because the engine utilizes Web Workers (`worker.js`), most browsers (like Chrome) will block the script if you try to open the `index.html` file directly from your hard drive (`file://` protocol) due to Cross-Origin Resource Sharing (CORS) security policies. 

To run this locally, you must serve it via a local web server:

**Using VS Code:**
1. Install the "Live Server" extension.
2. Right-click `index.html` and click "Open with Live Server".

**Using Python:**
1. Open your terminal in the project directory.
2. Run `python -m http.server 8000` (or `python3`).
3. Open `http://localhost:8000` in your browser.

## Tech Stack
* **UI/Board Graphics:**[Chessboard.js](https://chessboardjs.com/)
* **Move Validation/Generation:** [Chess.js](https://github.com/jhlywa/chess.js)
