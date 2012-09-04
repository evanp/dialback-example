/**
 * Module dependencies.
 */

var express = require('express')
  , Step = require("step")
  , wf = require("webfinger")
  , http = require('http')
  , https = require('https')
  , url = require('url')
  , querystring = require('querystring')
  , path = require('path')
  , config = require('./config')
  , crypto = require("crypto");

var randomString = function(bytes, callback) {

    crypto.randomBytes(bytes, function(err, buf) {
        var str;

        if (err) {
            callback(err, null);
        } else {
            str = buf.toString("base64");

            // XXX: optimize me

            // XXX: optimize me

            str = str.replace(/\+/g, "-");
            str = str.replace(/\//g, "_");
            str = str.replace(/=/g, "");

            callback(null, str);
        }
    });
};

var app = express();

app.configure(function(){
  app.set('port', 80);
  app.use(express.favicon());
  app.use(express.logger('dev'));
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

app.post('/dialback', function(req, res, next) {
    
});

function showForm(req, res) {
    res.send("<html>" + 
             "<head>" +
             "<title>Add two numbers</title>" +
             "</head>" +
             "<body>" +
             "<h1>Add two numbers</h1>" +
             "<form action='/' method='post'>" +
             "<input type='text' name='augend' size='3'/> + " +
             "<input type='text' name='addend' size='3'/> = " +
             "<input type='text' name='result' size='3'/>" +
             "<input type='submit' />" +
             "</form>" +
             "</body>" +
             "</html>");
};

app.get("/", function(req, res, next) {
    showForm(res);
});

var calls = {};

var dialbackCall = function(url, params, callback) {
    var now = Date.now();

    Step(
        function() {
            randomString(4, this);
        },
        function(err, str) {
            if (err) throw err;
            if (!calls.hasOwnProperty(url)) {
                calls[url] = {};
            }
            if (!calls[url].hasOwnProperty(now)) {
                calls[url][now] = [];
            }
            calls[url][now].push(str);
        }
    );
};

app.post("/", function(req, res, next) {
    var augend = parseInt(req.body.augend, 10),
        addend = parseInt(req.body.addend, 10),
        url = "http://" + config.addserver + "/add";
        
    Step(
        function() {
            dialbackCall(url, {augend: augend, addend: addend}, this);
        },
        function(err, body, res) {
            if (err) {
                next(err);
            } else {
                showForm(res, augend, addend, body.result);
            }
        }
    );
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
