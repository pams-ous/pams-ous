/* 
To initialize:
npm init -y

To install the required modules:
npm i argon2 mysql2 socket.io express

To install nodemon (watcher):
npm i -D nodemon

To run all the APIs created for PAMS:
npx nodemon login.js
(NOTE: login.js is the starting nodejs file, where the server for socket.io is made, and where it connects to port of the process environment or port 3000, along with the rest of the created PAMS APIs)
*/

const http = require('http');
const argon2 = require('argon2');
const mysql = require('mysql2/promise');
const { Server } = require('socket.io');
const express = require('express');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "http://127.0.0.1:5500",
        methods: ["GET", "POST"]
    }
});

const db = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'hillsazucena#17',
    database: 'people'
});

async function handle_login(socket, data) {
    const email = data.email;
    const rawPw = data.password;

    if (rawPw.trim().length <= 0 || !rawPw) {
        return socket.emit('login_backendLog', { success: false, rawData: `Enter the password!`});
    }

    const query = 
    `SELECT password FROM employees WHERE email = ? LIMIT 1;`;

    try {
        const [records] = await db.query(query, [email]);
        if (records && records.length > 0) {
            const hashedPw = records[0].password;

            const {verify_pass} = require("./passwordUtil");
            let validPw = await verify_pass(rawPw, hashedPw);
            const {getEmployeeDetails} = require("./dbChecks");
            const result = await getEmployeeDetails(db, data.email);
            const [firstName, middleName, lastName, suffix] = [result?.first_name, result?.middle_name, result?.last_name, result?.suffix];
            const empName = firstName.concat(" ", middleName, " ", lastName, " ", suffix);

            socket.emit('login_backendLog', {
                success: validPw, 
                rawData: `Email: ${email}\nValid: ${validPw}\n`,
                empName: empName,
                email: email
            });
            console.log(`validPw`);
        } else {
            socket.emit('login_backendLog', {
                success: false, 
                rawData: `Account not found!`
            });
        }
    } catch (err) {
        socket.emit('login_backendLog', {success: false, rawData: `${err}`});
    }
}

// basically the main method idk
io.on('connection', (socket) => {
    console.log(`Connected!`);

    socket.on('sendAccDetails', async (data) => {
        handle_login(socket, data);
    });

});

const {searchAPI} = require("./userSearch");
const {regiUserAPI} = require("./registration");
const {manageAccountAPI} = require("./manage");
const { stringify } = require('querystring');

searchAPI(io, db);
regiUserAPI(io, db);
manageAccountAPI(io, db);

const PORT = process.env.port || 3000;
server.listen(PORT, () => console.log(`Server connected at port ${PORT}`));