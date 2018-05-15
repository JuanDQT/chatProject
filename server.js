var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

var socketIDS = [];
var clients = [];

var all = new Object();

io.on('connection', function (socket) {

    // ALguien se ha conectado
    console.log("Bienvenido de nuevo");
    // socketIDS.push(socket.id);
    clients.push(socket.id);
    socket.on('login', function (msg) {

        var data = JSON.parse(msg);
// TODO: revisar porque no gaurda y envia a este socket
        all[data['clientID']] = data['socketID'];
        // clients.push(socket.id);

        console.log("ClientID: " + data['clientID']);
        console.log("SocketID: " + data['socketID']);
        console.log("Message es: ");
        console.log(msg);
        setTimeout(function () {
            //do what you need here
            socket.emit('home',
                {
                    data: "Mensaje de bienvenida: " + msg
                }
            );
        }, 1000);

    });

    socket.on('MESSAGE_TO', function (msg) {
        var socketIDTO = all[msg['to']];
        console.log("Tenemos que enviar un mensaje a: " + all[msg['to']]);

        io.sockets.to(socketIDTO).emit("GET_SINGLE_MESSAGE", msg['message']);
        // clients[socketIDTO].emit("GET_SINGLE_MESSAGE", msg['message']);

        // io.sockets.connected[clients[0]].emit("GET_SINGLE_MESSAGE", msg);

    });


    // Automatico
    socket.on('disconnect', function () {
        console.log('user disconnected');
    });
});

http.listen(port, function () {
    console.log('listening on *:' + port);
});