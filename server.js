var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var port = process.env.PORT || 3000;

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){

    // ALguien se ha conectado
    console.log("Bienvenido de nuevo");

    socket.on('login', function(msg){
        socket.emit('home',
            {
                data: msg}
            );
        console.log(msg + " se ha logeado");
    });

    // Automatico
    socket.on('disconnect', function(){
        console.log('user disconnected');
    });
});

http.listen(port, function(){
    console.log('listening on *:' + port);
});