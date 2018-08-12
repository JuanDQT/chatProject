var mysql = require('mysql');

var con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "root",
    database: "Chat"
});


con.connect(function(err) {
    if (err) throw err;
    con.query("SELECT * FROM Users", function (err, result, fields) {
        if (err) throw err;
        console.log(result);
    });
});

/*
con.connect(function(err) {
    if (err) throw err;
    console.log("Connected!");
});
*/
