import express from "express";
import fs from "fs";
import path from "path";
import repl from "repl";
import { spawn } from "child_process";
import bodyParser from "body-parser";
import util from "util";
import { WebSocketServer } from "ws";
import Amazons from "./public/amazons.js";
const readdir = util.promisify(fs.readdir);

// TODO: room pruning

const isLocal = process.argv[2] === "l";
let __dirname = isLocal ? path.dirname(new URL(import.meta.url).pathname) : "/app";

if(__dirname[0] == "/" && isLocal) {
    __dirname = __dirname.slice(1);
}

console.log("Starting up at: ", __dirname);
const SERVER_TOKEN = Date.now().toString(16);

const HTTP_STATUS = {
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_SERVICE_ERROR: 500,
    NOT_IMPLEMENTED: 501,
};

let app = express();

app.use(express.urlencoded({
    extended: true
}));

const clientDir = __dirname + "/public";

const readBodyData = async function (req, res, next) {
    let body = "";
    req.on("data", (data) => {
        body += data;
    });
    req.on("end", () => {
        next(body, req, res, next);
    });
};

const hours = h => h * 60*60*1000;
const minutes = m => m * 60*1000;
const seconds = s => s * 1000;
const addTime = (date, ms) => {
    date.setTime(date.getTime() + ms);
    return date;
};

const expiryFromNow = () => {
    return addTime(new Date(), hours(36));
};

const Users = {};
const maxInt = 36**10;
const makeNewPool = (obj) => {
    if(Object.keys(obj).length > maxInt) {
        return null;
    }
    let id;
    do {
        id = Math.floor(Math.random() * maxInt)
            .toString(36)
            .padStart(10, "0");
    } while(obj[id]);
    return id;
};

const makeNewUser = () => {
    let id = makeNewPool(Users);
    if(!id) return null;
    Users[id] = {
        expires: expiryFromNow(),
        socket: null,
        room: null,
        state: "menu",
    };
    return id;
};

setInterval(function pruneInactive() {
    console.log("Pruning inactive users...");
    let now = new Date();
    let pruned = 0;
    for(let id of Object.keys(Users)) {
        if(Users[id].expires < now) {
            delete Users[id];
            pruned++;
        }
    }
    if(pruned) {
        console.log("Users after prune: ", Object.keys(Users).length);
        console.log("Users pruned: ", pruned);
    }
}, hours(6));

app.get("/version", function (req, res, next) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
        serverToken: SERVER_TOKEN,
    }));
});

// creates a temporary user
app.post("/newuser", function (req, res, next) {
    console.log("making user");
    res.setHeader("Content-Type", "application/json");
    let id = makeNewUser();
    let response = { serverToken: SERVER_TOKEN };
    response.success = id !== null;
    if(response.success) {
        response.userId = id;
    }
    else {
        // do nothing
    }
    res.end(JSON.stringify(response));
    console.log(Users);
});

app.post("/enduser", function (req, res, next) {
    console.log("ending user");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
        success: true,
    }));
});

const Rooms = {};
const makeNewRoomId = () => {
    return makeNewPool(Rooms);
}
app.get("/rooms", function (req, res, next) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
        rooms: Rooms
    }));
});

app.use(express.static(
    clientDir,
    { extensions: ["html", "css", "js"] }
));

const sendJSON = (socket, json) => socket.send(JSON.stringify(json));
const update = (socket, action, extra={}) => sendJSON(socket, {
    type: "update",
    action,
    ...extra
});
const error = (socket, message, extra={}) => sendJSON(socket, {
    type: "error",
    message,
    ...extra
});
const updateRooms = socket => update(socket, "rooms");

const startGameForPlayer = pid => {
    let user = Users[pid];
    let room = Rooms[user.room];
    console.log("hooking up player", pid);
    console.log("User's room:", user.room);
    user.state = "playing";
    update(user.socket, "playing", {
        config: room.config,
        player: room.players.indexOf(pid),
    });
    // TODO: condense into a single message
    for(let move of room.history) {
        update(user.socket, "move", move);
    }
};

const startGame = roomId => {
    const { Configs, Board } = Amazons;
    let room = Rooms[roomId];
    let { width, state } = Configs[room.config]();
    room.board = Board.ofWidth(width, state);
    room.board.silent = true;
    for(let pid of room.players) {
        startGameForPlayer(pid);
    }
};

// websocket
const wss = new WebSocketServer({ noServer: true });
const sockets = [];

const leaveRoom = userId => {
    let oldRoomId = Users[userId].room;
    let oldRoom = Rooms[oldRoomId];
    oldRoom.players.splice(oldRoom.players.indexOf(userId), 1);
    Users[userId].room = null;
    if(oldRoom.playing) {
        oldRoom.playing = false;
        sendChatMessage(`The game is over, user ${userId} disconnected.`, 0, oldRoomId);
    }
};

// returns true if we need to update the room view
const joinGame = (socket, userId, roomId) => {
    if(Rooms[roomId].status == "Closed") {
        // TODO: spectate
        return false;
    }
    else if(Users[userId].room == roomId) {
        // no need to do anything if you're joining the same room
        return false;
    }
    else if(Rooms[roomId].players.length < 2) {
        if(Users[userId].room) {
            leaveRoom(userId);
        }
        Users[userId].room = roomId;
        Rooms[roomId].players.push(userId);

        if(Rooms[roomId].players.length == 2) {
            Rooms[roomId].status = "Closed";
            startGame(roomId);
        }

        return true;
    }
    else {
        error(socket, "Room is full.");
        return false;
    }
};

const sendChatMessage = (content, userId, roomId) => {
    // TODO: global messages
    let message = `${userId}: ${content}`;
    roomId ??= Users[userId].room;
    let room = Rooms[roomId];
    room.chatlog.push(message);
    for(let pid of room.players) {
        // if(pid === userId) continue;
        let user = Users[pid];
        update(user.socket, "chat", {
            content: message,
            author: userId,
        });
    }
};

// TODO: localization?
wss.on("connection", socket => {
    console.log("new socket");
    sockets.push(socket);
    // i mean. on the one hand i'm not doing any serious checks
    // but it also doesn't need to be secure. so whatever
    let data = {
        userId: null,
        getUser() {
            return Users[this.userId];
        },
    };
    socket.on("message", rawJson => {
        let json = JSON.parse(rawJson);
        let { type, userId, serverToken } = json;
        // reject if serverToken is incorrect
        if(serverToken !== SERVER_TOKEN) {
            error(socket, "The server has restarted, please refresh", {
                action: "refresh"
            });
            return;
        }
        // reject if userId isn't communicating on the right channel
        if(type !== "sync" && data.userId !== userId) {
            error(socket, "Incongruent user IDs", {
                action: "refresh"
            });
            return;
        }

        let response, user;
        console.table(json);
        switch(type) {
            case "sync":
                user = Users[userId];
                if(user.socket) {
                    // if the user opens a new socket, kill the old one
                    error(user.socket, "New socket opened, closing old one", {
                        action: "crash"
                    });
                    user.socket.close();
                }
                data.userId = userId;
                user.socket = socket;
                console.log("synced with user", userId);
                // escort them to the appropriate state
                if(user.state === "playing") {
                    startGameForPlayer(userId);
                }
                break;

            case "join-game":
                // json.roomId
                if(joinGame(socket, userId, json.roomId)) {
                    sockets.forEach(updateRooms);
                }
                break;

            case "leave-game":
                if(json.roomId !== Users[userId].room) {
                    error(socket, "Cannot leave a room you are not in");
                }
                else {
                    leaveRoom(userId);
                    sockets.forEach(updateRooms);
                }
                break;

            case "spectate-game":
                error(socket, "Spectation is not currently implemented.");
                // sockets.forEach(updateRooms);
                break;

            case "make-game":
                // validate room
                if(!Amazons.Configs.hasOwnProperty(json.config)) {
                    error(socket, "Invalid config: " + json.config);
                    break;
                }
                // make room
                console.log("making room");
                let id = makeNewRoomId();
                Rooms[id] = {
                    id: id,
                    name: json.name,
                    players: [],
                    config: json.config,
                    status: "Open",
                    timestamp: Date.now(),
                    board: null,
                    history: [],
                    chatlog: [],
                    playing: true,
                };
                // join the player to that room
                joinGame(socket, userId, id);
                // update everyone's view of the rooms
                sockets.forEach(updateRooms);
                break;

            case "send-message":
                console.log("chat message to send:", json.userId, ":", json.content);
                sendChatMessage(json.content, userId);
                break;

            case "move":
                // update the player(s) who did not send the update
                console.log("update move:");
                console.table(json);
                let roomId = Users[json.userId].room;
                let room = Rooms[roomId];
                for(let userId of room.players) {
                    if(userId === json.userId) continue;
                    let user = Users[userId];
                    // TODO: verify label move
                    console.log("Sending move to ", userId);
                    console.log("Has socket?", !!user.socket);
                    update(user.socket, "move", json.data);
                    // TODO: update spectators
                }
                // update our board as well
                room.history.push(json.data);
                room.board.receiveUpdate(json.data);

                if(room.board.gameOverTest()) {
                    sendChatMessage("The game is over.", 0, roomId);
                }

                break;

            default:
                response = {
                    type: "error",
                    message: `Could not parse input request type ${type}.`
                };
                break;
        }
        if(response && response?.type !== "error") {
            data.getUser().expires = expiryFromNow();
        }
        if(response) {
            sendJSON(socket, response);
        }
    });
    socket.on("close", () => {
        console.log("socket closed");
        sockets.splice(sockets.indexOf(socket), 1);
    });
});



const PORT = process.env.PORT || 8080;
let server = app.listen(PORT, () => {
    console.log(server.address());
    let { address, port } = server.address();
    console.log("Listening at http://%s:%s", address, port);
});
server.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, socket => {
        wss.emit("connection", socket, request);
    });
});
