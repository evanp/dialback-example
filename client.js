/**
 * Module dependencies.
 */

var express = require("express"),
    Step = require("step"),
    wf = require("webfinger"),
    http = require("http"),
    https = require("https"),
    url = require("url"),
    querystring = require("querystring"),
    path = require("path"),
    config = require("./config"),
    crypto = require("crypto");

var randomString = function(bytes, callback) {

    crypto.randomBytes(bytes, function(err, buf) {
        var str;

        if (err) {
            callback(err, null);
        } else {
            str = buf.toString("base64");

            str = str.replace(/\+/g, "-");
            str = str.replace(/\//g, "_");
            str = str.replace(/=/g, "");

            callback(null, str);
        }
    });
};

var app = express();

app.configure(function(){
  app.set("port", 80);
  app.use(express.favicon());
  app.use(express.logger("dev"));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
});

app.get("/.well-known/host-meta.json", function(req, res) {
    res.json({
        links: [
            {
                rel: "lrdd",
                type: "application/json",
                template: "http://"+config.addclient+"/lrdd.json?uri={uri}"
            },
            {
                rel: "dialback",
                href: "http://"+config.addclient+"/dialback"
            }
        ]
    });
});

app.get("/lrdd.json", function(req, res) {
    var uri = req.query.uri,
        parts = uri.split("@"),
        username = parts[0],
        hostname = parts[1];

    res.json({
        links: [
            {
                rel: "dialback",
                href: "http://"+config.addclient+"/dialback"
            }
        ]
    });
});

var requests = {
};

app.post("/dialback", function(req, res, next) {

    var host = req.body.host,
        webfinger = req.body.webfinger,
        nonce = req.body.nonce,
        date = req.body.date,
        url = req.body.url,
        ms;

    if (!host || host != config.addclient) {
        res.status(400).send("Incorrect host");
        return;
    }

    if (!nonce) {
        res.status(400).send("No nonce");
        return;
    }

    if (!date) {
        res.status(400).send("No date");
        return;
    }

    ms = Date.parse(date);

    if (Math.abs(Date.now() - ms) > 600000) { // 5-minute window
        res.status(400).send("Invalid date");
        return;
    }

    if (requests.hasOwnProperty(url) &&
        requests[url].hasOwnProperty(ms) &&
        requests[url][ms].indexOf(nonce) !== -1) {
        res.status(200).send("OK");
        return;
    } else {
        res.status(400).send("Not my nonce");
        return;
    }
});

function showForm(res, augend, addend, result) {
    res.send("<html>" + 
             "<head>" +
             "<title>Add two numbers</title>" +
             "</head>" +
             "<body>" +
             "<h1>Add two numbers</h1>" +
             "<form action='/' method='post'>" +
             ((augend) ? "<input type='text' name='augend' size='3' value='"+augend+"' />" : "<input type='text' name='augend' size='3'/>") + " + " +
             ((addend) ? "<input type='text' name='addend' size='3' value='"+addend+"' />" : "<input type='text' name='addend' size='3'/> ") + " = " +
             ((result) ? "<input type='text' name='result' size='3' value='"+result+"' />" : "<input type='text' name='result' size='3'/> ") +
             "<input type='submit' />" +
             "</form>" +
             "</body>" +
             "</html>");
};

app.get("/", function(req, res, next) {
    showForm(res);
});

var dialbackCall = function(endpoint, params, callback) {
    var now = Math.round(Date.now()/1000)*1000;

    Step(
        function() {
            randomString(4, this);
        },
        function(err, str) {
            var options, mod, cb = this;
            if (err) throw err;
            if (!requests.hasOwnProperty(endpoint)) {
                requests[endpoint] = {};
            }
            if (!requests[endpoint].hasOwnProperty(now)) {
                requests[endpoint][now] = [];
            }
            requests[endpoint][now].push(str);
            options = url.parse(endpoint);
            options.method = "POST";
            options.headers = {
                authorization: "Dialback host=\"" + config.addclient + "\" nonce=\"" + str + "\"",
                date: (new Date(now)).toUTCString(),
                "Content-Type": "application/x-www-form-urlencoded"
            };
            mod = (options.protocol == "https://") ? https : http;
            var req = mod.request(options, function(res) {
                var body = "";
                res.setEncoding("utf8");
                res.on("data", function(chunk) {
                    body = body + chunk;
                });
                res.on("error", function(err) {
                    cb(err, null, null);
                });
                res.on("end", function() {
                    if (res.statusCode < 200 || res.statusCode > 300) {
                        cb(new Error("Error " + res.statusCode + ": " + body), null, null);
                    } else {
                        cb(null, body, res);
                    }
                });
            });

            req.on("error", function(err) {
                cb(err, null, null);
            });

            req.write(querystring.stringify(params));

            req.end();
        },
        callback
    );
};

app.post("/", function(req, res, next) {
    var augend = parseInt(req.body.augend, 10),
        addend = parseInt(req.body.addend, 10),
        endpoint = "http://" + config.addserver + "/add";
        
    Step(
        function() {
            dialbackCall(endpoint, {augend: augend, addend: addend}, this);
        },
        function(err, body, dbres) {
            if (err) {
                next(err);
            } else {
                showForm(res, augend, addend, parseInt(body, 10));
            }
        }
    );
});

app.configure("development", function(){
  app.use(express.errorHandler());
});

http.createServer(app).listen(app.get("port"), function(){
  console.log("Express server listening on port " + app.get("port"));
});
