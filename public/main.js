const fetchJSON = (...args) =>
    fetch(...args).then(dat => dat.json());

const post = (url, data) =>
    fetch(url, {
        method: "POST",
        mode: "cors",
        cache: "no-cache",
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
        },
        redirect: "follow",
        referrerPolicy: "no-referrer",
        body: JSON.stringify(data)
    });

const postJSON = (...args) =>
    post(...args).then(dat => dat.json());

const clearChildren = el => {
    while(el.firstChild) {
        el.removeChild(el.firstChild);
    }
};

const makeElement = (tag, child=null) => {
    let el = document.createElement(tag);
    if(typeof child !== "object") {
        child = document.createTextNode(child.toString());
    }
    if(child) {
        el.appendChild(child);
    }
    return el;
};

class SocketWrapper {
    constructor(data) {
        this.userData = data;
        this.socket = null;
    }

    connect(attemptsLeft=3) {
        if(attemptsLeft === 0) {
            this.crash("Could not reconnect after 3 tries.");
            return;
        }
        this.socket = new WebSocket("ws://localhost:8080");
        // Connection opened
        this.socket.addEventListener("open", (event) => {
            this.socket.send(JSON.stringify({
                type: "sync",
                serverToken: this.userData.serverToken,
                userId: this.userData.userId,
            }));
        });
        // Listen for messages
        this.socket.addEventListener("message", (event) => {
            let json = JSON.parse(event.data);
            switch(json.type) {
                case "error":
                    alert("ERROR: " + json.message);
                    break;
            }
        });
        this.socket.addEventListener("close", async (event) => {
            // test to see if the server is alive
            try {
                let { serverToken: actualToken } = await fetchJSON("/version");
                // let's try and reconnect
                this.connect(attemptsLeft - 1);
            }
            catch(e) {
                this.crash("The server is down. Please try again later.");
            }
        });
    }

    crash(message) {
        document.body.textContent = "";
        alert(message);
    }
}

const LOCAL_STORAGE_KEY = "AmazonsGameCOBFOXX";
window.addEventListener("load", async function () {
    // sync version information
    if(!localStorage[LOCAL_STORAGE_KEY]) {
        localStorage[LOCAL_STORAGE_KEY] = "{}";
    }
    let userData = JSON.parse(localStorage[LOCAL_STORAGE_KEY]);

    if(userData.serverToken) {
        let { serverToken: actualToken } = await fetchJSON("/version");
        if(userData.serverToken != actualToken) {
            // the old information is no good, erase it
            userData = {};
        }
    }
    let newData = userData.serverToken ? userData : await postJSON("/newuser");
    userData.serverToken = newData.serverToken;
    userData.userId = newData.userId;
    localStorage[LOCAL_STORAGE_KEY] = JSON.stringify(userData);

    let socket = new SocketWrapper(userData);
    socket.connect();

    window.addEventListener("beforeunload", function () {
        // postJSON("/enduser", userData);
        // LOCAL_STORAGE_KEY
    });

    const checkRooms = document.getElementById("checkRooms");
    const roomList = document.getElementById("roomList");

    checkRooms.addEventListener("click", async function () {
        let { rooms } = await fetchJSON("/rooms");

        clearChildren(roomList);
        for(let { id, name, owner, config, timestamp } of rooms) {
            let tr = document.createElement("tr");
            let button = makeElement("button", "join");
            button.addEventListener("click", function () {

            })
            tr.appendChild(makeElement("td", button));
            tr.appendChild(makeElement("td", name));
            tr.appendChild(makeElement("td", owner));
            tr.appendChild(makeElement("td", config));
            tr.appendChild(makeElement("td", timestamp));
            roomList.appendChild(tr);
        }
    });

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
