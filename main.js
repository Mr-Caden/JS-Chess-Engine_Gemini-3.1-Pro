/**
 * main.js
 * Handles the UI thread, DOM updates, user interaction, move highlighting, 
 * audio playback, and communication with the background Web Worker.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. GLOBAL STATE ---
    let board = null;
    let game = new Chess();
    let isBotVsBot = false;
    let playerColor = 'w';
    let isBotThinking = false;
    let startTime = 0;
    let currentEval = 0.0; // Track precise evaluation for visual flips

    // Load Web Worker (Engine Thread)
    const worker = new Worker('worker.js');

    // Load Sound Effects (Standard Chess.com CDNs)
    const moveSound = new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3');
    const captureSound = new Audio('https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3');

    // --- 2. DOM ELEMENTS ---
    const domNodesCount = document.getElementById('nodesCount');
    const domNps = document.getElementById('nps');
    const domEvalScore = document.getElementById('evalScore');
    const domStatus = document.getElementById('status');
    const domDepth = document.getElementById('searchDepth');
    const domGameMode = document.getElementById('gameMode');
    const domEvalBar = document.getElementById('evalBar');
    const domEvalFill = document.getElementById('evalFill');
    const domEvalText = document.getElementById('evalText');

    // --- 3. EVENT LISTENERS ---
    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('flipBtn').addEventListener('click', flipBoard);
    window.addEventListener('resize', () => { if (board) board.resize(); }); // Mobile scaling

    // --- 4. WORKER COMMUNICATION ---
    worker.onmessage = function(e) {
        const timeElapsed = (performance.now() - startTime) / 1000;

        if (e.data.type === 'progress') {
            domNodesCount.innerText = e.data.nodes.toLocaleString();
            domNps.innerText = Math.round(e.data.nodes / timeElapsed).toLocaleString();
        } 
        else if (e.data.type === 'done') {
            domNodesCount.innerText = e.data.nodes.toLocaleString();
            domNps.innerText = Math.round(e.data.nodes / timeElapsed).toLocaleString();
            
            currentEval = e.data.eval;
            updateEvalBar(currentEval);
            isBotThinking = false;

            if (e.data.move) {
                executeMove(e.data.move);

                if (isBotVsBot && !game.game_over()) {
                    setTimeout(triggerBot, 500); 
                }
            }
        }
    };

    // --- 5. UI & GAME LOGIC FUNCTIONS ---

    /**
     * Updates the Visual Evaluation bar based on the engine's score.
     * @param {number} evalScore - Evaluation in absolute centipawns (positive = White win).
     */
    function updateEvalBar(evalScore) {
        // Format strings using absolutes 
        let evalFormatted = (Math.abs(evalScore) / 100).toFixed(2);
        let textFormatted = (Math.abs(evalScore) / 100).toFixed(1);

        if (evalScore > 20000) {
            evalFormatted = "M";
            textFormatted = "M";
        } else if (evalScore < -20000) {
            evalFormatted = "M";
            textFormatted = "M";
        }

        let sign = evalScore > 0 ? "+" : (evalScore < 0 ? "-" : "");
        if (evalScore === 0) sign = ""; // Clean '0.00' presentation
        
        domEvalScore.innerText = evalScore === 0 ? "0.00" : `${sign}${evalFormatted}`;
        domEvalText.innerText = textFormatted;

        // Calculate height percentage (Caps at +8 / -8 pawns for UI purposes)
        let cappedEval = Math.max(-800, Math.min(800, evalScore));
        let percent = 50 + (cappedEval / 16); // 800 / 16 = +50%

        domEvalFill.style.height = `${percent}%`;

        // Bar and Text visual manipulation for black orientation flips
        let isBlackOrientation = board.orientation() === 'black';
        domEvalBar.style.transform = isBlackOrientation ? 'rotate(180deg)' : 'none';
        domEvalText.style.transform = isBlackOrientation ? 'rotate(180deg)' : 'none';

        // Keep text constrained to whichever section represents the active advantage
        if (percent >= 50) {
            // White advantage -> Place text inside the lower white bar natively
            domEvalText.style.top = 'auto';
            domEvalText.style.bottom = '5px';
            domEvalText.style.color = '#333';
        } else {
            // Black advantage -> Place text inside the upper black bar natively
            domEvalText.style.bottom = 'auto';
            domEvalText.style.top = '5px';
            domEvalText.style.color = '#f5f5f5';
        }
    }

    /**
     * Applies CSS classes to highlight the from/to squares of a move.
     * @param {Object} move - The chess.js move object.
     */
    function highlightMove(move) {
        // Remove previous highlights
        $('#board .square-55d63').removeClass('highlight-white highlight-black');
        
        const squares =[move.from, move.to];
        squares.forEach(sq => {
            let $square = $('#board .square-' + sq);
            let isWhiteSquare = $square.hasClass('white-1e1d7');
            $square.addClass(isWhiteSquare ? 'highlight-white' : 'highlight-black');
        });
    }

    /**
     * Executes a move on the board, plays sound, and triggers highlights.
     * @param {Object} move - The chess.js move object.
     */
    function executeMove(move) {
        game.move(move.san);
        board.position(game.fen());
        highlightMove(move);
        
        if (move.captured) captureSound.play();
        else moveSound.play();

        updateStatus();
    }

    /**
     * Updates the status text (Checkmate, Draw, or turn indication).
     */
    function updateStatus() {
        let statusText = '';
        let moveColor = game.turn() === 'w' ? 'White' : 'Black';

        if (game.in_checkmate()) statusText = `Checkmate! ${moveColor} loses.`;
        else if (game.in_draw()) statusText = 'Game over, Drawn Position';
        else {
            statusText = `${moveColor} to move`;
            if (game.in_check()) statusText += ` (${moveColor} is in check!)`;
        }
        domStatus.innerText = statusText;
    }

    /**
     * Sends the current board state to the Web Worker for calculation.
     */
    function triggerBot() {
        if (game.game_over()) return;
        
        isBotThinking = true;
        domStatus.innerText = 'Bot is thinking...';
        startTime = performance.now();
        
        let depth = parseInt(domDepth.value);
        worker.postMessage({ fen: game.fen(), depth: depth });
    }

    /**
     * Fired when a player drops a piece manually.
     */
    function onDrop(source, target) {
        if (isBotVsBot || isBotThinking) return 'snapback';

        let move = game.move({
            from: source,
            to: target,
            promotion: 'q' 
        });

        if (move === null) return 'snapback';

        game.undo(); // Undo temporarily so executeMove can handle graphics/sound
        executeMove(move);
        triggerBot(); 
    }

    /**
     * Prevents picking up invalid pieces.
     */
    function onDragStart(source, piece) {
        if (game.game_over() || isBotVsBot || isBotThinking) return false;
        if (playerColor === 'w' && piece.search(/^b/) !== -1) return false; 
        if (playerColor === 'b' && piece.search(/^w/) !== -1) return false; 
    }

    /**
     * Flips the board visually and updates the Evaluation bar orientation.
     */
    function flipBoard() {
        if (board) {
            board.flip();
            // Re-trigger eval bar math (which rotates based on the new orientation)
            updateEvalBar(currentEval);
        }
    }

    /**
     * Initializes a fresh game based on UI settings.
     */
    function startGame() {
        game.reset();
        $('#board .square-55d63').removeClass('highlight-white highlight-black');
        
        let mode = domGameMode.value;
        isBotVsBot = (mode === 'eve');
        playerColor = (mode === 'pve_b') ? 'b' : 'w';
        isBotThinking = false;
        
        let config = {
            draggable: !isBotVsBot,
            position: 'start',
            orientation: playerColor === 'b' ? 'black' : 'white',
            onDragStart: onDragStart,
            onDrop: onDrop,
            pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
        };
        
        board = Chessboard('board', config);
        updateStatus();
        
        // Resetting global metrics and board visuals smoothly
        domNodesCount.innerText = "0";
        domNps.innerText = "0";
        currentEval = 0.0;
        updateEvalBar(currentEval);

        if (isBotVsBot || playerColor === 'b') triggerBot(); 
    }

    // Initialize an empty board visual on load
    board = Chessboard('board', {
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        position: 'start'
    });
});
