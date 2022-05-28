// const Amazons = require("./amazons.js");
import express from "express";
import fs from "fs";
import path from "path";
import repl from "repl";
import { spawn } from "child_process";
import bodyParser from "body-parser";
import util from "util";
import { WebSocketServer } from "ws";
const readdir = util.promisify(fs.readdir);


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

// app.get("/domains", function (req, res, next) {
    // res.setHeader("Content-Type", "application/json");
    // res.end(JSON.stringify({
        // domains: DOMAIN_INFORMATION,
    // }));
// });

app.use(express.static(
    clientDir,
    { extensions: ["html", "css", "js"] }
));

const sendJSON = (socket, json) => socket.send(JSON.stringify(json));
const update = (socket, action) => sendJSON(socket, {
    type: "update",
    action
})
const updateRooms = socket => update(socket, "rooms");

const startGame = roomId => {
    let room = Rooms[roomId];
    for(let pid of room.players) {
        let user = Users[pid];
        console.log("hooking up player", pid);
        update(user.socket, "playing");
    }
};

// websocket
const wss = new WebSocketServer({ noServer: true });
const sockets = [];
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
            sendJSON(socket, {
                type: "error",
                action: "refresh",
                message: "The server has restarted, please refresh",
            });
            return;
        }
        // reject if userId isn't communicating on the right channel
        if(type !== "sync" && data.userId !== userId) {
            sendJSON(socket, {
                type: "error",
                action: "refresh",
                message: "Incongruent user IDs",
            });
            return;
        }

        let response;
        switch(type) {
            case "sync":
                data.userId = userId;
                Users[userId].socket = socket;
                console.log("synced with user", userId);
                break;
            case "join-game":
                // json.roomId
                console.log("User", userId, "is joining", json.roomId);
                console.log(Rooms[json.roomId].players.length);
                if(Rooms[json.roomId].status == "Closed") {
                    // todo: spectate
                }
                else if(Rooms[json.roomId].players.length < 2) {
                    if(Users[userId].room) {
                        let oldRoom = Rooms[Users[userId].room];
                        oldRoom.players.splice(oldRoom.players.indexOf(userId), 1);
                    }
                    Users[userId].room = json.roomId;
                    Rooms[json.roomId].players.push(userId);

                    if(Rooms[json.roomId].players.length == 2) {
                        Rooms[json.roomId].status = "Closed";
                        startGame(json.roomId);
                    }

                    sockets.forEach(updateRooms);
                }
                else {
                    sendJSON(socket, {
                        type: "error",
                        message: "Room is full.",
                    });
                }
                break;
            case "make-game":
                console.log("making room");
                let id = makeNewRoomId();
                Rooms[id] = {
                    id: id,
                    name: json.name,
                    players: [],
                    config: json.config,
                    status: "Open",
                    timestamp: Date.now(),
                };
                sockets.forEach(updateRooms);
                break;
            default:
                response = {
                    type: "error",
                    message: `Could not parse input request type ${type}.`
                };
                break;
        }
        if(response?.type !== "error") {
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
