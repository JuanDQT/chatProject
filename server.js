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

var all = {};

io.on('connection', function (socket) {

    // NOTE: Solo entrara aqui la primera vez. Quiza anadir alguna funcionalidad mas en un futuro para el primer login.
    // Por lo demas, es bastante parecido al reconnect.
    socket.on('LOGIN', function (msg) {
        var data = JSON.parse(JSON.stringify(msg));

        all[data['id_user']] = socket.id;

        console.log(msg);

        var response = {};

        db.query('UPDATE Users set online = 1 where id = (?)', parseInt(data['id_user']));


        var query = "SELECT id, name, avatar, online, last_seen, banned FROM Users where id in " +
            "(" +
            "select id_user_to from Contacts where (id_user_from = (?) ) " +
            "union all " +
            "select id_user_from from Contacts where (id_user_to = (?) ))";

        db.query(query, [data['id_user'], data['id_user']], function (err, resultUsers, fields) {
            if (err) throw err;

            response.users = resultUsers;

            var query = "select id_user_from, id_user_to, status" +
                " from Contacts where id_user_to = (?) or id_user_from = (?) ";

            db.query(query, [data['id_user'], data['id_user']], function (err, resultContacts, fields) {
                if (err) throw err;
                response.contacts = resultContacts;

                console.log("[GET_CONNECT_RESPONSE][OUTPUT]: " + JSON.stringify(response));
                io.sockets.to(socket.id).emit("GET_CONNECT_RESPONSE", response);
            });
        });
    });

    socket.on('RECONNECT', function (msg) {

        var response = {};
        response.contacts = [];
        response.users = [];

        var data = JSON.parse(JSON.stringify(msg));
        all[data['id_user_from']] = socket.id;

        console.log("[RECONNECT][INPUT]", msg);

        query = "select *" +
            " from Contacts where id_user_from = (?) or id_user_to = (?) ";

        db.query(query, [data['id_user_from'], data['id_user_from']], function (err, result, fields) {
            if (err) throw err;

            response.contacts = result;

            var usersIdDatabase = result.map(m => m.id_user_from).concat(result.map(m => m.id_user_to)).filter( f => f != msg.id_user_from);
            var idsToSearch = usersIdDatabase.filter(i => data.users_id.map(Number).indexOf(i) < 0);

            console.log("A anadir: " + idsToSearch);

            var params = [];

            if (idsToSearch.length > 0) {
                query = "SELECT id, name, avatar, online, last_seen, banned FROM Users where id in (?)";

                db.query(query, idsToSearch.join(','), function (err, resultUsers, fields) {
                    if (err) throw err;

                    response.users = resultUsers;

                    console.log("[RECONNECT][OUTPUT]: " + JSON.stringify(response));
                    io.sockets.to(socket.id).emit("GET_CONNECT_RESPONSE", response);
                });

            } else {
                // Solo envismos contactos
                console.log("NO buscamos usuarios");
                console.log("[RECONNECT][OUTPUT]: " + JSON.stringify(response));
                io.sockets.to(socket.id).emit("GET_CONNECT_RESPONSE", response);
            }

        });

        db.query("select id from Messages where id_user_to = (?) and fecha_recepcion is not null and fecha_lectura is null", data['id_user_from'], function (err, result, fields) {
            if (err) throw err;
            if (Object.keys(JSON.parse(JSON.stringify(result))).length > 0)
                io.sockets.to(socket.id).emit("GET_PENDING_MESSAGES_READED", JSON.parse(JSON.stringify(result)));
        });
    });

    socket.on('ALL_MESSAGES', function (msg) {

        var data = JSON.parse(JSON.stringify(msg));
        console.log("[ALL_MESSAGES]", JSON.stringify(msg));


        db.query("SELECT id, id_pda, id_user_from as 'from', id_user_to as 'to', message, date_format(fecha_envio, '%d/%m/%Y %H:%i:%s') as date_created FROM Messages where fecha_recepcion is null and id_user_to = (?)", data['id_user_from'], function (err, resultMessages, fields) {
            if (err) throw err;

            if (Object.keys(resultMessages).length > 1) {
                for(var i = 0; i < Object.keys(resultMessages).length; i++)
                    io.sockets.to(socket.id).emit("GET_SINGLE_MESSAGE", JSON.parse(JSON.stringify(resultMessages[i])));
            } else {
                console.log("[ALL_MESSAGES]: " + JSON.stringify(resultMessages));
                io.sockets.to(socket.id).emit("GET_ALL_MESSAGES", resultMessages);
            }
        });

        return;
        // Lo hacemos en un socket independiente para no sobrecargar de ifs el home
        var query = "select id_user_from, 'true' as status from Contacts where accepted = 0 and id_user_from != ?";

        db.query(query, data['id_user'], function (err, result, fields) {
            if (err) throw err;
            console.log("[GET_ASK_REQUEST_CONTACT_STATUS]", JSON.stringify(result));

            if (Object.keys(result).length > 0) {

                for(var i = 0; i < Object.keys(result).length; i++)
                    io.sockets.to(socket.id).emit("GET_ASK_REQUEST_CONTACT_STATUS", JSON.parse(JSON.stringify(result[i])));
            }

            for (var j = 0; j < Object.keys(data["ids_contacts_pending"]).length; j++) {
                // for (var j = 0; j < data["ids_contacts_pending"].size; j ++) {

                var query = "select count(*) as contador from Contacts where accepted = 0 and id_user_from = ? and id_user_to = ?";

                var localID = data["ids_contacts_pending"][j];
                db.query(query, [data['id_user'], data["ids_contacts_pending"][j]], function (err, result, fields) {
                    if (err) throw err;
                    console.log("***" + result[0].contador);
                    if (parseInt(result[0].contador) === 0) {
                        console.log("ids_contacts_pending" + localID);
                        var requestTo = {"id_user_from": localID, "status": false};
                        console.log("[GET_ASK_REQUEST_CONTACT_STATUS]", JSON.stringify(requestTo));
                        io.sockets.to(socket.id).emit("GET_ASK_REQUEST_CONTACT_STATUS", JSON.parse(JSON.stringify(requestTo)));
                    }
                });
            }

        });
        return;


        /*
                db.query("SELECT id, id_pda, id_user_from as 'from', id_user_to as 'to', message, date_format(fecha_envio, '%d/%m/%Y %H:%i:%s') as date_created FROM Messages where fecha_recepcion is null and id_user_to = (?)", data['clientID'], function (err, result, fields) {
            if (err) throw err;

            if (Object.keys(JSON.parse(JSON.stringify(result))).length > 0) {
                result.forEach(function (row) {
                    io.sockets.to(all[data['clientID']]).emit("GET_SINGLE_MESSAGE", JSON.parse(JSON.stringify(row)));
                    console.log("Descargar: " + JSON.stringify(row));
                });
            }
        });
         */

        // Pregunta al movil si tiene mensajes leidos pendientes de enviar. enviar con otro socket
        return;

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

    socket.on('SEARCH_USERS_BY_NAME', function (msg) {
        var data = JSON.parse(JSON.stringify(msg));
        console.log("[SEARCH_USERS_BY_NAME]: " + JSON.stringify(msg));

        var sql = "SELECT id, name, avatar, online, last_seen, banned, " +
            "(" +
            "case" +
            " when (select count(*) from contacts where (id_user_from = ? and id_user_to = u.id) or (id_user_from = u.id and id_user_to = ?)) = 0 THEN NULL" +
            " else ( " +
            " case " +
            " when (select accepted from contacts where (id_user_from = ? and id_user_to = u.id) or (id_user_from = u.id and id_user_to = ?) ) = 0 THEN TRUE" +
            " else FALSE" +
            " end" +
            " )" +
            " END" +
            " ) as pending" +
            " FROM Users u" +
            " where id != ?" +
            " and name like '%" + data['name'] +"%';";

        db.query(sql, [data['id_user_from'],data['id_user_from'],data['id_user_from'],data['id_user_from'],data['id_user_from']],function (err, result, fields) {
            if (err) throw err;
            console.log(JSON.stringify(result));

            io.sockets.to(socket.id).emit("GET_SEARCH_USERS_BY_NAME", JSON.parse(JSON.stringify(result)));
        });
    });

    socket.on('SET_CONTACTO_STATUS', function (msg) {
        var data = JSON.parse(JSON.stringify(msg));
        var socketIDTO = all[data['id_user_to']];
        // TODO: probar estos 4 metodos.
        console.log("[SET_CONTACTO_STATUS]: " + JSON.stringify(msg));
        var query = "";
        switch (data["action"]) {
            case "SOLICITAR_CONTACTO":
                query = "select count(*) as existe" +
                    " from contacts" +
                    " where (id_user_from = ? and id_user_to = ?) or (id_user_from = ? and id_user_to = ?)";

                db.query(query, [data['id_user_from'], data['id_user_to'], data['id_user_to'], data['id_user_from']], function (err, result, fields) {
                    if (err) throw err;
                    console.log("RESULT: " + result[0].existe);
                    if (result[0].existe === 0) {
                        query = "INSERT INTO Contacts (id_user_from, id_user_to) VALUES (?, ?)";
                        db.query(query, [data['id_user_from'], data['id_user_to']], function (err, res) {});

                        var requestTo = {"id_user_from": data['id_user_from'], "status": true};
                        // Tambien cada movil cada vez que se conecta a internet, ha de pregunta si tiene peticiones de contacto
                        console.log("[GET_ASK_REQUEST_CONTACT_STATUS]", JSON.stringify(requestTo));
                        io.sockets.to(socketIDTO).emit("GET_ASK_REQUEST_CONTACT_STATUS", JSON.parse(JSON.stringify(requestTo)));
                    }
                });
                break;
            case "CANCELAR_CONTACTO":
            case "DENEGAR_CONTACTO":
            case "R": // TODO: delete contacto
                query = "delete" +
                    " from contacts" +
                    " where (id_user_from = ? and id_user_to = ?) or (id_user_from = ? and id_user_to = ?)";

                db.query(query, [data['id_user_from'], data['id_user_to'], data['id_user_to'], data['id_user_from']], function (err, result, fields) {
                    if (err) throw err;
                    var requestTo = {"id_user_from": data['id_user_from'], type: "ACEPTAR_CONTACTO"};
                    console.log("[GET_ASK_REQUEST_CONTACT_STATUS]", JSON.stringify(requestTo));
                    io.sockets.to(socketIDTO).emit("GET_ASK_REQUEST_CONTACT_STATUS", JSON.parse(JSON.stringify(requestTo)));
                });
                break;
            case "ACEPTAR_CONTACTO":
                // quitar el pending al otro contacto
                db.query('UPDATE Contacts set accepted = 1 where id_user_from = (?) and id_user_to', [data["id_user_to"], data["id_user_from"]], function (err, result, fields) {
                    if (err) throw err;

                    var requestTo = {"id_user_from": data['id_user_from'], type: "ACEPTAR_CONTACTO"};
                    io.sockets.to(socketIDTO).emit("GET_ASK_REQUEST_CONTACT_STATUS", JSON.parse(JSON.stringify(requestTo)));
                });

                break;

        }
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

function getContactosId(all, local) {
    var ids = [];

    for (var i = 0; i < all.length; i++) {
        if (!local.includes(all[i])) {
            ids.push(all[i]);
        }
    }

    return ids;
}

function getAllUsers(idUserFrom) {
}