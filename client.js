// client.js
//
// Client that uses Dialback authentication
//
// Copyright 2012, StatusNet Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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

var saveRequest = function(id, endpoint, ms, nonce) {
    if (!requests.hasOwnProperty(id)) {
        requests[id] = {};
    }
    if (!requests[id].hasOwnProperty(endpoint)) {
        requests[id][endpoint] = {};
    }
    if (!requests[id][endpoint].hasOwnProperty(ms)) {
        requests[id][endpoint][ms] = [];
    }
    requests[id][endpoint][ms].push(nonce);
};

setTimeout(function() {
    var id, url, ms, now = Date.now(), toDel, i;
    
    for (id in requests) {
        for (url in requests[id]) {
            toDel = [];
            for (ms in requests[id][url]) {
                if (Math.abs(now - ms) > 600000) {
                    toDel.push(ms);
                }
            }
            for (i = 0; i < toDel.length; i++) {
                console.log("Discarding request data for "+id+" requesting "+url+" at "+(new Date(toDel[i])).toUTCString());
                delete requests[id][url][toDel[i]];
            }
        }
        // XXX: clear out empty requests[id][url] and requests[id]
    }

}, 60000);

app.post("/dialback", function(req, res, next) {

    var host = req.body.host,
        webfinger = req.body.webfinger,
        nonce = req.body.nonce,
        date = req.body.date,
        url = req.body.url,
        id = host || webfinger,
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

    if (Math.abs(Date.now() - ms) > 300000) { // 5-minute window
        res.status(400).send("Invalid date");
        return;
    }

    if (requests.hasOwnProperty(id) &&
        requests[id].hasOwnProperty(url) &&
        requests[id][url].hasOwnProperty(ms) &&
        requests[id][url][ms].indexOf(nonce) !== -1) {
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
            var options, mod, cb = this, id = config.addclient;
            if (err) throw err;
            saveRequest(config.addclient, endpoint, now, str);
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
