let random = (min, max) =>
    max === undefined
        ? random(0, min)
        : Math.floor(Math.random() * (max - min) + min);

let sample = (arr) => arr[random(arr.length)];

// fisher yates in-place
const shuffleInPlace = (arr) => {
    for(let i = arr.length - 1; i > 1; i--) {
        let j = random(0, i);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

const notice = function (content) {
    if(!this.message) {
        this.message = document.getElementById("message");
    }
    this.message.textContent = content;
};

class Piece {
    constructor(color, i, j) {
        this.color = color;
        this.i = i;
        this.j = j;
    }

    clone() {
        return new this.constructor(this.color, this.i, this.j);
    }

    *validMoves() {
        return;
    }

    *captureMoves(cellOpen) {
        yield* this.validMoves(cellOpen);
    }

    *captureEffect(i, j) {
        yield [i, j];
    }
}

const pointsInDirection = function* ({i, j}, [di, dj], max = Infinity) {
    for(let count = 0; count < max; count++) {
        i += di;
        j += dj;
        yield [ i, j ];
    }
}

const AmazonDeltas = [
    [-1,  1],
    [-1,  0],
    [-1, -1],
    [0,   1],
    [0,  -1],
    [1,   1],
    [1,   0],
    [1,  -1],
];
class Amazon extends Piece {
    *validMoves(cellOpen) {
        for(let dir of AmazonDeltas) {
            for(let [ ci, cj ] of pointsInDirection(this, dir)) {
                if(cellOpen(ci, cj)) {
                    yield [ci, cj];
                }
                else {
                    break;
                }
            }
        }
    }

    // white uses uppercase, black uses lowercase
    getSymbol(unicode=true) {
        return [
            ["a", "♛"],
            ["A", "♕"],
        ][this.color][+unicode];
    }
}

const SteedDeltas = [
    [2,   1],
    [2,  -1],
    [-2,  1],
    [-2, -1],
    [1,   2],
    [-1,  2],
    [-1, -2],
    [1,  -2],
];
class Steed extends Piece {
    *validMoves(cellOpen) {
        let { i, j } = this;
        for(let [ di, dj ] of SteedDeltas) {
            let [ ci, cj ] = [ i, j ];
            ci += di;
            cj += dj;
            if(cellOpen(ci, cj)) {
                yield [ci, cj];
            }
        }
    }

    getSymbol(unicode=true) {
        return [
            ["s", "♞"],
            ["S", "♘"],
        ][this.color][+unicode];
    }
};

const BomberDeltas = [
    [1, 0],
    [-1, 0],
    [0, -1],
    [0, 1],
];
class Bomber extends Piece {
    *validMoves(cellOpen) {
        for(let dir of BomberDeltas) {
            for(let [ ci, cj ] of pointsInDirection(this, dir, 2)) {
                if(cellOpen(ci, cj)) {
                    let { i, j } = this;
                    this.i = ci;
                    this.j = cj;
                    if(!this.captureMoves(cellOpen).next().done) {
                        yield [ci, cj];
                    }
                    this.i = i;
                    this.j = j;
                }
                else {
                    break;
                }
            }
        }
    }

    *captureMoves(cellOpen) {
        for(let dir of BomberDeltas) {
            let path = [...pointsInDirection(this, dir, 2)];
            let isValid = path.every(([ci, cj]) => cellOpen(ci, cj));
            if(isValid) {
                yield path[0];
            }
        }
    }

    *captureEffect(ci, cj) {
        let di = Math.sign(ci - this.i);
        let dj = Math.sign(cj - this.j);
        yield* pointsInDirection(this, [di, dj], 2);
    }

    getSymbol(unicode=true) {
        return [
            ["b", "♜"],
            ["B", "♖"],
        ][this.color][+unicode];
    }
}

let deepClone = function (arr) {
    if(Array.isArray(arr)) {
        return arr.map(deepClone);
    }
    else if(arr.clone) {
        return arr.clone();
    }
    else {
        return arr;
    }
};

class Board {
    static ofWidth(width, config) {
        let grid = [];
        for(let i = 0; i < width; i++) {
            grid.push([]);
            for(let j = 0; j < width; j++) {
                grid.at(-1).push((i + j + 1) % 2);
            }
        }
        return new Board(grid, config);
    }

    constructor(sourceGrid, config) {
        this.sourceGrid = sourceGrid;
        this.config = config;
        this.elements = [];
        this.reset();
        this.silent = false;
        this.perspective = null;
        this.socket = null;
    }

    reset() {
        this.grid = deepClone(this.sourceGrid);
        this.pieces = deepClone(this.config);
        this.playerCount = 2;
        this.game = null;
        this.focused = null;
        this.firingPiece = null;
        this.firing = false;
        this.highlighted = [];
        this.turn = 1;
        this.playing = true;
    }

    setPerspective(perspective) {
        this.perspective = perspective;
    }

    setSocket(socket) {
        this.socket = socket;
    }

    deliverMessage() {
        if(!this.socket) return;
        this.socket.sendJSON({
            type: "move",
            // TODO: fill this out
        });
    }

    serialize() {

    }

    static getColor(n) {
        return [
            "black",
            "white",
            "burnt-black",
            "burnt-white",
        ][n];
    }

    pieceAt(i, j) {
        // TODO: maybe don't linear search to find a piece
        return this.pieces.find(piece => piece.i === i && piece.j === j);
    }

    validMovesLeft(turnPlayer = this.turnPlayer) {
        let totalMoves = 0;
        for(let piece of this.pieces) {
            if(piece.color === turnPlayer) {
                totalMoves += this.validMoves(piece).length;
            }
        }

        return totalMoves;
    }

    gameOverTest() {
        if(this.validMovesLeft() === 0) {
            if(!this.silent) {
                setTimeout(() => {
                    notice(Board.getColor(this.turnPlayer) + " has lost.");
                }, 50);
            }
            this.playing = false;
        }
    }

    cellOpen(i, j) {
        return (
            !!this.grid[i] &&
            0 <= i && i < this.grid.length &&
            0 <= j && j < this.grid[i].length &&
            this.grid[i][j] !== null &&
            this.grid[i][j] <= 1 &&
            !this.pieceAt(i, j)
        );
    }

    validMoves(piece) {
        return [...piece.validMoves(this.cellOpen.bind(this))];
        /*

        let moves = [];
        let { i, j } = piece;
        for(let dir of directions) {
            let [ di, dj ] = dir;
            let [ ci, cj ] = [ i, j ];
            ci += di;
            cj += dj;
            while(this.cellOpen(ci, cj)) {
                moves.push([ci, cj]);
                ci += di;
                cj += dj;
            }
        }
        return moves;
        */
    }

    captureMoves(piece) {
        return [...piece.captureMoves(this.cellOpen.bind(this))];
    }

    hasMoves(piece) {
        return this.validMoves(piece).length !== 0;
    }

    nextTurn() {
        this.turn++;
        this.gameOverTest();
        // this.turnPlayer = this.turn % this.playerCount;
    }

    get turnPlayer() {
        return this.turn % this.playerCount;
    }

    fireAt(i, j) {
        this.grid[i][j] += 2;
    }

    onPieceClick(i, j) {
        let piece = this.pieceAt(i, j);

        let anyHighlighted = this.highlighted.find(
            ([ti, tj]) => ti === i && tj === j
        );

        if(this.firing) {
            if(this.firingPiece && anyHighlighted) {
                for(let [ ti, tj ] of this.firingPiece.captureEffect(i, j)) {
                    if(this.cellOpen(ti, tj)) {
                        this.fireAt(ti, tj);
                    }
                }
                this.firing = false;
                this.highlighted = [];
                this.nextTurn();
                this.render(game);
            }
        }
        else if(piece && piece.color === this.turnPlayer && this.turnPlayerInteractive) {
            // toggle
            // console.log("TOGGLE", this.focused);
            if(this.focused === piece) {
                this.focused = null;
                this.highlighted = [];
            }
            else if(this.hasMoves(piece)) {
                this.focused = piece;
                this.highlighted = this.validMoves(piece);
                if(this.highlighted.length === 0) {
                    this.focused = null;
                }
            }
            this.render(game);
        }
        else if(anyHighlighted) {
            let [ ti, tj ] = anyHighlighted;
            this.focused.i = ti;
            this.focused.j = tj;
            this.highlighted = this.captureMoves(this.focused);
            let oldFocused = this.focused;
            this.focused = null;
            if(this.highlighted.length) {
                this.firingPiece = oldFocused;
                this.firing = anyHighlighted;
            }
            else {
                this.firing = false;
                this.highlighted = [];
                this.nextTurn();
            }
            this.render(game);
        }
    }

    initialize(game, info) {
        let i = 0;
        this.game = game;
        this.info = info;
        for(let row of this.grid) {
            this.elements[i] = [];
            let j = 0;
            let tr = document.createElement("tr");
            for(let cell of row) {
                let td = document.createElement("td");
                tr.appendChild(td);
                this.elements[i][j] = td;
                td.addEventListener("click", ((i, j) =>
                    ev => this.onPieceClick(i, j)
                )(i, j));
                j++;
            }
            game.appendChild(tr);
            i++;
        }
    }

    cellMap(fn) {
        this.elements.forEach((row, i) => {
            row.forEach((cell, j) => {
                let val = this.grid[i][j];
                fn(cell, val, i, j);
            });
        });
    }

    get turnPlayerInteractive() {
        return this.perspective !== null && this.turnPlayer === this.perspective;
    }

    render() {
        if(this.silent) {
            return;
        }
        // clear old pieces
        this.cellMap((cell, val, i, j) => {
            let color = Board.getColor(val);
            cell.className = `cell-${color}`;
            cell.textContent = "";
            cell.classList.remove("focused");
            cell.classList.remove("valid");
            cell.classList.remove("piece");
        });
        // add new pieces
        for(let piece of this.pieces) {
            // console.log(piece);
            // console.log(this.elements);
            let el = this.elements[piece.i][piece.j];
            el.textContent = piece.getSymbol();
            if(piece.color === this.turnPlayer && this.turnPlayerInteractive) {
                el.classList.add("piece");
                if(!this.firing && this.hasMoves(piece)) {
                    el.classList.add("valid");
                }
            }
        }
        // render valid
        for(let move of this.highlighted) {
            let [ ci, cj ] = move;
            // let col = this.focused;
            // console.log(col);
            let name;
            if(this.firing) {
                name = `valid-firing`;
            }
            else {
                name = `valid`;
            }
            // let col = Board.getColor(this.focused.color);
            this.elements[ci][cj].classList.add(name);
        }

        if(this.focused) {
            this.elements[this.focused.i][this.focused.j].classList.add("focused");
        }

        // information
        // console.log(this.info);
        this.info.querySelector("#turnnumber").textContent = this.turn;
        this.info.querySelector("#turnplayer").textContent = Board.getColor(this.turnPlayer);
    }
}

class BoardSimulation extends Board {
    randomMove() {
        if(this.firing) {
            notice("Cannot do a random move while moving.");
            return;
        }
        if(!this.playing) {
            return;
        }
        let turnPieces = this.pieces
            .filter(piece => piece.color === this.turnPlayer);
        shuffleInPlace(turnPieces);
        // console.log(turnPieces);

        let piece, possibleMoves = [];
        for(piece of turnPieces) {
            possibleMoves = this.validMoves(piece);
            if(possibleMoves.length > 0) break;
        }

        if(possibleMoves.length === 0) {
            notice("No moves available");
            // this.nextTurn();
            // this.render();
            return;
        }

        let move = sample(possibleMoves);

        // console.log(move, piece);

        piece.i = move[0];
        piece.j = move[1];

        // console.log(move, piece);
        // notice("pausing");

        let possibleFires = [...this.captureMoves(piece)];
        shuffleInPlace(possibleFires);

        for(let fire of possibleFires) {
            let fired = false;
            let [i, j] = fire;
            for(let [ ti, tj ] of piece.captureEffect(i, j)) {
                if(this.cellOpen(ti, tj)) {
                    this.fireAt(ti, tj);
                    fired = true;
                }
            }
            if(fired) break;
        }

        this.nextTurn();
        this.render();
    }

    runRandom() {
        while(this.playing) {
            this.randomMove();
        }
        this.turn++;
        let res = {
            turnCount: this.turn,
            victor: Board.getColor(this.turnPlayer)
        };
        this.turn--;
        return res;
    }
}

const Configs = {
    Classic: () => [
        new Amazon(0,  0, 3),
        new Amazon(0,  3, 0),
        new Amazon(0,  0, 6),
        new Amazon(0,  3, 9),

        new Amazon(1,  6, 0),
        new Amazon(1,  9, 3),
        new Amazon(1,  6, 9),
        new Amazon(1,  9, 6),
    ],
    Advanced: () => [
        new Steed (0,  2, 2),
        new Steed (0,  2, 7),

        new Amazon(0,  0, 3),
        new Amazon(0,  3, 0),
        new Amazon(0,  0, 6),
        new Amazon(0,  3, 9),

        new Bomber(0, 4, 4),
        new Bomber(0, 4, 5),
        new Bomber(1, 5, 4),
        new Bomber(1, 5, 5),

        new Amazon(1,  6, 0),
        new Amazon(1,  9, 3),
        new Amazon(1,  6, 9),
        new Amazon(1,  9, 6),

        new Steed (1,  7, 2),
        new Steed (1,  7, 7),
    ],
};

if(typeof module !== "undefined") {
    module.exports = {
        Piece, Amazon, Steed, Bomber, Board,
        Configs
    };
}
