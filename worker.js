/**
 * worker.js
 * The background engine thread. Implements NegaMax, Alpha-Beta Pruning, 
 * Quiescence Search, Tapered Evaluation, and an Opening Book.
 */

importScripts('https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js');

// --- 1. THE OPENING BOOK ---
// Provides instant, theoretical "best moves" for common openings to save time.
const OPENING_BOOK = {
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1": "e4", // 1. e4
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1": "e5", // 1... e5
    "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1": "Nf6", // 1... Nf6 (Indian Defense)
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2": "Nf3", // 2. Nf3
    "rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3": "Bc4", // Italian Game
    "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2": "Nf3", // Sicilian Defense
    "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2": "exd5" // Scandinavian Defense
};

// --- 2. EVALUATION WEIGHTS ---
const pieceValues = { 'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000 };
const phaseValues = { 'n': 1, 'b': 1, 'r': 2, 'q': 4 };

// Piece-Square Tables (PST) - Encourages ideal positional play
const mg_pawn =[0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0];
const eg_pawn =[0,0,0,0,0,0,0,0, 80,80,80,80,80,80,80,80, 50,50,50,50,50,50,50,50, 30,30,30,30,30,30,30,30, 20,20,20,20,20,20,20,20, 10,10,10,10,10,10,10,10, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0];
const mg_knight =[-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50];
const mg_bishop =[-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20];
const mg_rook =[0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0];
const mg_queen =[-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20];
const mg_king =[-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20];
const eg_king =[-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50];

let nodes = 0;

/**
 * Calculates the static evaluation of the board. Heavily optimized using string parsing.
 * @param {Object} game - The chess.js instance.
 * @returns {number} The evaluation score in centipawns.
 */
function evaluate(game) {
    let fen = game.fen().split(' ')[0];
    let mg_score = 0;
    let eg_score = 0;
    let phase = 0;

    let square = 0;
    for (let i = 0; i < fen.length; i++) {
        let char = fen[i];
        if (char === '/') continue;
        if (char >= '1' && char <= '8') {
            square += parseInt(char);
        } else {
            let isWhite = (char === char.toUpperCase());
            let type = char.toLowerCase();
            
            let tableIndex = isWhite ? square : (56 - (square & 56)) + (square & 7); 
            
            let mg_val = pieceValues[type];
            let eg_val = pieceValues[type];

            if (type === 'p') { mg_val += mg_pawn[tableIndex]; eg_val += eg_pawn[tableIndex]; }
            else if (type === 'n') { mg_val += mg_knight[tableIndex]; eg_val += mg_knight[tableIndex]; phase += phaseValues['n']; }
            else if (type === 'b') { mg_val += mg_bishop[tableIndex]; eg_val += mg_bishop[tableIndex]; phase += phaseValues['b']; }
            else if (type === 'r') { mg_val += mg_rook[tableIndex]; eg_val += mg_rook[tableIndex]; phase += phaseValues['r']; }
            else if (type === 'q') { mg_val += mg_queen[tableIndex]; eg_val += mg_queen[tableIndex]; phase += phaseValues['q']; }
            else if (type === 'k') { mg_val += mg_king[tableIndex]; eg_val += eg_king[tableIndex]; }

            if (isWhite) {
                mg_score += mg_val;
                eg_score += eg_val;
            } else {
                mg_score -= mg_val;
                eg_score -= eg_val;
            }
            square++;
        }
    }

    // Tapered Evaluation: Blend scores depending on material left
    phase = Math.min(24, phase);
    let mg_weight = phase / 24;
    let eg_weight = 1 - mg_weight;
    return (mg_score * mg_weight) + (eg_score * eg_weight);
}

/**
 * Prioritizes move order (Most Valuable Victim - Least Valuable Attacker).
 * @param {Object} move - The parsed move object.
 * @returns {number} Score used to sort the move array.
 */
function getMoveScore(move) {
    let score = 0;
    if (move.captured) score = 10 * pieceValues[move.captured] - pieceValues[move.piece];
    if (move.flags.includes('p')) score += 900; 
    return score;
}

/**
 * Explores active capture chains to prevent the horizon effect.
 * @param {Object} game - The chess instance.
 * @param {number} alpha 
 * @param {number} beta 
 * @param {number} color - 1 for White, -1 for Black.
 * @returns {number}
 */
function quiesce(game, alpha, beta, color) {
    nodes++;
    if (nodes % 50000 === 0) self.postMessage({ type: 'progress', nodes: nodes });

    let stand_pat = evaluate(game) * color;
    if (stand_pat >= beta) return beta;
    if (alpha < stand_pat) alpha = stand_pat;

    let moves = game.moves({ verbose: true }).filter(m => m.captured || m.flags.includes('p'));
    moves.sort((a, b) => getMoveScore(b) - getMoveScore(a));

    for (let move of moves) {
        game.move(move.san);
        let score = -quiesce(game, -beta, -alpha, -color);
        game.undo();

        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
    }
    return alpha;
}

/**
 * Core NegaMax tree search with Alpha-Beta Pruning.
 * @param {Object} game - The chess instance.
 * @param {number} depth - Plies left to search.
 * @param {number} alpha 
 * @param {number} beta 
 * @param {number} color 
 * @returns {number}
 */
function negaMax(game, depth, alpha, beta, color) {
    nodes++;
    if (nodes % 50000 === 0) self.postMessage({ type: 'progress', nodes: nodes });

    if (depth === 0) return quiesce(game, alpha, beta, color);

    let moves = game.moves({ verbose: true });
    if (moves.length === 0) {
        if (game.in_check()) return -30000 + game.history().length; // Faster checkmates are mathematically favored
        return 0;
    }
    if (game.in_draw()) return 0;

    moves.sort((a, b) => getMoveScore(b) - getMoveScore(a));

    let maxScore = -Infinity;
    for (let move of moves) {
        game.move(move.san);
        let score = -negaMax(game, depth - 1, -beta, -alpha, -color);
        game.undo();

        if (score > maxScore) maxScore = score;
        if (maxScore > alpha) alpha = maxScore;
        if (alpha >= beta) break; 
    }
    return maxScore;
}

// --- WORKER EVENT LISTENER ---
self.onmessage = function(e) {
    let game = new Chess(e.data.fen);
    let depth = e.data.depth;
    nodes = 0;

    // Check Opening Book first
    if (OPENING_BOOK[game.fen()]) {
        let bookMoveSan = OPENING_BOOK[game.fen()];
        let move = game.moves({ verbose: true }).find(m => m.san === bookMoveSan);
        if (move) {
            self.postMessage({ type: 'done', move: move, nodes: 0, eval: 0 });
            return;
        }
    }

    let moves = game.moves({ verbose: true });
    moves.sort((a, b) => getMoveScore(b) - getMoveScore(a));

    let bestMove = null;
    let bestScore = -Infinity;
    let alpha = -Infinity;
    let beta = Infinity;
    let color = game.turn() === 'w' ? 1 : -1;

    for (let move of moves) {
        game.move(move.san);
        let score = -negaMax(game, depth - 1, -beta, -alpha, -color);
        game.undo();

        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
        if (bestScore > alpha) alpha = bestScore;
    }

    self.postMessage({ 
        type: 'done', 
        move: bestMove, 
        nodes: nodes, 
        eval: bestScore * color // Send absolute evaluation back to UI
    });
};
