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

const crash = message => {
    document.body.textContent = "";
    alert(message);
};

let switchPlaying, initializeBoard, updateBoard;
class SocketWrapper {
    constructor(data) {
        this.userData = data;
        this.socket = null;
        this.crashed = false;
    }

    sendJSON(json) {
        this.send(JSON.stringify({
            ...this.userData,
            ...json,
        }));
    }

    send(data) {
        this.socket.send(data);
    }

    connect(attemptsLeft=3) {
        // don't attempt to connect if we are crashed
        if(this.crashed) return;
        if(attemptsLeft === 0) {
            crash("Could not reconnect after 3 tries.");
            return;
        }
        this.socket = new WebSocket("ws://localhost:8080");
        // Connection opened
        this.socket.addEventListener("open", (event) => {
            this.sendJSON({
                type: "sync"
            });
        });
        // Listen for messages
        this.socket.addEventListener("message", (event) => {
            let json = JSON.parse(event.data);
            // console.log("received json message");
            // console.table(json);
            switch(json.type) {
                case "error":
                    if(json.action === "crash") {
                        this.crashed = true;
                        crash("FATAL ERROR: " + json.message);
                    }
                    else {
                        alert("ERROR: " + json.message);
                    }
                    break;
                case "update":
                    switch(json.action) {
                        case "rooms":
                            checkRooms(userData.userId);
                            break;
                        case "playing":
                            switchPlaying();
                            console.log("json received");
                            console.table(json);
                            initializeBoard(json.config, json.player);
                            // updateBoard(json.data);
                            break;
                        case "move":
                            console.log("received move update info");
                            console.table(json);
                            updateBoard(json);
                            break;
                        case "chat":
                            let chatlog = document.getElementById("chat-log");
                            chatlog.value += json.content + "\n";
                            chatlog.scrollTop = chatlog.scrollHeight;
                            break;
                        default:
                            console.log("unknown update action", json.action);
                            break;
                    }
                    break;
            }
            if(json.action === "refresh") {
                window.location.reload();
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
                crash("The server is down. Please try again later.");
            }
        });
    }
}

let socket, userData;
const checkRooms = async function (userId) {
    let { rooms } = await fetchJSON("/rooms");

    clearChildren(roomList);
    for(let { id, status, name, players, config, timestamp } of Object.values(rooms)) {
        let tr = document.createElement("tr");
        let action = players.includes(userId)
            ? "leave"
            : status == "Closed"
                 ? "spectate"
                 : "join"
        let button = makeElement("button", action);
        button.addEventListener("click", function () {
            if(action !== "leave") {
                userData.roomId = id;
            }
            socket.sendJSON({
                type: `${action}-game`,
                roomId: id,
                userId: userData.userId,
                serverToken: userData.serverToken,
            });
        });
        tr.appendChild(makeElement("td", button));
        tr.appendChild(makeElement("td", status));
        tr.appendChild(makeElement("td", name));
        let ol = makeElement("ol");
        let li1 = makeElement("li", players[0] ?? "none");
        let li2 = makeElement("li", players[1] ?? "none");
        ol.appendChild(li1);
        ol.appendChild(li2);
        tr.appendChild(makeElement("td", ol));
        tr.appendChild(makeElement("td", config));
        tr.appendChild(makeElement("td", timestamp));
        roomList.appendChild(tr);
    }
}

const ADJECTIVES = "PURPLE ROUGH NEAT UNTIMELY SQUARE FURIOUS SKITTISH DIM INFINITE LOUD PERFECT QUESTIONING".split(" ");
const NOUNS = "SPAGHETTI CAVES QUESTION THERMOMETER CARD JESTER PLAN EYES CHART NIGHTS BOXES LAPTOP MUG".split(" ");
const randomEnglish = () =>
    sample(ADJECTIVES) + " " + sample(NOUNS);

const LOCAL_STORAGE_KEY = "AmazonsGameCOBFOXX";
window.addEventListener("load", async function () {
    // state information
    let board;

    const checkRoomsButton = document.getElementById("checkRooms");
    const roomList = document.getElementById("roomList");
    const userIdElement = document.getElementById("userId");
    const newGameButton = document.getElementById("newGame");
    const nicknameInput = document.getElementById("nickname");
    nicknameInput.placeholder = randomEnglish();

    const stateMenuDisplay = document.getElementById("state-menu");
    const statePlayingDisplay = document.getElementById("state-playing");

    ///// connect to server /////
    // sync version information
    if(!localStorage[LOCAL_STORAGE_KEY]) {
        localStorage[LOCAL_STORAGE_KEY] = "{}";
    }
    userData = JSON.parse(localStorage[LOCAL_STORAGE_KEY]);

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
    userIdElement.textContent = userData.userId;
    localStorage[LOCAL_STORAGE_KEY] = JSON.stringify(userData);

    socket = new SocketWrapper(userData);
    socket.connect();

    window.addEventListener("beforeunload", function () {
        // postJSON("/enduser", userData);
        // LOCAL_STORAGE_KEY
    });

    // dom stuff
    checkRoomsButton.addEventListener("click", () => checkRooms(userData.userId));
    checkRooms(userData.userId);

    switchPlaying = () => {
        stateMenuDisplay.style.display = "none";
        statePlayingDisplay.style.display = "block";
    };
    switchMenu = () => {
        stateMenuDisplay.style.display = "block";
        statePlayingDisplay.style.display = "none";
    };
    initializeBoard = (config, perspective) => {
        let { width, state } = Configs[config]()
        board = Board.ofWidth(width, state);
        board.setPerspective(perspective);
        board.initialize(game, info);
        board.render();
        board.setSocket(socket);
        document.getElementById("chat-log").value = "";
    };
    updateBoard = (json) => {
        board.receiveUpdate(json);
    };

    const configSelect = document.getElementById("config");
    const roomName = document.getElementById("roomname");
    roomName.placeholder = randomEnglish();
    newGameButton.addEventListener("click", async function () {
        socket.sendJSON({
            type: "make-game",
            name: "Test",
            config: configSelect.value,
            userId: userData.userId,
            serverToken: userData.serverToken,
        });
    });

    let game = document.getElementById("game");
    let info = document.getElementById("info");

    let leaveButton = document.getElementById("leave");
    leaveButton.addEventListener("click", function () {
        socket.sendJSON({
            type: "leave-game",
            roomId: userData.roomId,
            userId: userData.userId,
            serverToken: userData.serverToken,
        });
        switchMenu();
    });
    let chatInput = document.getElementById("chat-input");
    let chatSendButton = document.getElementById("chat-send-message");
    let sendChatMessage = () => {
        socket.sendJSON({
            type: "send-message",
            content: chatInput.value,
            userId: userData.userId,
            serverToken: userData.serverToken,
        });
        chatInput.value = "";
    };
    chatInput.addEventListener("keydown", (ev) => {
        if(ev.key === "Enter") {
            sendChatMessage();
        }
    });
    chatSendButton.addEventListener("click", sendChatMessage);

    // outdated
    if(false) {
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
    }
});
