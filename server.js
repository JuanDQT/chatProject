var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;
var mysql = require('mysql');

var db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root",
    database: "Chat",
    dateStrings: 'date'
});

db.connect(function (err) {
    if (err) throw err;
    console.log("Database Connected!");
});

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

var all = new Object();

io.on('connection', function (socket) {

    // ALguien se ha conectado
    //console.log("Bienvenido de nuevo");
    //clients.push(socket.id);


    socket.on('LOGIN', function (msg) {

        var data = JSON.parse(JSON.stringify(msg));

        console.log("[LOGIN]", JSON.stringify(msg));
        all[data['clientID']] = data['socketID'];
        db.query('UPDATE Users set online = 1 where id = (?)', parseInt(data['clientID']));

        db.query("SELECT id_pda, id_user_from as 'from', id_user_to as 'to', message, fecha_envio as date_created FROM Messages where fecha_recepcion is null and id_user_to = (?)", data['clientID'], function (err, result, fields) {
            if (err) throw err;
            console.log(JSON.stringify(result));

            io.sockets.to(data['socketID']).emit("GET_PENDING_MESSAGES", JSON.parse(JSON.stringify(result)));
        });

        console.log("Total in: " + Object.keys(all).length);

    });


    socket.on('USER_IS_TYPING', function (msg) {

        var data = JSON.parse(JSON.stringify(msg));
        console.log("[USER_IS_TYPING]: " + JSON.stringify(msg));

        var socketIDTO = all[data['to']];

        io.sockets.to(socketIDTO).emit("GET_USER_IS_TYPING", data);

    });

    socket.on('MESSAGE_TO', function (msg) {

        var data = JSON.parse(JSON.stringify(msg));
        console.log("[MESSAGE_TO]: " + JSON.stringify(msg));
        var socketIDTO = all[data['to']];

        db.query('INSERT INTO Messages(id_pda, id_user_from, id_user_to, message, fecha_envio, fecha_recepcion_servidor) VALUES (?, ?, ?, ?, ?, NOW())', [data['id_pda'], data['from'], data['to'], data['message'], data['date_created']], function (err, result, fields) {
            if (err)
                throw err;
            else {
                io.sockets.to(all[data['from']]).emit("GET_CONFIRM_MESSAGE_SENT", {"id_pda": data['id_pda'], "id_server": result.insertId});
                console.log("***ID insertado: " + result.insertId);
                io.sockets.to(socketIDTO).emit("GET_SINGLE_MESSAGE", data);
            }
        });
    });

    socket.on('CLIENT_SET_LAST_SEEN', function (msg) {
        var data = JSON.parse(JSON.stringify(msg));
        console.log("[CLIENT_SET_LAST_SEEN]: " + JSON.stringify(msg));
        if (data['LAST_SEEN']) {
            db.query('UPDATE Users set last_seen = null where code = (?)', data['FROM']);

        } else {
            db.query('UPDATE Users set last_seen = now() where code = (?)', data['FROM']);
        }
    });

    socket.on('ALL_CHATS_AVAILABLE', function (msg) {
        var data = JSON.parse(JSON.stringify(msg));
        console.log("[ALL_CHATS_AVAILABLE]: " + JSON.stringify(msg));

        db.query("SELECT id, name, avatar, online, last_seen, banned FROM Users where id != (?)", data['FROM'], function (err, result, fields) {
            if (err) throw err;
            console.log(JSON.stringify(result));

            io.sockets.to(all[data['FROM']]).emit("GET_ALL_CHATS_AVAILABLE", JSON.parse(JSON.stringify(result)));
        });

    });



    // Automatico
    socket.on('disconnect', function () {

        var clientID = Object.keys(all).find(key => all[key] === socket.id);

        if (clientID != undefined) {
            console.log('socket disconnected: ' + clientID);
            db.query('UPDATE Users set online = 0 where code = (?)', clientID);
            delete all[clientID];
            console.log("Total in: " + Object.keys(all).length);
        }
    });
});

http.listen(port, function () {
    console.log('listening on *:' + port);
});