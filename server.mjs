// const Amazons = require("./amazons.js");
import express from "express";
import fs from "fs";
import path from "path";
import repl from "repl";
import { spawn } from "child_process";
import bodyParser from "body-parser";
import util from "util";
const readdir = util.promisify(fs.readdir);

const scratch = {}; // used for shell interaction

const isLocal = process.argv[2] === "l";
let __dirname = isLocal ? path.dirname(new URL(import.meta.url).pathname) : "/app";

if(__dirname[0] == '/' && isLocal) {
    __dirname = __dirname.slice(1);
}

console.log("Starting up at: ", __dirname);

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

const PORT = process.env.PORT || 8080;
let server = app.listen(PORT, () => {
    console.log(server.address());
    let { address, port } = server.address();
    console.log("Listening at http://%s:%s", address, port);
});
