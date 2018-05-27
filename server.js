var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;
var mysql = require('mysql');

var db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root",
    database: "Chat"
});

db.connect(function(err) {
    if (err) throw err;
    console.log("Connected!");
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

        // if (!(data['clientID'] in all)) {
            console.log("[LOGIN]", JSON.stringify(msg));
            all[data['clientID']] = data['socketID'];
            db.query('UPDATE Users set online = 1 where code = (?)', data['clientID']);
        // }

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
        io.sockets.to(socketIDTO).emit("GET_SINGLE_MESSAGE", data);

    });

    socket.on('CLIENT_SET_LAST_SEEN', function (msg) {

        var data = JSON.parse(JSON.stringify(msg));
        console.log("[CLIENT_SET_LAST_SEEN]: " + JSON.stringify(msg));
        // Notificar a todos que el esta offline y guardarlo en bbdd
        if (data['LAST_SEEN']) {
            db.query('UPDATE Users set last_seen = null where code = (?)', data['FROM']);

        } else {
            db.query('UPDATE Users set last_seen = now() where code = (?)', data['FROM']);
        }

    });


    // Automatico
    socket.on('disconnect', function () {

        var clientID = Object.keys(all).find(key => all[key] === socket.id);
        console.log('socket disconnected: ' + clientID);
        db.query('UPDATE Users set online = 0 where code = (?)', clientID);
        delete all[clientID];
        console.log("Total in: " + Object.keys(all).length);

        //db.query('UPDATE Users set online = 1 where code = (?)', data['clientID']);
    });
});

http.listen(port, function () {
    console.log('listening on *:' + port);
});