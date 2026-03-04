/**
 * main.js
 * Handles the UI thread, user input, DOM updates, and communication 
 * with the background Web Worker (the engine).
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. GLOBAL STATE ---
    let board = null;
    let game = new Chess();
    let isBotVsBot = false;
    let playerColor = 'w';
    let isBotThinking = false;
    let startTime = 0;

    // Load the Web Worker (Engine Thread)
    const worker = new Worker('worker.js');

    // --- 2. DOM ELEMENTS ---
    const domNodesCount = document.getElementById('nodesCount');
    const domNps = document.getElementById('nps');
    const domEvalScore = document.getElementById('evalScore');
    const domStatus = document.getElementById('status');
    const domDepth = document.getElementById('searchDepth');
    const domGameMode = document.getElementById('gameMode');

    // --- 3. EVENT LISTENERS ---
    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('flipBtn').addEventListener('click', flipBoard);

    // --- 4. WORKER COMMUNICATION ---
    worker.onmessage = function(e) {
        const timeElapsed = (performance.now() - startTime) / 1000;

        // Progress updates sent periodically during deep searches
        if (e.data.type === 'progress') {
            domNodesCount.innerText = e.data.nodes.toLocaleString();
            domNps.innerText = Math.round(e.data.nodes / timeElapsed).toLocaleString();
        } 
        // Search completed
        else if (e.data.type === 'done') {
            domNodesCount.innerText = e.data.nodes.toLocaleString();
            domNps.innerText = Math.round(e.data.nodes / timeElapsed).toLocaleString();
            
            // Format Evaluation (Centipawns to Standard Chess Eval)
            let evalFormatted = (e.data.eval / 100).toFixed(2);
            if (e.data.eval > 20000) evalFormatted = "M1+";
            if (e.data.eval < -20000) evalFormatted = "-M1+";
            domEvalScore.innerText = evalFormatted;

            isBotThinking = false;

            // Execute the calculated move
            if (e.data.move) {
                game.move(e.data.move.san);
                board.position(game.fen());
                updateStatus();

                // If in Bot vs Bot mode, immediately trigger the next turn
                if (isBotVsBot && !game.game_over()) {
                    setTimeout(triggerBot, 500); 
                }
            }
        }
    };

    // --- 5. GAME LOGIC & UI UPDATES ---
    function updateStatus() {
        let statusText = '';
        let moveColor = game.turn() === 'w' ? 'White' : 'Black';

        if (game.in_checkmate()) statusText = `Checkmate! ${moveColor} loses.`;
        else if (game.in_draw()) statusText = 'Game over, Drawn Position';
        else {
            statusText = `${moveColor} to move`;
            if (game.in_check()) statusText += `, ${moveColor} is in check!`;
        }
        domStatus.innerText = statusText;
    }

    function triggerBot() {
        if (game.game_over()) return;
        
        isBotThinking = true;
        domStatus.innerText = 'Bot is thinking...';
        startTime = performance.now();
        
        let depth = parseInt(domDepth.value);
        
        // Send current board state to the background worker
        worker.postMessage({ fen: game.fen(), depth: depth });
    }

    function onDrop(source, target) {
        // Prevent moves if UI is locked
        if (isBotVsBot || isBotThinking) return 'snapback';

        let move = game.move({
            from: source,
            to: target,
            promotion: 'q' // Auto-promote to Queen for simplicity
        });

        if (move === null) return 'snapback';

        updateStatus();
        triggerBot(); // Hand turn over to AI
    }

    function onDragStart(source, piece, position, orientation) {
        if (game.game_over() || isBotVsBot || isBotThinking) return false;
        
        // Prevent player from grabbing opponent's pieces
        if (playerColor === 'w' && piece.search(/^b/) !== -1) return false; 
        if (playerColor === 'b' && piece.search(/^w/) !== -1) return false; 
    }

    function flipBoard() {
        if (board) board.flip();
    }

    function startGame() {
        game.reset();
        
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
        
        // Reset Stats UI
        domNodesCount.innerText = "0";
        domNps.innerText = "0";
        domEvalScore.innerText = "0.00";

        // Kick off game if Bot plays White or if it's Bot vs Bot
        if (isBotVsBot || playerColor === 'b') {
            triggerBot(); 
        }
    }

    // Initialize an empty board visual on load
    board = Chessboard('board', {
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        position: 'start'
    });
});
