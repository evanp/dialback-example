// server.js
//
// Server that requires Dialback authentication
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

var express = require('express'),
    Step = require("step"),
    wf = require("webfinger"),
    http = require('http'),
    https = require('https'),
    url = require('url'),
    querystring = require('querystring'),
    path = require('path'),
    config = require("./config");

var app = express();

var discoverHostEndpoint = function(host, callback) {

    Step(
        function() {
            wf.hostmeta(host, this);
        },
        function(err, jrd) {
            var dialbacks;
            if (err) {
                callback(err, null);
                return;
            }
            if (!jrd.hasOwnProperty("links")) {
                callback(new Error("No links in host-meta for " + host), null);
                return;
            }
            dialbacks = jrd.links.filter(function(link) {
                return (link.hasOwnProperty("rel") && link.rel == "dialback" && link.hasOwnProperty("href"));
            });
            if (dialbacks.length === 0) {
                callback(new Error("No dialback links in host-meta for " + host), null);
                return;
            }
            callback(null, dialbacks[0].href);
        }
    );

};

var discoverWebfingerEndpoint = function(address, callback) {

    Step(
        function() {
            wf.hostmeta(address, this);
        },
        function(err, jrd) {
            var dialbacks;
            if (err) {
                callback(err, null);
                return;
            }
            if (!jrd.hasOwnProperty("links")) {
                callback(new Error("No links in lrdd for " + address), null);
                return;
            }
            dialbacks = jrd.links.filter(function(link) {
                return (link.hasOwnProperty("rel") && link.rel == "dialback");
            });
            if (dialbacks.length === 0) {
                callback(new Error("No dialback links in lrdd for " + address), null);
                return;
            }
            callback(null, dialbacks[0]);
        }
    );
};

var discoverEndpoint = function(fields, callback) {
    if (fields.hasOwnProperty("host")) {
        discoverHostEndpoint(fields.host, callback);
    } else if (fields.hasOwnProperty("webfinger")) {
        discoverWebfingerEndpoint(fields.webfinger, callback);
    }
};

var postToEndpoint = function(endpoint, params, callback) {
    var options = url.parse(endpoint),
        pstring = querystring.stringify(params);

    options.method = "POST";
    options.headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    };

    var mod = (options.protocol == "https://") ? https : http;

    var req = mod.request(options, function(res) {
        var body = "";
        res.setEncoding("utf8");
        res.on("data", function(chunk) {
            body = body + chunk;
        });
        res.on("error", function(err) {
            callback(err, null, null);
        });
        res.on("end", function() {
            if (res.statusCode < 200 || res.statusCode > 300) {
                callback(new Error("Error " + res.statusCode + ": " + body), null, null);
            } else {
                callback(null, body, res);
            }
        });
    });

    req.on("error", function(err) {
        callback(err, null, null);
    });

    req.write(pstring);

    req.end();
};

var requests = {
};

var saveRequest = function(id, url, date, nonce) {

    var ms = Date.parse(date);

    if (!requests.hasOwnProperty(id)) {
        requests[id] = {};
    }

    if (!requests[id].hasOwnProperty(url)) {
        requests[id][url] = {};
    }

    if (!requests[id][url].hasOwnProperty(ms)) {
        requests[id][url][ms] = [];
    }

    requests[id][url][ms].push(nonce);
};

var seenRequest = function(id, url, date, nonce) {

    var ms = Date.parse(date);

    return (requests.hasOwnProperty(id) &&
            requests[id].hasOwnProperty(url) &&
            requests[id][url].hasOwnProperty(ms) &&
            requests[id][url][ms].indexOf(nonce) !== -1);
};

// Clear out old requests every 1 minute

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

var dialback = function(req, res, next) {

    var auth,
        now = Date.now(),
        fields,
        unauthorized = function() {
            res.status(401);
            res.set({
                "WWW-Authentication": "Dialback",
                "Content-Type": "text/plain"
            });
            res.send("Unauthorized");
        },
        parseFields = function(str) {
            var fstr = str.substr(9); // everything after "Dialback "
            var pairs = fstr.split(/\s+/); // XXX: won't handle blanks inside values well
            var fields = {};
            pairs.forEach(function(pair) {
                var kv = pair.split("="),
                    key = kv[0],
                    value = kv[1].replace(/^"|"$/g, "");
                fields[key] = value;
            });
            return fields;
        };

    if (!req.headers.hasOwnProperty("authorization")) {
        unauthorized();
        return;
    }

    auth = req.headers.authorization;

    if (auth.substr(0, 9) != "Dialback ") {
        unauthorized();
        return;
    }

    fields = parseFields(auth);

    // must have a nonce

    if (!fields.hasOwnProperty("nonce")) {
        unauthorized();
        return;
    }

    // must have a webfinger or host field

    if (!fields.hasOwnProperty("host") && !fields.hasOwnProperty("webfinger")) {
        unauthorized();
        return;
    }

    fields.url = "http://" + config.addserver + req.originalUrl;
    
    if (!req.headers.hasOwnProperty("date")) {
        unauthorized();
        return;
    }

    fields.date = req.headers.date;

    if (Math.abs(Date.parse(fields.date) - now) > 300000) { // 5-minute window
        unauthorized();
        return;
    }

    if (seenRequest(fields.host || fields.webfinger, 
                    fields.url,
                    fields.date,
                    fields.nonce)) {
        unauthorized();
        return;
    }

    saveRequest(fields.host || fields.webfinger, 
                fields.url,
                fields.date,
                fields.nonce);

    Step(
        function() {
            discoverEndpoint(fields, this);
        },
        function(err, endpoint) {
            if (err) throw err;
            postToEndpoint(endpoint, fields, this);
        },
        function(err, body, res) {
            if (err) {
                unauthorized();
            } else if (fields.hasOwnProperty("host")) {
                req.remoteHost = fields.host;
                next();
            } else if (fields.hasOwnProperty("webfinger")) {
                req.remoteUser = fields.webfinger;
                next();
            }
        }
    );
};

app.configure(function(){
  app.set('port', 80);
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

/**
 * Add two numbers and return the result
 */

var add = function(req, res, next) {
    var augend, addend, result;

    try {
        augend = parseInt(req.body.augend, 10);
        addend = parseInt(req.body.addend, 10);
        result = augend + addend;
        res.status(200).send("" + result);
    } catch (err) {
        next(err);
    }

    console.log(((req.remoteHost) ? req.remoteHost : req.remoteUser) + " added " + augend + " plus " + addend);
};

app.post('/add', dialback, add);

http.createServer(app).listen(app.get('port'), function(){
  console.log("Dialback server listening on port " + app.get('port'));
});
