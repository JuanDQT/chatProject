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
        var response = {};
        response.contacts = {};
        var data = JSON.parse(JSON.stringify(msg));

        console.log("[LOGIN]", JSON.stringify(msg));

        all[data['clientID']] = socket.id;
        db.query('UPDATE Users set online = 1 where id = (?)', parseInt(data['id_user']));

        var query = "SELECT id, name, avatar, online, last_seen, banned, false as pending FROM Users where id in " +
            "(" +
            "select id_user_to from Contacts where accepted = 1 and (id_user_from = (?) ) " +
            "union all " +
            "select id_user_from from Contacts where accepted = 1 and (id_user_to = (?) ))";

        db.query(query, [data['id_user'], data['id_user']], function (err, result, fields) {
            if (err) throw err;
            var idUsersDisponibles = result.map( t => t["id"]).map(String);
            // var idUsersDisponibles = result.map( t => t["id"]);
            // db.query("SELECT id, name, avatar, online, last_seen, banned FROM Users where id != (?)", data['FROM'], function (err, result, fields) {
            response.contacts.disable = [];
            response.contacts.add = [];

            if (data["ids"] == null || data["ids"].length === 0) {
                console.log("Anadimos a todos");
                response.contacts.add = result;

                // io.sockets.to(socket.id).emit("GET_ALL_CHATS_AVAILABLE", JSON.parse(JSON.stringify(result)));
                console.log("RETURN: " + JSON.stringify(response));
                io.sockets.to(socket.id).emit("GET_LOGIN_RESPONSE", JSON.parse(JSON.stringify(response)));
            } else {

                // Segun los ids que nos dan, buscamos si estan entre los ids de la query(Si son contactos)
                var contactIDDisabled = [];
                for(var x = 0; x < data["ids"].length; x++) {
                    if (!idUsersDisponibles.includes(data["ids"][x])) {
                        // Para update!
                        contactIDDisabled.push(data["ids"][x]);
                    }
                }

                if (contactIDDisabled.length > 0)
                    console.log("Actualizamos contactos");

                response.contacts.disable = contactIDDisabled;

                var idsAnadir = getContactosId(idUsersDisponibles, data["ids"]);

                if (idsAnadir.length > 0) {

                    var query = "SELECT id, name, avatar, online, last_seen, banned, false as pending FROM Users where id in " +
                        "(" +
                        "select id_user_to from Contacts where accepted = 1 and (id_user_from = (?) or id_user_to in (?) ) " +
                        "union all " +
                        "select id_user_from from Contacts where accepted = 1 and (id_user_to = (?) or id_user_from in (?) ))";

                    db.query(query, [data['id_user'], idsAnadir.join(","), data['id_user'], idsAnadir.join(",")], function (err, result2, fields) {
                        if (err) {
                            throw err;
                        }
                        response.contacts.add = result2;
                        console.log("RETURN: " + JSON.stringify(response));
                        io.sockets.to(socket.id).emit("GET_LOGIN_RESPONSE", JSON.parse(JSON.stringify(response)));
                    });
                } else {
                    console.log("RETURN: " + JSON.stringify(response));
                    io.sockets.to(socket.id).emit("GET_LOGIN_RESPONSE", JSON.parse(JSON.stringify(response)));
                }

            };


        });

        return;
        db.query("SELECT id, id_pda, id_user_from as 'from', id_user_to as 'to', message, date_format(fecha_envio, '%d/%m/%Y %H:%i:%s') as date_created FROM Messages where fecha_recepcion is null and id_user_to = (?)", data['clientID'], function (err, result, fields) {
            if (err) throw err;

            if (Object.keys(JSON.parse(JSON.stringify(result))).length > 0) {
                result.forEach(function (row) {
                    io.sockets.to(all[data['clientID']]).emit("GET_SINGLE_MESSAGE", JSON.parse(JSON.stringify(row)));
                    console.log("Descargar: " + JSON.stringify(row));
                });
            }
        });
        return;
        db.query("select id from Messages where id_user_to = (?) and fecha_recepcion is not null and fecha_lectura is null", data['clientID'], function (err, result, fields) {
            if (err) throw err;
            if (Object.keys(JSON.parse(JSON.stringify(result))).length > 0)
                io.sockets.to(all[data['clientID']]).emit("GET_PENDING_MESSAGES_READED", JSON.parse(JSON.stringify(result)));
        });

    });

    socket.on('USER_IS_TYPING', function (msg) {

        var data = JSON.parse(JSON.stringify(msg));
        console.log("[USER_IS_TYPING]: " + JSON.stringify(msg));

        var socketIDTO = all[data['to']];

        io.sockets.to(socketIDTO).emit("GET_USER_IS_TYPING", data);

    });

    socket.on('MESSAGE_TO', function (msg) {

        var data = JSON.parse(JSON.stringify(msg));
        // console.log("[MESSAGE_TO]: " + JSON.stringify(msg));
        var socketIDTO = all[data['to']];

        db.query('INSERT INTO Messages(id_pda, id_user_from, id_user_to, message, fecha_envio, fecha_recepcion_servidor) VALUES (?, ?, ?, ?, ?, NOW())', [data['id_pda'], data['from'], data['to'], data['message'], data['date_created']], function (err, result, fields) {
            if (err)
                throw err;
            else {
                io.sockets.to(all[data['from']]).emit("GET_UPDATE_MESSAGE_ID_SERVER", {
                    "id_pda": data['id_pda'],
                    "id_server": result.insertId
                });
                data.id = result.insertId;

                console.log("[MESSAGE_TO]: " + JSON.stringify(data));
                io.sockets.to(socketIDTO).emit("GET_SINGLE_MESSAGE", JSON.parse(JSON.stringify(data)));
            }
        });
    });

    socket.on('MESSAGE_CONFIRM_RECEPCION', function (msg) {
        var data = JSON.parse(JSON.stringify(msg));
        console.log("[MESSAGE_CONFIRM_RECEPCION]: " + JSON.stringify(msg));
        db.query("UPDATE Messages set fecha_recepcion = (?) where id = (?)", [data['fecha_recepcion'], data['id_server']]);
    });

    socket.on('MESSAGE_CONFIRM_LECTURA', function (msg) {
        var data = JSON.parse(JSON.stringify(msg));
        console.log("[MESSAGE_CONFIRM_LECTURA]: " + JSON.stringify(msg));
        db.query("UPDATE Messages set fecha_lectura = (?) where id = (?)", [data['fecha_lectura'], data['id_server']]);
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

        var query = "SELECT id, name, avatar, online, last_seen, banned FROM Users where id in " +
            "(" +
            "select id_user_to from Contacts where accepted = 1 and (id_user_from = (?) ) " +
            "union all " +
            "select id_user_from from Contacts where accepted = 1 and (id_user_to = (?) ))";

        db.query(query, [data['FROM'], data['FROM']], function (err, result, fields) {
            // db.query("SELECT id, name, avatar, online, last_seen, banned FROM Users where id != (?)", data['FROM'], function (err, result, fields) {
            if (err) throw err;
            console.log(JSON.stringify(result));

            io.sockets.to(all[data['FROM']]).emit("GET_ALL_CHATS_AVAILABLE", JSON.parse(JSON.stringify(result)));
        });

    });

    socket.on('SEARCH_USERS_BY_NAME', function (msg) {
        var data = JSON.parse(JSON.stringify(msg));
        console.log("[SEARCH_USERS_BY_NAME]: " + JSON.stringify(msg));

        // TODO: por pruebas
        db.query("SELECT id, name, avatar, online, last_seen, banned FROM Users", function (err, result, fields) {
            // db.query("SELECT id, name, avatar, online, last_seen, banned FROM Users where id != (?) and banned = 0 and name like '%" + data['name'] +"%'", data['user_from'], function (err, result, fields) {
            if (err) throw err;
            console.log(JSON.stringify(result));

            io.sockets.to(all[data['user_from']]).emit("GET_SEARCH_USERS_BY_NAME", JSON.parse(JSON.stringify(result)));
        });
    });

    // Automatico
    socket.on('disconnect', function () {


        var clientID = Object.keys(all).find(key => all[key] === socket.id
    )
        ;

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

function getContactosId(all, local) {
    var ids = [];

    for(var i = 0; i < all.length; i ++) {
        if (!local.includes(all[i])) {
            ids.push(all[i]);
        }
    }

    return ids;
}