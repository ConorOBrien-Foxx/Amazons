window.addEventListener("load", function () {
    let game = document.getElementById("game");
    let info = document.getElementById("info");
    
    let { grid, config } = (function () {
        let config = [
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
        ];
                
        let grid = [];
        for(let i = 0; i < 10; i++) {
            grid.push([]);
            for(let j = 0; j < 10; j++) {
                grid.at(-1).push((i + j + 1) % 2);
                // grid.at(-1).push(Math.random() < 0.1 ? 2 : (i + j + 1) % 2);
            }
        }
        return { grid, config };
    })();
    
    let board = new Board(grid, config);
    board.initialize(game, info);
    board.render();
    // board.silent = true;
    
    
    let randomMove = document.getElementById("randomMove");
    randomMove.addEventListener("click", function () {
        board.randomMove();
    });
    
    let reset = document.getElementById("reset");
    reset.addEventListener("click", function () {
        board.reset();
        board.render();
    });
    
    let randomGame = document.getElementById("randomGame");
    randomGame.addEventListener("click", function () {
        console.log(board.runRandom());
    });
});
