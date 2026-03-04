/**
 * worker.js
 * The Chess Engine Brain.
 * Uses NegaMax, Alpha-Beta Pruning, Quiescence Search, and Tapered Evaluation.
 * Runs in a Web Worker background thread to prevent the UI from freezing during deep calculation.
 */

// Import chess.js to handle move generation inside the worker
importScripts('https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js');

// --- 1. EVALUATION WEIGHTS ---
// Standard material values (Centipawns)
const pieceValues = { 'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000 };
// Used to calculate game phase (Middle Game vs End Game)
const phaseValues = { 'n': 1, 'b': 1, 'r': 2, 'q': 4 };

// Piece-Square Tables (PST)
// Encourages pieces to occupy mathematically superior squares.
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
 * Static Evaluation: Calculates the mathematical advantage of the board.
 * Optimized heavily by parsing the FEN string rather than invoking game.board().
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
            
            // Mirror table indexes for Black
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

    // Tapered evaluation (dynamically shifts between Middle Game and End Game behaviors)
    phase = Math.min(24, phase);
    let mg_weight = phase / 24;
    let eg_weight = 1 - mg_weight;
    return (mg_score * mg_weight) + (eg_score * eg_weight);
}

/**
 * Move Ordering: Evaluates captures first (MVV-LVA: Most Valuable Victim - Least Valuable Attacker)
 * This exponentially increases the efficiency of Alpha-Beta pruning.
 */
function getMoveScore(move) {
    let score = 0;
    if (move.captured) {
        score = 10 * pieceValues[move.captured] - pieceValues[move.piece];
    }
    if (move.flags.includes('p')) score += 900; // Promotions heavily prioritized
    return score;
}

/**
 * Quiescence Search:
 * Prevents the "Horizon Effect" by continuing to search active capture sequences 
 * even after the depth limit is reached, ensuring the engine doesn't blunder pieces.
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
 * NegaMax Algorithm with Alpha-Beta Pruning:
 * Recursively builds a tree of all possible moves, assuming the opponent will play optimally.
 */
function negaMax(game, depth, alpha, beta, color) {
    nodes++;
    if (nodes % 50000 === 0) self.postMessage({ type: 'progress', nodes: nodes });

    if (depth === 0) return quiesce(game, alpha, beta, color);

    let moves = game.moves({ verbose: true });
    
    // Terminal Nodes (Checkmate or Draw)
    if (moves.length === 0) {
        if (game.in_check()) return -30000 + game.history().length; 
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
        if (alpha >= beta) break; // Prune branch
    }
    return maxScore;
}

// --- WORKER MESSAGE LISTENER ---
self.onmessage = function(e) {
    let game = new Chess(e.data.fen);
    let depth = e.data.depth;
    nodes = 0;

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
        eval: bestScore * color 
    });
};
